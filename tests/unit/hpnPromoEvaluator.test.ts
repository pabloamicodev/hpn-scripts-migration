import { describe, expect, it } from "vitest";
import {
  evaluateConfig,
  buildCartIndex,
  evaluatePa7CrossSell,
  evaluateRequiredVariantsFreeVariants,
  evaluateRequiredProductWithFreeVariants,
  evaluateTriggerProductDiscountedTargets,
  evaluateLoyaltyTier,
  type CartLine,
  type CartEvalContext,
} from "../../app/lib/hpnPromoEvaluator";
import type { HpnPromoConfig, HpnPromoRule } from "../../app/lib/validations";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const P = (n: number) => `gid://shopify/Product/${n}`;
const V = (n: number) => `gid://shopify/ProductVariant/${n}`;
const L = (n: number) => `gid://shopify/CartLine/${n}`;

function line(
  lineNum: number,
  productNum: number,
  variantNum: number,
  quantity = 1,
  extras: Partial<CartLine> = {},
): CartLine {
  return {
    id: L(lineNum),
    quantity,
    merchandise: {
      __typename: "ProductVariant",
      id: V(variantNum),
      product: { id: P(productNum) },
    },
    ...extras,
  };
}

function makeConfig(rules: HpnPromoRule[]): HpnPromoConfig {
  return {
    version: 1,
    rules,
    combinesWith: { orderDiscounts: true, productDiscounts: true, shippingDiscounts: true },
  };
}

// ---------------------------------------------------------------------------
// buildCartIndex
// ---------------------------------------------------------------------------

