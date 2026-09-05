import { describe, expect, it } from "vitest";
import {
  hpnPromoRuleSchema,
  hpnPromoConfigSchema,
  pa7CrossSellRuleSchema,
  requiredVariantsFreeVariantsRuleSchema,
  requiredProductWithFreeVariantsRuleSchema,
  triggerProductDiscountedTargetsRuleSchema,
  loyaltyTierRuleSchema,
  landingFreeShippingRuleSchema,
  ruleConditionsSchema,
} from "../../app/lib/validations";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const P = (n: number) => `gid://shopify/Product/${n}`;
const V = (n: number) => `gid://shopify/ProductVariant/${n}`;

function ok<T>(schema: { safeParse: (v: unknown) => { success: boolean; data?: T } }, value: unknown): T {
  const result = schema.safeParse(value);
  expect(result.success, JSON.stringify(value)).toBe(true);
  return result.data as T;
}

function fail(schema: { safeParse: (v: unknown) => { success: boolean } }, value: unknown) {
  const result = schema.safeParse(value);
  expect(result.success, JSON.stringify(value)).toBe(false);
}

// ---------------------------------------------------------------------------
// GID format guards
// ---------------------------------------------------------------------------

describe("GID format validation", () => {
  it("accepts valid product GID", () => {
    ok(pa7CrossSellRuleSchema, {
      id: "rule-1",
      type: "pa7_cross_sell",
      enabled: true,
      triggerProductId: P(1),
      targetProductIds: [P(2)],
      targetLineQuantityEquals: 1,
      discountPercentage: 10,
      message: "test",
    });
  });

  it("rejects product GID in wrong namespace", () => {
    fail(pa7CrossSellRuleSchema, {
      id: "rule-1",
      type: "pa7_cross_sell",
      enabled: true,
      triggerProductId: "gid://shopify/Order/1",
      targetProductIds: [P(2)],
      targetLineQuantityEquals: 1,
      discountPercentage: 10,
      message: "test",
    });
  });

  it("rejects bare numeric ID", () => {
    fail(pa7CrossSellRuleSchema, {
      id: "rule-1",
      type: "pa7_cross_sell",
      enabled: true,
      triggerProductId: "123456",
      targetProductIds: [P(2)],
      targetLineQuantityEquals: 1,
      discountPercentage: 10,
      message: "test",
    });
  });

  it("rejects variant GID in product field", () => {
    fail(pa7CrossSellRuleSchema, {
      id: "rule-1",
      type: "pa7_cross_sell",
      enabled: true,
      triggerProductId: V(1),
      targetProductIds: [P(2)],
      targetLineQuantityEquals: 1,
      discountPercentage: 10,
      message: "test",
    });
  });
});

describe("landingFreeShippingRuleSchema", () => {
  const base = {
    id: "landing-shipping",
    type: "landing_free_shipping" as const,
    enabled: true,
    requiredLineAttributeKey: "__landing_source",
    requiredLineAttributeValue: "ambrosia",
    message: "Landing shipping discount",
  };

  it("keeps legacy rules compatible with safe shipping defaults", () => {
    const result = ok(landingFreeShippingRuleSchema, base);
    expect(result).toMatchObject({
      deliveryDiscountType: "percentage",
      deliveryDiscountPercentage: 100,
      shippingDiscountAmount: 1,
      targetDeliveryGroupTypes: ["ONE_TIME_PURCHASE", "SUBSCRIPTION"],
    });
  });

  it.each([25, 50, 100] as const)("accepts the %s%% shipping preset", (percentage) => {
    ok(landingFreeShippingRuleSchema, {
      ...base,
      deliveryDiscountPercentage: percentage,
    });
  });

  it("accepts a positive fixed amount and one selected profile", () => {
    ok(landingFreeShippingRuleSchema, {
      ...base,
      deliveryDiscountType: "fixed_amount",
      shippingDiscountAmount: 6.99,
      targetDeliveryGroupTypes: ["ONE_TIME_PURCHASE"],
    });
  });

  it("rejects unsupported percentages, non-positive amounts, and no profiles", () => {
    fail(landingFreeShippingRuleSchema, {
      ...base,
      deliveryDiscountPercentage: 75,
    });
    fail(landingFreeShippingRuleSchema, { ...base, shippingDiscountAmount: 0 });
    fail(landingFreeShippingRuleSchema, {
      ...base,
      targetDeliveryGroupTypes: [],
    });
  });
});

// ---------------------------------------------------------------------------
// ruleIdSchema
// ---------------------------------------------------------------------------

