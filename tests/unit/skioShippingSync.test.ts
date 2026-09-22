import { describe, expect, it } from "vitest";
import { resolveShippingOverride, resolveShippingOverrides } from "../../app/lib/skioShippingSync";
import type { SkioSubscriptionSnapshot } from "../../app/lib/skioShippingSync";
import type { SkioShippingTiersConfig, SkioShippingTier } from "../../app/lib/skioShippingTiers";

const VARIANT_A = "gid://shopify/ProductVariant/1";
const VARIANT_B = "gid://shopify/ProductVariant/2";
const VARIANT_C = "gid://shopify/ProductVariant/3";

function tier(overrides: Partial<SkioShippingTier> = {}): SkioShippingTier {
  return {
    id: "tier-a",
    name: "Tier A",
    subscriptionDurationMonths: 2,
    minSubtotal: 0,
    maxSubtotal: 50,
    productVariantIds: null,
    cycleOverrides: [{ cycle: 1, override: { amount: null } }],
    defaultOverride: { amount: 1.99 },
    ...overrides,
  };
}

function subscription(overrides: Partial<SkioSubscriptionSnapshot> = {}): SkioSubscriptionSnapshot {
  return {
    id: "sub-1",
    subscriptionDurationMonths: 2,
    subtotal: 30,
    cyclesCompleted: 0,
    productVariantIds: [VARIANT_A],
    ...overrides,
  };
}

// The user's two worked examples from the conversation, encoded directly.
const TWO_MONTH_UNDER_50: SkioShippingTier = tier({
  id: "two-month-under-50",
  subscriptionDurationMonths: 2,
  minSubtotal: 0,
  maxSubtotal: 50,
  cycleOverrides: [{ cycle: 1, override: { amount: null } }], // full Shopify shipping price
  defaultOverride: { amount: 1.99 },
});

const THREE_MONTH_OVER_50: SkioShippingTier = tier({
  id: "three-month-over-50",
  subscriptionDurationMonths: 3,
  minSubtotal: 50,
  maxSubtotal: null,
  cycleOverrides: [{ cycle: 1, override: { amount: 0 } }], // free
  defaultOverride: { amount: 1.99 },
});

const CONFIG: SkioShippingTiersConfig = { tiers: [TWO_MONTH_UNDER_50, THREE_MONTH_OVER_50] };

describe("resolveShippingOverride — worked examples from the spec", () => {
  it("2-month plan under $50: cycle 1 is left alone (full price)", () => {
    const decision = resolveShippingOverride(CONFIG, subscription({ cyclesCompleted: 0 }));
    expect(decision).toMatchObject({ matchedTierId: "two-month-under-50", targetCycle: 1, overrideAmount: null });
  });

  it("2-month plan under $50: cycle 2 is overridden to $1.99", () => {
    const decision = resolveShippingOverride(CONFIG, subscription({ cyclesCompleted: 1 }));
    expect(decision).toMatchObject({ matchedTierId: "two-month-under-50", targetCycle: 2, overrideAmount: 1.99 });
  });

  it("3-month plan over $50: cycle 1 is overridden to free", () => {
    const decision = resolveShippingOverride(
      CONFIG,
      subscription({ subscriptionDurationMonths: 3, subtotal: 60, cyclesCompleted: 0 }),
    );
    expect(decision).toMatchObject({ matchedTierId: "three-month-over-50", targetCycle: 1, overrideAmount: 0 });
  });

  it("3-month plan over $50: cycle 2 AND cycle 3 both get $1.99 (flat default beyond the ladder)", () => {
    const cycle2 = resolveShippingOverride(
      CONFIG,
      subscription({ subscriptionDurationMonths: 3, subtotal: 60, cyclesCompleted: 1 }),
    );
    const cycle3 = resolveShippingOverride(
      CONFIG,
      subscription({ subscriptionDurationMonths: 3, subtotal: 60, cyclesCompleted: 2 }),
    );
    expect(cycle2.overrideAmount).toBe(1.99);
    expect(cycle3.overrideAmount).toBe(1.99);
  });
});

