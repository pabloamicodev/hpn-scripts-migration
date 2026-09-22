import { describe, expect, it } from "vitest";
import {
  listActiveSkioSubscriptions,
  setSkioDeliveryPriceOverride,
  intervalToDurationMonths,
  subscriptionSubtotal,
  subscriptionProductVariantIds,
  type RawSkioSubscription,
  type SkioGraphQLProxyFn,
} from "./skioApi.server";

const VARIANT_A = "gid://shopify/ProductVariant/1";

function rawSubscription(overrides: Partial<RawSkioSubscription> = {}): RawSkioSubscription {
  return {
    id: "sub-1",
    status: "ACTIVE",
    cyclesCompleted: 1,
    nextBillingDate: "2026-09-23T07:00:00+00:00",
    deliveryPrice: 0,
    deliveryPriceOverride: null,
    BillingPolicy: { interval: "DAY", intervalCount: 90 },
    SubscriptionLines: [
      { priceWithoutDiscount: 25, quantity: 1, removedAt: null, ProductVariant: { platformId: VARIANT_A } },
    ],
    ...overrides,
  };
}

describe("listActiveSkioSubscriptions", () => {
  it("returns all subscriptions from a single (short) page", async () => {
    const proxy: SkioGraphQLProxyFn = async <TData>() =>
      ({ data: { Subscriptions: [rawSubscription({ id: "sub-1" })] } }) as { data: TData };

    const subs = await listActiveSkioSubscriptions(proxy);
    expect(subs.map((s) => s.id)).toEqual(["sub-1"]);
  });

  it("paginates via offset/limit until a short page is returned", async () => {
    const requestedOffsets: number[] = [];
    const proxy: SkioGraphQLProxyFn = async <TData>(_query: string, variables?: Record<string, unknown>) => {
      const offset = variables?.offset as number;
      requestedOffsets.push(offset);

      if (offset === 0) {
        const page = Array.from({ length: 100 }, (_, i) => rawSubscription({ id: `sub-${i}` }));
        return { data: { Subscriptions: page } } as { data: TData };
      }
      return { data: { Subscriptions: [rawSubscription({ id: "sub-last" })] } } as { data: TData };
    };

    const subs = await listActiveSkioSubscriptions(proxy);
    expect(requestedOffsets).toEqual([0, 100]);
    expect(subs).toHaveLength(101);
  });

  it("returns an empty array when there are no active subscriptions", async () => {
    const proxy: SkioGraphQLProxyFn = async <TData>() => ({ data: { Subscriptions: [] } }) as { data: TData };
    expect(await listActiveSkioSubscriptions(proxy)).toEqual([]);
  });

  it("does not throw when data is entirely missing", async () => {
    const proxy: SkioGraphQLProxyFn = async <TData>() => ({}) as { data: TData };
    await expect(listActiveSkioSubscriptions(proxy)).resolves.toEqual([]);
  });

  it("throws when Skio returns GraphQL errors", async () => {
    const proxy: SkioGraphQLProxyFn = async <TData>() =>
      ({ errors: [{ message: "field \"foo\" not found" }] }) as { data: TData; errors: { message: string }[] };

    await expect(listActiveSkioSubscriptions(proxy)).rejects.toThrow(/ListActiveSubscriptions failed/);
  });
});

describe("intervalToDurationMonths", () => {
  it("rounds a DAY interval to the nearest month (90 days -> 3 months, confirmed live shape)", () => {
    expect(intervalToDurationMonths({ interval: "DAY", intervalCount: 90 })).toBe(3);
  });

  it("rounds 30 days to 1 month", () => {
    expect(intervalToDurationMonths({ interval: "DAY", intervalCount: 30 })).toBe(1);
  });

  it("rounds a non-exact day count to the nearest month", () => {
    expect(intervalToDurationMonths({ interval: "DAY", intervalCount: 61 })).toBe(2);
  });

  it("returns null for any non-DAY interval unit (excluded from tier matching rather than mismatched)", () => {
    expect(intervalToDurationMonths({ interval: "WEEK", intervalCount: 4 })).toBeNull();
    expect(intervalToDurationMonths({ interval: "MONTH", intervalCount: 3 })).toBeNull();
  });
});