describe("ruleIdSchema (via pa7CrossSellRuleSchema)", () => {
  const base = {
    type: "pa7_cross_sell",
    enabled: true,
    triggerProductId: P(1),
    targetProductIds: [P(2)],
    targetLineQuantityEquals: 1,
    discountPercentage: 10,
    message: "test",
  };

  it("accepts lowercase-hyphen id", () => {
    ok(pa7CrossSellRuleSchema, { ...base, id: "my-rule-1" });
  });

  it("rejects id with uppercase", () => {
    fail(pa7CrossSellRuleSchema, { ...base, id: "MyRule" });
  });

  it("rejects id with spaces", () => {
    fail(pa7CrossSellRuleSchema, { ...base, id: "my rule" });
  });

  it("rejects empty id", () => {
    fail(pa7CrossSellRuleSchema, { ...base, id: "" });
  });
});

// ---------------------------------------------------------------------------
// discountPercentage range
// ---------------------------------------------------------------------------

describe("discountPercentage range", () => {
  const base = {
    id: "rule-1",
    type: "pa7_cross_sell",
    enabled: true,
    triggerProductId: P(1),
    targetProductIds: [P(2)],
    targetLineQuantityEquals: 1,
    message: "test",
  };

  it("accepts 1–100", () => {
    ok(pa7CrossSellRuleSchema, { ...base, discountPercentage: 1 });
    ok(pa7CrossSellRuleSchema, { ...base, discountPercentage: 100 });
    ok(pa7CrossSellRuleSchema, { ...base, discountPercentage: 50 });
  });

  it("rejects 0", () => {
    fail(pa7CrossSellRuleSchema, { ...base, discountPercentage: 0 });
  });

  it("rejects >100", () => {
    fail(pa7CrossSellRuleSchema, { ...base, discountPercentage: 101 });
  });

  it("rejects negative", () => {
    fail(pa7CrossSellRuleSchema, { ...base, discountPercentage: -5 });
  });
});

// ---------------------------------------------------------------------------
// required_variants_free_variants defaults
// ---------------------------------------------------------------------------

describe("requiredVariantsFreeVariantsRuleSchema defaults", () => {
  const base = {
    id: "rule-1",
    type: "required_variants_free_variants",
    enabled: true,
    requiredVariantIds: [V(1)],
    freeVariantIds: [V(2)],
    freeQuantityPerLine: 1,
    message: "test",
  };

  it("defaults discountPercentage to 100 when not provided", () => {
    const result = ok(requiredVariantsFreeVariantsRuleSchema, base);
    expect(result.discountPercentage).toBe(100);
  });

  it("accepts explicit discountPercentage", () => {
    const result = ok(requiredVariantsFreeVariantsRuleSchema, {
      ...base,
      discountPercentage: 50,
    });
    expect(result.discountPercentage).toBe(50);
  });

  it("normalizes null freeQuantityPerLine to 1", () => {
    const result = ok(requiredVariantsFreeVariantsRuleSchema, {
      ...base,
      freeQuantityPerLine: null,
    });
    expect(result.freeQuantityPerLine).toBe(1);
  });

  it("normalizes undefined freeQuantityPerLine to 1", () => {
    const { freeQuantityPerLine: _removed, ...withoutQty } = base;
    const result = ok(requiredVariantsFreeVariantsRuleSchema, withoutQty);
    expect(result.freeQuantityPerLine).toBe(1);
  });

  it("rejects freeQuantityPerLine < 1", () => {
    fail(requiredVariantsFreeVariantsRuleSchema, {
      ...base,
      freeQuantityPerLine: 0,
    });
  });
});

// ---------------------------------------------------------------------------
// required_product_with_free_variants defaults
// ---------------------------------------------------------------------------