describe("resolveShippingOverride — matching rules", () => {
  it("does not match a tier when the plan duration differs", () => {
    const decision = resolveShippingOverride(CONFIG, subscription({ subscriptionDurationMonths: 6, subtotal: 30 }));
    expect(decision.matchedTierId).toBeNull();
    expect(decision.overrideAmount).toBeNull();
  });

  it("returns a no-op decision (not an error) when no tier matches", () => {
    const decision = resolveShippingOverride({ tiers: [] }, subscription());
    expect(decision).toMatchObject({ matchedTierId: null, overrideAmount: null });
  });

  it("treats minSubtotal as inclusive", () => {
    const decision = resolveShippingOverride(CONFIG, subscription({ subtotal: 0 }));
    expect(decision.matchedTierId).toBe("two-month-under-50");
  });

  it("treats maxSubtotal as exclusive — subtotal exactly at the boundary does not match", () => {
    const decision = resolveShippingOverride(CONFIG, subscription({ subtotal: 50 }));
    expect(decision.matchedTierId).toBeNull();
  });

  it("matches a tier with no upper bound (maxSubtotal: null) at any subtotal above the minimum", () => {
    const decision = resolveShippingOverride(
      CONFIG,
      subscription({ subscriptionDurationMonths: 3, subtotal: 1_000_000, cyclesCompleted: 0 }),
    );
    expect(decision.matchedTierId).toBe("three-month-over-50");
  });

  it("first matching tier wins when ranges overlap", () => {
    const overlapping: SkioShippingTiersConfig = {
      tiers: [
        tier({ id: "first", minSubtotal: 0, maxSubtotal: 100 }),
        tier({ id: "second", minSubtotal: 0, maxSubtotal: 100 }),
      ],
    };
    const decision = resolveShippingOverride(overlapping, subscription({ subtotal: 30 }));
    expect(decision.matchedTierId).toBe("first");
  });
});

describe("resolveShippingOverride — per-cycle ladder", () => {
  const LADDER_TIER: SkioShippingTier = tier({
    id: "ladder",
    cycleOverrides: [
      { cycle: 1, override: { amount: null } },
      { cycle: 2, override: { amount: 1.99 } },
      { cycle: 3, override: { amount: 0.99 } },
    ],
    defaultOverride: { amount: 0 },
  });
  const CONFIG_LADDER: SkioShippingTiersConfig = { tiers: [LADDER_TIER] };

  it("uses the explicit override for each listed cycle", () => {
    expect(resolveShippingOverride(CONFIG_LADDER, subscription({ cyclesCompleted: 0 })).overrideAmount).toBeNull();
    expect(resolveShippingOverride(CONFIG_LADDER, subscription({ cyclesCompleted: 1 })).overrideAmount).toBe(1.99);
    expect(resolveShippingOverride(CONFIG_LADDER, subscription({ cyclesCompleted: 2 })).overrideAmount).toBe(0.99);
  });

  it("falls back to defaultOverride for any cycle beyond the ladder", () => {
    const decision = resolveShippingOverride(CONFIG_LADDER, subscription({ cyclesCompleted: 3 }));
    expect(decision).toMatchObject({ targetCycle: 4, overrideAmount: 0 });
  });

  it("falls back to defaultOverride for a cycle below the lowest listed entry too", () => {
    const noCycle1Tier = tier({
      cycleOverrides: [{ cycle: 3, override: { amount: 0.5 } }],
      defaultOverride: { amount: 9.99 },
    });
    const decision = resolveShippingOverride({ tiers: [noCycle1Tier] }, subscription({ cyclesCompleted: 0 }));
    expect(decision.overrideAmount).toBe(9.99);
  });

  it("uses defaultOverride for every cycle when cycleOverrides is empty", () => {
    const flatTier = tier({ cycleOverrides: [], defaultOverride: { amount: 2.5 } });
    expect(resolveShippingOverride({ tiers: [flatTier] }, subscription({ cyclesCompleted: 0 })).overrideAmount).toBe(
      2.5,
    );
    expect(resolveShippingOverride({ tiers: [flatTier] }, subscription({ cyclesCompleted: 5 })).overrideAmount).toBe(
      2.5,
    );
  });
});

