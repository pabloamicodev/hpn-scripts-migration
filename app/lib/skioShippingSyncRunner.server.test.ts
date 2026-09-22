import { describe, expect, it } from "vitest";
import { runSkioShippingSync, DeliveryPriceOverrideVerificationError } from "./skioShippingSyncRunner.server";
import type { RawSkioSubscription, SkioGraphQLProxyFn } from "./skioApi.server";
import type { SkioShippingTiersConfig } from "./skioShippingTiers";

const VARIANT_A = "gid://shopify/ProductVariant/1";

function rawSubscription(overrides: Partial<RawSkioSubscription> = {}): RawSkioSubscription {
  return {
    id: "sub-1",
    status: "ACTIVE",
    cyclesCompleted: 1,
    nextBillingDate: "2026-09-23T07:00:00+00:00",
    deliveryPrice: 6.99,
    deliveryPriceOverride: null,
    BillingPolicy: { interval: "DAY", intervalCount: 90 },
    SubscriptionLines: [
      { priceWithoutDiscount: 60, quantity: 1, removedAt: null, ProductVariant: { platformId: VARIANT_A } },
    ],
    ...overrides,
  };
}

const CONFIG: SkioShippingTiersConfig = {
  tiers: [
    {
      id: "three-month-over-50",
      name: "3-month, over $50",
      subscriptionDurationMonths: 3,
      minSubtotal: 50,
      maxSubtotal: null,
      productVariantIds: null,
      cycleOverrides: [{ cycle: 1, override: { amount: 0 } }],
      defaultOverride: { amount: 1.99 },
    },
  ],
};

/**
 * In-memory fake of the Skio API surface used by the runner. Confirmed live
 * (see skioApi.server.ts) that setDeliveryPriceOverride writes precisely to
 * deliveryPrice (dollars, decimal) — this fake mirrors that, not the
 * deliveryPriceOverride Int flag, which isn't a price at all.
 */
function makeFakeSkio(initial: RawSkioSubscription[]) {
  const store = new Map(initial.map((s) => [s.id, { ...s }]));
  const calls: { op: string; args: unknown }[] = [];

  const proxy: SkioGraphQLProxyFn = async <TData>(query: string, variables?: Record<string, unknown>) => {
    if (query.includes("ListActiveSubscriptions")) {
      calls.push({ op: "list", args: variables });
      const all = Array.from(store.values());
      return { data: { Subscriptions: variables?.offset ? [] : all } } as { data: TData };
    }
    if (query.includes("GetSkioSubscription")) {
      const id = variables?.id as string;
      calls.push({ op: "get", args: id });
      return { data: { SubscriptionByPk: store.get(id) ?? null } } as { data: TData };
    }
    if (query.includes("SetDeliveryPriceOverride")) {
      const input = variables?.input as { subscriptionId: string; deliveryPrice: number };
      calls.push({ op: "set", args: input });
      const sub = store.get(input.subscriptionId);
      if (sub) sub.deliveryPrice = input.deliveryPrice;
      return { data: { setDeliveryPriceOverride: { subscriptionId: input.subscriptionId } } } as { data: TData };
    }
    throw new Error(`Unexpected query in fake Skio: ${query}`);
  };

  return { proxy, store, calls };
}

describe("runSkioShippingSync — happy paths", () => {
  it("writes and verifies an override against deliveryPrice", async () => {
    const { proxy, calls } = makeFakeSkio([rawSubscription({ cyclesCompleted: 1 })]);

    const results = await runSkioShippingSync(proxy, CONFIG);

    expect(results).toEqual([
      { subscriptionId: "sub-1", matchedTierId: "three-month-over-50", targetCycle: 2, overrideAmount: 1.99, applied: true },
    ]);
    expect(calls.filter((c) => c.op === "set")).toHaveLength(1);
    expect(calls.filter((c) => c.op === "get")).toHaveLength(1); // the verification read-back
  });

  it("skips a subscription with no matching tier", async () => {
    const { proxy, calls } = makeFakeSkio([rawSubscription({ BillingPolicy: { interval: "DAY", intervalCount: 30 } })]);

    const results = await runSkioShippingSync(proxy, CONFIG);

    expect(results[0]).toMatchObject({ matchedTierId: null, applied: false });
    expect(calls.some((c) => c.op === "set")).toBe(false);
  });

  it("skips a subscription whose billing interval isn't DAY-based", async () => {
    const { proxy } = makeFakeSkio([rawSubscription({ BillingPolicy: { interval: "WEEK", intervalCount: 12 } })]);

    const results = await runSkioShippingSync(proxy, CONFIG);

    expect(results).toEqual([]);
  });

  it("returns an empty array when there are no active subscriptions", async () => {
    const { proxy } = makeFakeSkio([]);
    expect(await runSkioShippingSync(proxy, CONFIG)).toEqual([]);
  });
});