describe("buildCartIndex", () => {
  it("indexes lines by product and variant", () => {
    const lines = [line(1, 10, 101), line(2, 20, 201)];
    const idx = buildCartIndex(lines);
    expect(idx.linesByProductId.get(P(10))).toHaveLength(1);
    expect(idx.linesByVariantId.get(V(101))).toHaveLength(1);
    expect(idx.linesByProductId.get(P(20))).toHaveLength(1);
  });

  it("groups multiple lines under the same product", () => {
    const lines = [line(1, 10, 101), line(2, 10, 102)];
    const idx = buildCartIndex(lines);
    expect(idx.linesByProductId.get(P(10))).toHaveLength(2);
  });

  it("ignores non-ProductVariant merchandise", () => {
    const bad = {
      id: L(9),
      quantity: 1,
      merchandise: { __typename: "ProductVariant" as const, id: V(999), product: { id: P(999) } },
    };
    const idx = buildCartIndex([bad]);
    // __typename is ProductVariant so it IS indexed
    expect(idx.linesByProductId.get(P(999))).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// pa7_cross_sell
// ---------------------------------------------------------------------------

describe("evaluatePa7CrossSell", () => {
  const rule: Extract<HpnPromoRule, { type: "pa7_cross_sell" }> = {
    id: "pa7",
    type: "pa7_cross_sell",
    enabled: true,
    triggerProductId: P(1),
    targetProductIds: [P(2), P(3)],
    targetLineQuantityEquals: 1,
    discountPercentage: 10,
    message: "10% off",
  };

  it("returns discount when trigger present and target has exact quantity", () => {
    const lines = [line(1, 1, 11), line(2, 2, 21)];
    const idx = buildCartIndex(lines);
    const actions = evaluatePa7CrossSell(rule, idx);
    expect(actions).toHaveLength(1);
    expect(actions[0].lineId).toBe(L(2));
    expect(actions[0].percentageOff).toBe(10);
    expect(actions[0].discountedQuantity).toBe(1);
  });

  it("returns discounts for all matching targets", () => {
    const lines = [line(1, 1, 11), line(2, 2, 21), line(3, 3, 31)];
    const idx = buildCartIndex(lines);
    const actions = evaluatePa7CrossSell(rule, idx);
    expect(actions).toHaveLength(2);
  });

  it("does nothing when trigger product is absent", () => {
    const lines = [line(2, 2, 21)];
    const idx = buildCartIndex(lines);
    expect(evaluatePa7CrossSell(rule, idx)).toHaveLength(0);
  });

  it("skips target lines with wrong quantity", () => {
    const lines = [line(1, 1, 11), line(2, 2, 21, 2)]; // target qty=2, rule needs 1
    const idx = buildCartIndex(lines);
    expect(evaluatePa7CrossSell(rule, idx)).toHaveLength(0);
  });

  it("uses discountPercentage from the rule", () => {
    const r = { ...rule, discountPercentage: 50 };
    const lines = [line(1, 1, 11), line(2, 2, 21)];
    const idx = buildCartIndex(lines);
    const [action] = evaluatePa7CrossSell(r, idx);
    expect(action.percentageOff).toBe(50);
  });
});

// ---------------------------------------------------------------------------
// required_variants_free_variants
// ---------------------------------------------------------------------------

describe("evaluateRequiredVariantsFreeVariants", () => {
  const rule: Extract<HpnPromoRule, { type: "required_variants_free_variants" }> = {
    id: "rvfv",
    type: "required_variants_free_variants",
    enabled: true,
    requiredVariantIds: [V(10), V(11)],
    freeVariantIds: [V(20), V(21)],
    freeQuantityPerLine: 1,
    discountPercentage: 100,
    message: "Free sample",
  };

  it("discounts free variants when all required are present", () => {
    const lines = [
      line(1, 1, 10),
      line(2, 1, 11),
      line(3, 2, 20),
      line(4, 2, 21),
    ];
    const idx = buildCartIndex(lines);
    const actions = evaluateRequiredVariantsFreeVariants(rule, idx);
    expect(actions).toHaveLength(2);
    expect(actions.map((a) => a.lineId).sort()).toEqual([L(3), L(4)].sort());
  });

  it("does nothing when one required variant is missing", () => {
    const lines = [line(1, 1, 10), line(3, 2, 20)]; // V(11) missing
    const idx = buildCartIndex(lines);
    expect(evaluateRequiredVariantsFreeVariants(rule, idx)).toHaveLength(0);
  });

  it("skips free variant lines that are not in cart", () => {
    const lines = [line(1, 1, 10), line(2, 1, 11), line(3, 2, 20)];
    // V(21) free variant not in cart
    const idx = buildCartIndex(lines);
    const actions = evaluateRequiredVariantsFreeVariants(rule, idx);
    expect(actions).toHaveLength(1);
    expect(actions[0].lineId).toBe(L(3));
  });

  it("uses freeQuantityPerLine as discountedQuantity", () => {
    const r = { ...rule, freeQuantityPerLine: 2 };
    const lines = [line(1, 1, 10), line(2, 1, 11), line(3, 2, 20, 3)];
    const idx = buildCartIndex(lines);
    const [action] = evaluateRequiredVariantsFreeVariants(r, idx);
    expect(action.discountedQuantity).toBe(2);
  });

  it("uses discountPercentage from the rule", () => {
    const r = { ...rule, discountPercentage: 50 };
    const lines = [line(1, 1, 10), line(2, 1, 11), line(3, 2, 20)];
    const idx = buildCartIndex(lines);
    const [action] = evaluateRequiredVariantsFreeVariants(r, idx);
    expect(action.percentageOff).toBe(50);
  });
});

// ---------------------------------------------------------------------------
// required_product_with_free_variants
// ---------------------------------------------------------------------------

describe("evaluateRequiredProductWithFreeVariants", () => {
  const rule: Extract<HpnPromoRule, { type: "required_product_with_free_variants" }> = {
    id: "rpwfv",
    type: "required_product_with_free_variants",
    enabled: true,
    triggerProductId: P(1),
    requiredVariantIds: [V(10), V(11)],
    freeVariantIds: [V(20)],
    freeQuantityPerLine: 1,
    discountPercentage: 100,
    message: "Free pouch",
  };

  it("discounts free variants when trigger and all required present", () => {
    const lines = [
      line(1, 1, 5),   // trigger product
      line(2, 2, 10),  // required variant
      line(3, 2, 11),  // required variant
      line(4, 3, 20),  // free variant
    ];
    const idx = buildCartIndex(lines);
    const actions = evaluateRequiredProductWithFreeVariants(rule, idx);
    expect(actions).toHaveLength(1);
    expect(actions[0].lineId).toBe(L(4));
    expect(actions[0].discountedQuantity).toBe(1);
  });

  it("does nothing when trigger product is absent", () => {
    const lines = [line(2, 2, 10), line(3, 2, 11), line(4, 3, 20)];
    const idx = buildCartIndex(lines);
    expect(evaluateRequiredProductWithFreeVariants(rule, idx)).toHaveLength(0);
  });

  it("does nothing when a required variant is absent", () => {
    const lines = [line(1, 1, 5), line(2, 2, 10), line(4, 3, 20)]; // V(11) missing
    const idx = buildCartIndex(lines);
    expect(evaluateRequiredProductWithFreeVariants(rule, idx)).toHaveLength(0);
  });

  it("caps discountedQuantity at Math.min(freeQuantityPerLine, line.quantity)", () => {
    const r = { ...rule, freeQuantityPerLine: 2 };
    const lines = [
      line(1, 1, 5),
      line(2, 2, 10),
      line(3, 2, 11),
      line(4, 3, 20, 1), // only 1 unit in cart
    ];
    const idx = buildCartIndex(lines);
    const [action] = evaluateRequiredProductWithFreeVariants(r, idx);
    expect(action.discountedQuantity).toBe(1); // min(2, 1)
  });

  it("uses discountPercentage from the rule", () => {
    const r = { ...rule, discountPercentage: 75 };
    const lines = [line(1, 1, 5), line(2, 2, 10), line(3, 2, 11), line(4, 3, 20)];
    const idx = buildCartIndex(lines);
    const [action] = evaluateRequiredProductWithFreeVariants(r, idx);
    expect(action.percentageOff).toBe(75);
  });
});

// ---------------------------------------------------------------------------
// trigger_product_discounted_targets
// ---------------------------------------------------------------------------

describe("evaluateTriggerProductDiscountedTargets", () => {
  const rule: Extract<HpnPromoRule, { type: "trigger_product_discounted_targets" }> = {
    id: "tpdt",
    type: "trigger_product_discounted_targets",
    enabled: true,
    triggerProductId: P(1),
    targets: [
      { productId: P(2), discountPercentage: 100 },
      { productId: P(3), discountPercentage: 30 },
    ],
    message: "Bundle deal",
  };

  it("applies per-target percentages when trigger is present", () => {
    const lines = [line(1, 1, 5), line(2, 2, 21), line(3, 3, 31)];
    const idx = buildCartIndex(lines);
    const actions = evaluateTriggerProductDiscountedTargets(rule, idx);
    expect(actions).toHaveLength(2);

    const p2action = actions.find((a) => a.productId === P(2));
    const p3action = actions.find((a) => a.productId === P(3));
    expect(p2action?.percentageOff).toBe(100);
    expect(p3action?.percentageOff).toBe(30);
  });

  it("does nothing when trigger is absent", () => {
    const lines = [line(2, 2, 21), line(3, 3, 31)];
    const idx = buildCartIndex(lines);
    expect(evaluateTriggerProductDiscountedTargets(rule, idx)).toHaveLength(0);
  });

  it("skips target products not in cart", () => {
    const lines = [line(1, 1, 5), line(2, 2, 21)]; // P(3) absent
    const idx = buildCartIndex(lines);
    const actions = evaluateTriggerProductDiscountedTargets(rule, idx);
    expect(actions).toHaveLength(1);
    expect(actions[0].productId).toBe(P(2));
  });

  it("discounts all lines of a target product", () => {
    const lines = [
      line(1, 1, 5),
      line(2, 2, 21), // two lines for P(2)
      line(3, 2, 22),
    ];
    const idx = buildCartIndex(lines);
    const actions = evaluateTriggerProductDiscountedTargets(rule, idx);
    const p2actions = actions.filter((a) => a.productId === P(2));
    expect(p2actions).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// loyalty_tier
// ---------------------------------------------------------------------------

describe("evaluateLoyaltyTier", () => {
  const rule: Extract<HpnPromoRule, { type: "loyalty_tier" }> = {
    id: "loyalty",
    type: "loyalty_tier",
    enabled: true,
    targetProductIds: [P(5)],
    tiers: [
      { minOrders: 1, discountPercentage: 5 },
      { minOrders: 5, discountPercentage: 15 },
      { minOrders: 10, discountPercentage: 25 },
    ],
    message: "Loyalty reward",
  };

  const lines = [line(1, 5, 51)];

  it("skips guest customers (numberOfOrders undefined)", () => {
    const ctx: CartEvalContext = {};
    const idx = buildCartIndex(lines);
    expect(evaluateLoyaltyTier(rule, idx, ctx)).toHaveLength(0);
  });

  it("applies highest qualifying tier", () => {
    const ctx: CartEvalContext = { customerNumberOfOrders: 7 };
    const idx = buildCartIndex(lines);
    const [action] = evaluateLoyaltyTier(rule, idx, ctx);
    expect(action.percentageOff).toBe(15); // tier minOrders=5 qualifies, not 10
  });

  it("applies top tier when customer has max orders", () => {
    const ctx: CartEvalContext = { customerNumberOfOrders: 10 };
    const idx = buildCartIndex(lines);
    const [action] = evaluateLoyaltyTier(rule, idx, ctx);
    expect(action.percentageOff).toBe(25);
  });

  it("returns nothing when no tier qualifies", () => {
    const ctx: CartEvalContext = { customerNumberOfOrders: 0 };
    const idx = buildCartIndex(lines);
    expect(evaluateLoyaltyTier(rule, idx, ctx)).toHaveLength(0);
  });

  it("applies discount to all lines of target products", () => {
    const multiLines = [line(1, 5, 51), line(2, 5, 52)];
    const ctx: CartEvalContext = { customerNumberOfOrders: 1 };
    const idx = buildCartIndex(multiLines);
    expect(evaluateLoyaltyTier(rule, idx, ctx)).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Global conditions via evaluateConfig
// ---------------------------------------------------------------------------

describe("Global conditions", () => {
  const baseRule: HpnPromoRule = {
    id: "pa7",
    type: "pa7_cross_sell",
    enabled: true,
    triggerProductId: P(1),
    targetProductIds: [P(2)],
    targetLineQuantityEquals: 1,
    discountPercentage: 10,
    message: "test",
  };

  const cartLines = [line(1, 1, 11), line(2, 2, 21)];

  it("fires when no conditions set", () => {
    const config = makeConfig([baseRule]);
    expect(evaluateConfig(config, cartLines)).toHaveLength(1);
  });

  it("skips rule when subtotal is below minimumCartSubtotal", () => {
    const rule = { ...baseRule, conditions: { minimumCartSubtotal: 100 } };
    const config = makeConfig([rule]);
    const ctx: CartEvalContext = { subtotalAmount: 50 };
    expect(evaluateConfig(config, cartLines, ctx)).toHaveLength(0);
  });

  it("fires when subtotal meets minimumCartSubtotal", () => {
    const rule = { ...baseRule, conditions: { minimumCartSubtotal: 100 } };
    const config = makeConfig([rule]);
    const ctx: CartEvalContext = { subtotalAmount: 100 };
    expect(evaluateConfig(config, cartLines, ctx)).toHaveLength(1);
  });

  it("skips rule when required cart attribute key is absent", () => {
    const rule = { ...baseRule, conditions: { requiredCartAttributeKey: "source" } };
    const config = makeConfig([rule]);
    const ctx: CartEvalContext = { attributes: [] };
    expect(evaluateConfig(config, cartLines, ctx)).toHaveLength(0);
  });

  it("fires when required cart attribute key is present", () => {
    const rule = { ...baseRule, conditions: { requiredCartAttributeKey: "source" } };
    const config = makeConfig([rule]);
    const ctx: CartEvalContext = { attributes: [{ key: "source", value: "lp" }] };
    expect(evaluateConfig(config, cartLines, ctx)).toHaveLength(1);
  });

  it("skips when attribute value does not match", () => {
    const rule = {
      ...baseRule,
      conditions: { requiredCartAttributeKey: "source", requiredCartAttributeValue: "lp-a" },
    };
    const config = makeConfig([rule]);
    const ctx: CartEvalContext = { attributes: [{ key: "source", value: "lp-b" }] };
    expect(evaluateConfig(config, cartLines, ctx)).toHaveLength(0);
  });

  it("fires when attribute key and value both match", () => {
    const rule = {
      ...baseRule,
      conditions: { requiredCartAttributeKey: "source", requiredCartAttributeValue: "lp-a" },
    };
    const config = makeConfig([rule]);
    const ctx: CartEvalContext = { attributes: [{ key: "source", value: "lp-a" }] };
    expect(evaluateConfig(config, cartLines, ctx)).toHaveLength(1);
  });

  it("skips when requiresSubscriptionInCart is true but no subscription present", () => {
    const rule = { ...baseRule, conditions: { requiresSubscriptionInCart: true } };
    const config = makeConfig([rule]);
    const ctx: CartEvalContext = { hasSubscriptionItem: false };
    expect(evaluateConfig(config, cartLines, ctx)).toHaveLength(0);
  });

  it("fires when requiresSubscriptionInCart is true and subscription is present", () => {
    const rule = { ...baseRule, conditions: { requiresSubscriptionInCart: true } };
    const config = makeConfig([rule]);
    const ctx: CartEvalContext = { hasSubscriptionItem: true };
    expect(evaluateConfig(config, cartLines, ctx)).toHaveLength(1);
  });

  it("all conditions must pass — fails if any one fails", () => {
    const rule = {
      ...baseRule,
      conditions: {
        minimumCartSubtotal: 100,
        requiredCartAttributeKey: "source",
      },
    };
    const config = makeConfig([rule]);
    // subtotal ok, but attribute missing
    const ctx: CartEvalContext = { subtotalAmount: 150, attributes: [] };
    expect(evaluateConfig(config, cartLines, ctx)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// evaluateConfig — integration
// ---------------------------------------------------------------------------

describe("evaluateConfig integration", () => {
  it("returns [] for empty rules", () => {
    expect(evaluateConfig(makeConfig([]), [], {})).toHaveLength(0);
  });

  it("skips disabled rules", () => {
    const rule: HpnPromoRule = {
      id: "pa7",
      type: "pa7_cross_sell",
      enabled: false,
      triggerProductId: P(1),
      targetProductIds: [P(2)],
      targetLineQuantityEquals: 1,
      discountPercentage: 10,
      message: "test",
    };
    const config = makeConfig([rule]);
    expect(evaluateConfig(config, [line(1, 1, 11), line(2, 2, 21)])).toHaveLength(0);
  });

  it("evaluates multiple rules independently", () => {
    const pa7: HpnPromoRule = {
      id: "pa7",
      type: "pa7_cross_sell",
      enabled: true,
      triggerProductId: P(1),
      targetProductIds: [P(2)],
      targetLineQuantityEquals: 1,
      discountPercentage: 10,
      message: "test",
    };
    const loyalty: HpnPromoRule = {
      id: "loyalty",
      type: "loyalty_tier",
      enabled: true,
      targetProductIds: [P(3)],
      tiers: [{ minOrders: 1, discountPercentage: 20 }],
      message: "loyalty",
    };
    const cartLines = [line(1, 1, 11), line(2, 2, 21), line(3, 3, 31)];
    const config = makeConfig([pa7, loyalty]);
    const ctx: CartEvalContext = { customerNumberOfOrders: 5 };
    const actions = evaluateConfig(config, cartLines, ctx);
    // pa7 fires on P(2), loyalty fires on P(3)
    expect(actions).toHaveLength(2);
  });
});