describe("resolveShippingOverride — product variant filtering", () => {
  it("matches regardless of product when productVariantIds is null", () => {
    const decision = resolveShippingOverride(
      { tiers: [tier({ productVariantIds: null })] },
      subscription({ productVariantIds: [VARIANT_C] }),
    );
    expect(decision.matchedTierId).toBe("tier-a");
  });

  it("matches when the subscription has at least one of the tier's variants", () => {
    const decision = resolveShippingOverride(
      { tiers: [tier({ productVariantIds: [VARIANT_A, VARIANT_B] })] },
      subscription({ productVariantIds: [VARIANT_B] }),
    );
    expect(decision.matchedTierId).toBe("tier-a");
  });

  it("does not match when none of the subscription's variants are in the tier's list", () => {
    const decision = resolveShippingOverride(
      { tiers: [tier({ productVariantIds: [VARIANT_A] })] },
      subscription({ productVariantIds: [VARIANT_C] }),
    );
    expect(decision.matchedTierId).toBeNull();
  });

  it("matches when the subscription has multiple lines and only one is in the tier's list", () => {
    const decision = resolveShippingOverride(
      { tiers: [tier({ productVariantIds: [VARIANT_B] })] },
      subscription({ productVariantIds: [VARIANT_A, VARIANT_B, VARIANT_C] }),
    );
    expect(decision.matchedTierId).toBe("tier-a");
  });

  it("does not match a subscription with no lines at all when the tier is product-scoped", () => {
    const decision = resolveShippingOverride(
      { tiers: [tier({ productVariantIds: [VARIANT_A] })] },
      subscription({ productVariantIds: [] }),
    );
    expect(decision.matchedTierId).toBeNull();
  });

  it("lets two tiers with identical duration/subtotal ranges target different products", () => {
    const config: SkioShippingTiersConfig = {
      tiers: [
        tier({ id: "product-a-tier", productVariantIds: [VARIANT_A], defaultOverride: { amount: 1 } }),
        tier({ id: "product-b-tier", productVariantIds: [VARIANT_B], defaultOverride: { amount: 2 } }),
      ],
    };
    expect(resolveShippingOverride(config, subscription({ productVariantIds: [VARIANT_A] })).matchedTierId).toBe(
      "product-a-tier",
    );
    expect(resolveShippingOverride(config, subscription({ productVariantIds: [VARIANT_B] })).matchedTierId).toBe(
      "product-b-tier",
    );
  });
});

describe("resolveShippingOverrides (batch)", () => {
  it("resolves each subscription independently and preserves order", () => {
    const decisions = resolveShippingOverrides(CONFIG, [
      subscription({ id: "sub-a", cyclesCompleted: 0 }),
      subscription({ id: "sub-b", subscriptionDurationMonths: 3, subtotal: 80, cyclesCompleted: 1 }),
      subscription({ id: "sub-c", subscriptionDurationMonths: 99, cyclesCompleted: 0 }),
    ]);

    expect(decisions.map((d) => d.subscriptionId)).toEqual(["sub-a", "sub-b", "sub-c"]);
    expect(decisions[0]).toMatchObject({ matchedTierId: "two-month-under-50", overrideAmount: null });
    expect(decisions[1]).toMatchObject({ matchedTierId: "three-month-over-50", overrideAmount: 1.99 });
    expect(decisions[2]).toMatchObject({ matchedTierId: null, overrideAmount: null });
  });

  it("returns an empty array for an empty subscription list", () => {
    expect(resolveShippingOverrides(CONFIG, [])).toEqual([]);
  });
});
