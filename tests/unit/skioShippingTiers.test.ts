import { describe, expect, it } from "vitest";
import {
  skioShippingTierSchema,
  skioShippingTiersConfigSchema,
  type SkioShippingTier,
} from "../../app/lib/skioShippingTiers";

function ok<T>(schema: { safeParse: (v: unknown) => { success: boolean; data?: T } }, value: unknown): T {
  const result = schema.safeParse(value);
  expect(result.success, JSON.stringify(value)).toBe(true);
  return result.data as T;
}

function fail(schema: { safeParse: (v: unknown) => { success: boolean } }, value: unknown) {
  const result = schema.safeParse(value);
  expect(result.success, JSON.stringify(value)).toBe(false);
}

const VARIANT_A = "gid://shopify/ProductVariant/1";
const VARIANT_B = "gid://shopify/ProductVariant/2";

function validTier(overrides: Partial<SkioShippingTier> = {}): unknown {
  return {
    id: "two-month-under-50",
    name: "2-month plan, under $50",
    subscriptionDurationMonths: 2,
    minSubtotal: 0,
    maxSubtotal: 50,
    productVariantIds: null,
    cycleOverrides: [{ cycle: 1, override: { amount: null } }],
    defaultOverride: { amount: 1.99 },
    ...overrides,
  };
}

describe("skioShippingTierSchema", () => {
  it("accepts a minimal valid tier", () => {
    ok(skioShippingTierSchema, validTier());
  });

  it("defaults minSubtotal to 0, maxSubtotal to null, productVariantIds to null, cycleOverrides to [] when omitted", () => {
    const { minSubtotal: _a, maxSubtotal: _b, productVariantIds: _c, cycleOverrides: _d, ...rest } =
      validTier() as Record<string, unknown>;
    const parsed = ok(skioShippingTierSchema, rest);
    expect(parsed.minSubtotal).toBe(0);
    expect(parsed.maxSubtotal).toBeNull();
    expect(parsed.productVariantIds).toBeNull();
    expect(parsed.cycleOverrides).toEqual([]);
  });

  it("allows a null maxSubtotal (no upper bound)", () => {
    ok(skioShippingTierSchema, validTier({ maxSubtotal: null }));
  });

  it("rejects maxSubtotal <= minSubtotal", () => {
    fail(skioShippingTierSchema, validTier({ minSubtotal: 50, maxSubtotal: 50 }));
    fail(skioShippingTierSchema, validTier({ minSubtotal: 50, maxSubtotal: 10 }));
  });

  it("rejects a negative minSubtotal or maxSubtotal", () => {
    fail(skioShippingTierSchema, validTier({ minSubtotal: -1 }));
    fail(skioShippingTierSchema, validTier({ maxSubtotal: -1 }));
  });

  it("rejects a non-positive subscriptionDurationMonths", () => {
    fail(skioShippingTierSchema, validTier({ subscriptionDurationMonths: 0 }));
    fail(skioShippingTierSchema, validTier({ subscriptionDurationMonths: -3 }));
  });

  it("rejects a non-integer subscriptionDurationMonths", () => {
    fail(skioShippingTierSchema, validTier({ subscriptionDurationMonths: 2.5 }));
  });

  it("allows a null override amount (leave shipping alone)", () => {
    ok(skioShippingTierSchema, validTier({ defaultOverride: { amount: null } }));
  });

  it("allows a zero override amount (free shipping)", () => {
    ok(skioShippingTierSchema, validTier({ defaultOverride: { amount: 0 } }));
  });

  it("rejects a negative override amount", () => {
    fail(skioShippingTierSchema, validTier({ defaultOverride: { amount: -1.99 } }));
  });

  it("rejects an invalid tier id format", () => {
    fail(skioShippingTierSchema, validTier({ id: "Two Month" }));
    fail(skioShippingTierSchema, validTier({ id: "" }));
    fail(skioShippingTierSchema, validTier({ id: "-leading-hyphen" }));
  });

  describe("productVariantIds", () => {
    it("accepts a list of variant GIDs", () => {
      const parsed = ok(skioShippingTierSchema, validTier({ productVariantIds: [VARIANT_A, VARIANT_B] }));
      expect(parsed.productVariantIds).toEqual([VARIANT_A, VARIANT_B]);
    });

    it("rejects an empty array (use null instead to mean 'any product')", () => {
      fail(skioShippingTierSchema, validTier({ productVariantIds: [] }));
    });

    it("rejects a product GID in the wrong namespace", () => {
      fail(skioShippingTierSchema, validTier({ productVariantIds: ["gid://shopify/Product/1"] }));
    });
  });

  describe("cycleOverrides", () => {
    it("accepts a ladder of distinct cycle numbers", () => {
      const parsed = ok(
        skioShippingTierSchema,
        validTier({
          cycleOverrides: [
            { cycle: 1, override: { amount: null } },
            { cycle: 2, override: { amount: 1.99 } },
            { cycle: 3, override: { amount: 0.99 } },
          ],
        }),
      );
      expect(parsed.cycleOverrides).toHaveLength(3);
    });

    it("rejects a duplicate cycle number within the same tier", () => {
      fail(
        skioShippingTierSchema,
        validTier({
          cycleOverrides: [
            { cycle: 2, override: { amount: 1.99 } },
            { cycle: 2, override: { amount: 0.99 } },
          ],
        }),
      );
    });

    it("rejects a non-positive or non-integer cycle number", () => {
      fail(skioShippingTierSchema, validTier({ cycleOverrides: [{ cycle: 0, override: { amount: 1 } }] }));
      fail(skioShippingTierSchema, validTier({ cycleOverrides: [{ cycle: -1, override: { amount: 1 } }] }));
      fail(skioShippingTierSchema, validTier({ cycleOverrides: [{ cycle: 1.5, override: { amount: 1 } }] }));
    });
  });
});

describe("skioShippingTiersConfigSchema", () => {
  it("accepts an empty tier list", () => {
    ok(skioShippingTiersConfigSchema, { tiers: [] });
  });

  it("accepts multiple distinct tiers", () => {
    ok(skioShippingTiersConfigSchema, {
      tiers: [validTier({ id: "tier-a" }), validTier({ id: "tier-b", subscriptionDurationMonths: 3 })],
    });
  });

  it("rejects duplicate tier ids", () => {
    fail(skioShippingTiersConfigSchema, {
      tiers: [validTier({ id: "tier-a" }), validTier({ id: "tier-a", subscriptionDurationMonths: 3 })],
    });
  });
});