describe("subscriptionSubtotal", () => {
  it("sums priceWithoutDiscount * quantity across lines", () => {
    const sub = rawSubscription({
      SubscriptionLines: [
        { priceWithoutDiscount: 20, quantity: 2, removedAt: null, ProductVariant: { platformId: VARIANT_A } },
        { priceWithoutDiscount: 5, quantity: 1, removedAt: null, ProductVariant: { platformId: VARIANT_A } },
      ],
    });
    expect(subscriptionSubtotal(sub)).toBe(45);
  });

  it("excludes removed lines from the subtotal", () => {
    const sub = rawSubscription({
      SubscriptionLines: [
        { priceWithoutDiscount: 20, quantity: 1, removedAt: null, ProductVariant: { platformId: VARIANT_A } },
        {
          priceWithoutDiscount: 999,
          quantity: 1,
          removedAt: "2026-01-01T00:00:00Z",
          ProductVariant: { platformId: VARIANT_A },
        },
      ],
    });
    expect(subscriptionSubtotal(sub)).toBe(20);
  });

  it("returns 0 for a subscription with no lines", () => {
    expect(subscriptionSubtotal(rawSubscription({ SubscriptionLines: [] }))).toBe(0);
  });
});

describe("subscriptionProductVariantIds", () => {
  it("returns the Shopify variant GIDs of active lines", () => {
    const sub = rawSubscription({
      SubscriptionLines: [
        { priceWithoutDiscount: 20, quantity: 1, removedAt: null, ProductVariant: { platformId: VARIANT_A } },
        {
          priceWithoutDiscount: 10,
          quantity: 1,
          removedAt: null,
          ProductVariant: { platformId: "gid://shopify/ProductVariant/2" },
        },
      ],
    });
    expect(subscriptionProductVariantIds(sub)).toEqual([VARIANT_A, "gid://shopify/ProductVariant/2"]);
  });

  it("excludes removed lines", () => {
    const sub = rawSubscription({
      SubscriptionLines: [
        { priceWithoutDiscount: 20, quantity: 1, removedAt: null, ProductVariant: { platformId: VARIANT_A } },
        {
          priceWithoutDiscount: 10,
          quantity: 1,
          removedAt: "2026-01-01T00:00:00Z",
          ProductVariant: { platformId: "gid://shopify/ProductVariant/2" },
        },
      ],
    });
    expect(subscriptionProductVariantIds(sub)).toEqual([VARIANT_A]);
  });

  it("returns an empty array when there are no lines", () => {
    expect(subscriptionProductVariantIds(rawSubscription({ SubscriptionLines: [] }))).toEqual([]);
  });
});

describe("setSkioDeliveryPriceOverride", () => {
  it("sends deliveryPrice and subscriptionId and resolves on success", async () => {
    let captured: Record<string, unknown> | undefined;
    const proxy: SkioGraphQLProxyFn = async <TData>(_query: string, variables?: Record<string, unknown>) => {
      captured = variables;
      return { data: { setDeliveryPriceOverride: { subscriptionId: "sub-1" } } } as { data: TData };
    };

    await setSkioDeliveryPriceOverride(proxy, "sub-1", 1.99);

    expect(captured?.input).toEqual({ subscriptionId: "sub-1", deliveryPrice: 1.99 });
  });

  it("allows a deliveryPrice of 0 (free shipping)", async () => {
    const proxy: SkioGraphQLProxyFn = async <TData>() =>
      ({ data: { setDeliveryPriceOverride: { subscriptionId: "sub-1" } } }) as { data: TData };

    await expect(setSkioDeliveryPriceOverride(proxy, "sub-1", 0)).resolves.toBeUndefined();
  });

  it("throws on a null mutation payload instead of silently succeeding", async () => {
    const proxy: SkioGraphQLProxyFn = async <TData>() =>
      ({ data: { setDeliveryPriceOverride: null } }) as { data: TData };

    await expect(setSkioDeliveryPriceOverride(proxy, "sub-1", 1.99)).rejects.toThrow(/returned no result/);
  });

  it("throws when Skio returns GraphQL errors (e.g. invalid subscriptionId)", async () => {
    const proxy: SkioGraphQLProxyFn = async <TData>() =>
      ({ errors: [{ message: "Subscription not found" }] }) as { data: TData; errors: { message: string }[] };

    await expect(setSkioDeliveryPriceOverride(proxy, "does-not-exist", 1.99)).rejects.toThrow(
      /SetDeliveryPriceOverride failed/,
    );
  });
});