describe("requiredProductWithFreeVariantsRuleSchema defaults", () => {
  const base = {
    id: "rule-1",
    type: "required_product_with_free_variants",
    enabled: true,
    triggerProductId: P(1),
    requiredVariantIds: [V(1)],
    freeVariantIds: [V(2)],
    freeQuantityPerLine: 1,
    message: "test",
  };

  it("defaults discountPercentage to 100 when not provided", () => {
    const result = ok(requiredProductWithFreeVariantsRuleSchema, base);
    expect(result.discountPercentage).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// trigger_product_discounted_targets
// ---------------------------------------------------------------------------

describe("triggerProductDiscountedTargetsRuleSchema", () => {
  const base = {
    id: "rule-1",
    type: "trigger_product_discounted_targets",
    enabled: true,
    triggerProductId: P(1),
    targets: [{ productId: P(2), discountPercentage: 50 }],
    message: "test",
  };

  it("accepts valid payload", () => {
    ok(triggerProductDiscountedTargetsRuleSchema, base);
  });

  it("rejects empty targets array", () => {
    fail(triggerProductDiscountedTargetsRuleSchema, { ...base, targets: [] });
  });

  it("rejects target with invalid productId", () => {
    fail(triggerProductDiscountedTargetsRuleSchema, {
      ...base,
      targets: [{ productId: "bad-id", discountPercentage: 50 }],
    });
  });
});

// ---------------------------------------------------------------------------
// loyalty_tier
// ---------------------------------------------------------------------------

describe("loyaltyTierRuleSchema", () => {
  const base = {
    id: "rule-1",
    type: "loyalty_tier",
    enabled: true,
    targetProductIds: [P(1)],
    tiers: [{ minOrders: 1, discountPercentage: 10 }],
    message: "test",
  };

  it("accepts valid payload", () => {
    ok(loyaltyTierRuleSchema, base);
  });

  it("rejects empty tiers array", () => {
    fail(loyaltyTierRuleSchema, { ...base, tiers: [] });
  });

  it("accepts minOrders: 0", () => {
    ok(loyaltyTierRuleSchema, {
      ...base,
      tiers: [{ minOrders: 0, discountPercentage: 5 }],
    });
  });

  it("rejects negative minOrders", () => {
    fail(loyaltyTierRuleSchema, {
      ...base,
      tiers: [{ minOrders: -1, discountPercentage: 5 }],
    });
  });

  it("rejects empty targetProductIds", () => {
    fail(loyaltyTierRuleSchema, { ...base, targetProductIds: [] });
  });
});

// ---------------------------------------------------------------------------
// ruleConditionsSchema
// ---------------------------------------------------------------------------

describe("ruleConditionsSchema", () => {
  it("accepts undefined (optional)", () => {
    const result = ruleConditionsSchema.safeParse(undefined);
    expect(result.success).toBe(true);
    expect(result.data).toBeUndefined();
  });

  it("accepts empty object", () => {
    const result = ruleConditionsSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("accepts valid conditions", () => {
    ok(ruleConditionsSchema, {
      minimumCartSubtotal: 50,
      requiredCartAttributeKey: "source",
      requiredCartAttributeValue: "lp",
      requiresSubscriptionInCart: true,
    });
  });

  it("rejects non-positive minimumCartSubtotal", () => {
    fail(ruleConditionsSchema, { minimumCartSubtotal: 0 });
    fail(ruleConditionsSchema, { minimumCartSubtotal: -1 });
  });

  it("rejects empty requiredCartAttributeKey", () => {
    fail(ruleConditionsSchema, { requiredCartAttributeKey: "" });
  });
});

// ---------------------------------------------------------------------------
// hpnPromoRuleSchema discriminated union
// ---------------------------------------------------------------------------

describe("hpnPromoRuleSchema discriminated union", () => {
  it("rejects unknown type", () => {
    fail(hpnPromoRuleSchema, {
      id: "rule-1",
      type: "unknown_type",
      enabled: true,
      message: "test",
    });
  });

  it("rejects missing type field", () => {
    fail(hpnPromoRuleSchema, {
      id: "rule-1",
      enabled: true,
      message: "test",
    });
  });
});

// ---------------------------------------------------------------------------
// hpnPromoConfigSchema
// ---------------------------------------------------------------------------

describe("hpnPromoConfigSchema", () => {
  it("accepts valid config with no rules", () => {
    ok(hpnPromoConfigSchema, {
      version: 1,
      rules: [],
      combinesWith: {
        orderDiscounts: true,
        productDiscounts: false,
        shippingDiscounts: true,
      },
    });
  });

  it("rejects wrong version", () => {
    fail(hpnPromoConfigSchema, {
      version: 2,
      rules: [],
      combinesWith: {
        orderDiscounts: true,
        productDiscounts: true,
        shippingDiscounts: true,
      },
    });
  });

  it("rejects missing combinesWith", () => {
    fail(hpnPromoConfigSchema, { version: 1, rules: [] });
  });

  it("accepts config with mixed rule types", () => {
    ok(hpnPromoConfigSchema, {
      version: 1,
      rules: [
        {
          id: "pa7",
          type: "pa7_cross_sell",
          enabled: true,
          triggerProductId: P(1),
          targetProductIds: [P(2)],
          targetLineQuantityEquals: 1,
          discountPercentage: 10,
          message: "test",
        },
        {
          id: "loyalty",
          type: "loyalty_tier",
          enabled: true,
          targetProductIds: [P(3)],
          tiers: [{ minOrders: 1, discountPercentage: 20 }],
          message: "loyalty",
        },
      ],
      combinesWith: {
        orderDiscounts: true,
        productDiscounts: true,
        shippingDiscounts: true,
      },
    });
  });
});