describe("runSkioShippingSync — avoiding redundant writes", () => {
  it("does not call setDeliveryPriceOverride when deliveryPrice already matches the decision", async () => {
    const { proxy, calls } = makeFakeSkio([rawSubscription({ cyclesCompleted: 1, deliveryPrice: 1.99 })]);

    const results = await runSkioShippingSync(proxy, CONFIG);

    expect(results[0]).toMatchObject({ applied: false });
    expect(calls.some((c) => c.op === "set")).toBe(false);
  });

  it("writes when deliveryPrice is for a different amount than the current decision", async () => {
    const { proxy, calls } = makeFakeSkio([rawSubscription({ cyclesCompleted: 1, deliveryPrice: 2.5 })]);

    const results = await runSkioShippingSync(proxy, CONFIG);

    expect(results[0]).toMatchObject({ applied: true });
    expect(calls.filter((c) => c.op === "set")).toHaveLength(1);
  });

  it("writes when overrideAmount is 0 (free) and the current deliveryPrice is nonzero", async () => {
    const { proxy, calls } = makeFakeSkio([rawSubscription({ cyclesCompleted: 0, deliveryPrice: 6.99 })]);

    const results = await runSkioShippingSync(proxy, CONFIG);

    expect(results[0]).toMatchObject({ overrideAmount: 0, applied: true });
    expect(calls.filter((c) => c.op === "set")).toHaveLength(1);
  });

  it("does not write when overrideAmount is 0 and deliveryPrice is already 0", async () => {
    const { proxy, calls } = makeFakeSkio([rawSubscription({ cyclesCompleted: 0, deliveryPrice: 0 })]);

    const results = await runSkioShippingSync(proxy, CONFIG);

    expect(results[0]).toMatchObject({ overrideAmount: 0, applied: false });
    expect(calls.some((c) => c.op === "set")).toBe(false);
  });
});

describe("runSkioShippingSync — verification halts on a genuine mismatch", () => {
  it("throws DeliveryPriceOverrideVerificationError and stops processing further subscriptions", async () => {
    const setCalls: string[] = [];
    const brokenProxy: SkioGraphQLProxyFn = async <TData>(query: string, variables?: Record<string, unknown>) => {
      if (query.includes("ListActiveSubscriptions")) {
        return {
          data: {
            Subscriptions: [
              rawSubscription({ id: "sub-1", cyclesCompleted: 1 }),
              rawSubscription({ id: "sub-2", cyclesCompleted: 1 }),
            ],
          },
        } as { data: TData };
      }
      if (query.includes("SetDeliveryPriceOverride")) {
        setCalls.push((variables?.input as { subscriptionId: string }).subscriptionId);
        return { data: { setDeliveryPriceOverride: { subscriptionId: setCalls[setCalls.length - 1] } } } as {
          data: TData;
        };
      }
      if (query.includes("GetSkioSubscription")) {
        // Simulate a write that silently didn't take (deliveryPrice unchanged).
        return { data: { SubscriptionByPk: rawSubscription({ deliveryPrice: 6.99 }) } } as { data: TData };
      }
      throw new Error(`Unexpected query: ${query}`);
    };

    await expect(runSkioShippingSync(brokenProxy, CONFIG)).rejects.toThrow(DeliveryPriceOverrideVerificationError);
    expect(setCalls).toEqual(["sub-1"]);
  });

  it("halts when the verification read-back returns no subscription at all", async () => {
    const proxy: SkioGraphQLProxyFn = async <TData>(query: string, variables?: Record<string, unknown>) => {
      if (query.includes("ListActiveSubscriptions")) {
        return { data: { Subscriptions: [rawSubscription({ cyclesCompleted: 1 })] } } as { data: TData };
      }
      if (query.includes("SetDeliveryPriceOverride")) {
        return { data: { setDeliveryPriceOverride: { subscriptionId: (variables?.input as { subscriptionId: string }).subscriptionId } } } as {
          data: TData;
        };
      }
      if (query.includes("GetSkioSubscription")) {
        return { data: { SubscriptionByPk: null } } as { data: TData };
      }
      throw new Error(`Unexpected query: ${query}`);
    };

    await expect(runSkioShippingSync(proxy, CONFIG)).rejects.toThrow(DeliveryPriceOverrideVerificationError);
  });
});

describe("runSkioShippingSync — mutation failures don't crash the whole run", () => {
  it("logs and continues (as unapplied) when a write throws for one subscription", async () => {
    const proxy: SkioGraphQLProxyFn = async <TData>(query: string) => {
      if (query.includes("ListActiveSubscriptions")) {
        return { data: { Subscriptions: [rawSubscription({ cyclesCompleted: 1 })] } } as { data: TData };
      }
      if (query.includes("SetDeliveryPriceOverride")) {
        throw new Error("network blip");
      }
      throw new Error(`Unexpected query: ${query}`);
    };

    const results = await runSkioShippingSync(proxy, CONFIG);
    expect(results[0]).toMatchObject({ applied: false });
  });
});
