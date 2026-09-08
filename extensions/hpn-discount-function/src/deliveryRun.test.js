import { describe, expect, it } from "vitest";

import { cartDeliveryOptionsDiscountsGenerateRun } from "./index.js";

const PROTEIN_VARIANT_ID = "gid://shopify/ProductVariant/31358533206097";

function lineWithAttribute(
  value,
  { quantity = 1, variantId = PROTEIN_VARIANT_ID } = {},
) {
  return {
    quantity,
    landingSourceAttribute: value == null ? null : { value },
    merchandise: {
      __typename: "ProductVariant",
      id: variantId,
    },
  };
}

function config(overrides = {}) {
  return {
    version: 1,
    combinesWith: {
      orderDiscounts: true,
      productDiscounts: true,
      shippingDiscounts: true,
    },
    rules: [
      {
        id: "tru-landing-free-shipping",
        type: "landing_free_shipping",
        enabled: true,
        requiredLineAttributeKey: "__landing_source",
        requiredLineAttributeValue: "protein-complete-lp",
        message: "Free shipping — Protein Complete bundle",
        ...overrides,
      },
    ],
  };
}

function runWith(
  lines,
  deliveryGroups,
  cfg = config(),
  discountClasses = ["SHIPPING"],
  subtotalAmount = 100,
) {
  return cartDeliveryOptionsDiscountsGenerateRun({
    cart: {
      cost: { subtotalAmount: { amount: String(subtotalAmount) } },
      lines,
      deliveryGroups,
    },
    discount: {
      discountClasses,
      metafield: { value: JSON.stringify(cfg) },
    },
  });
}

describe("cartDeliveryOptionsDiscountsGenerateRun", () => {
  it("returns no operations when the discount does not include SHIPPING class", () => {
    const result = runWith(
      [lineWithAttribute("protein-complete-lp")],
      [{ id: "gid://shopify/CartDeliveryGroup/1" }],
      config(),
      ["PRODUCT"],
    );

    expect(result).toEqual({ operations: [] });
  });

  it("returns no operations for missing or invalid config", () => {
    expect(
      cartDeliveryOptionsDiscountsGenerateRun({
        cart: {
          lines: [],
          deliveryGroups: [{ id: "gid://shopify/CartDeliveryGroup/1" }],
        },
        discount: { discountClasses: ["SHIPPING"], metafield: null },
      }),
    ).toEqual({ operations: [] });

    expect(
      cartDeliveryOptionsDiscountsGenerateRun({
        cart: {
          lines: [],
          deliveryGroups: [{ id: "gid://shopify/CartDeliveryGroup/1" }],
        },
        discount: {
          discountClasses: ["SHIPPING"],
          metafield: { value: "{bad json" },
        },
      }),
    ).toEqual({ operations: [] });
  });

  it("discounts every delivery group to 100% via a single candidate (one checkout label, not one per group)", () => {
    const result = runWith(
      [lineWithAttribute("protein-complete-lp")],
      [
        { id: "gid://shopify/CartDeliveryGroup/1" },
        { id: "gid://shopify/CartDeliveryGroup/2" },
      ],
    );

    expect(result).toEqual({
      operations: [
        {
          deliveryDiscountsAdd: {
            candidates: [
              {
                message: "Free shipping — Protein Complete bundle",
                targets: [
                  {
                    deliveryGroup: { id: "gid://shopify/CartDeliveryGroup/1" },
                  },
                  {
                    deliveryGroup: { id: "gid://shopify/CartDeliveryGroup/2" },
                  },
                ],
                value: { percentage: { value: "100" } },
              },
            ],
            selectionStrategy: "ALL",
          },
        },
      ],
    });
  });

  it("applies a configured percentage only to General / initial checkout groups", () => {
    const result = runWith(
      [lineWithAttribute("protein-complete-lp")],
      [
        {
          id: "gid://shopify/CartDeliveryGroup/initial",
          groupType: "ONE_TIME_PURCHASE",
        },
        {
          id: "gid://shopify/CartDeliveryGroup/recurring",
          groupType: "SUBSCRIPTION",
        },
      ],
      config({
        deliveryDiscountType: "percentage",
        deliveryDiscountPercentage: 25,
        targetDeliveryGroupTypes: ["ONE_TIME_PURCHASE"],
      }),
    );

    expect(result.operations[0].deliveryDiscountsAdd.candidates[0]).toEqual({
      message: "Free shipping — Protein Complete bundle",
      targets: [
        { deliveryGroup: { id: "gid://shopify/CartDeliveryGroup/initial" } },
      ],
      value: { percentage: { value: "25" } },
    });
  });

  it("applies the highest qualifying cart-value shipping tier", () => {
    const lines = [lineWithAttribute("protein-complete-lp")];
    const groups = [{ id: "gid://shopify/CartDeliveryGroup/initial" }];
    const tieredConfig = config({
      shippingTiers: [
        { minimumSubtotal: 0, discountPercentage: 0 },
        { minimumSubtotal: 50, discountPercentage: 25 },
        { minimumSubtotal: 100, discountPercentage: 50 },
        { minimumSubtotal: 200, discountPercentage: 100 },
      ],
    });

    const result = runWith(lines, groups, tieredConfig, ["SHIPPING"], 125);

    expect(
      result.operations[0].deliveryDiscountsAdd.candidates[0].value,
    ).toEqual({
      percentage: { value: "50" },
    });
  });

  it("returns no shipping discount when the qualifying tier is 0%", () => {
    const result = runWith(
      [lineWithAttribute("protein-complete-lp")],
      [{ id: "gid://shopify/CartDeliveryGroup/initial" }],
      config({
        shippingTiers: [
          { minimumSubtotal: 0, discountPercentage: 0 },
          { minimumSubtotal: 50, discountPercentage: 25 },
        ],
      }),
      ["SHIPPING"],
      30,
    );

    expect(result).toEqual({ operations: [] });
  });

  it("supports a custom two-tier setup", () => {
    const result = runWith(
      [lineWithAttribute("protein-complete-lp")],
      [{ id: "gid://shopify/CartDeliveryGroup/initial" }],
      config({
        shippingTiers: [
          { minimumSubtotal: 50, discountPercentage: 50 },
          { minimumSubtotal: 90, discountPercentage: 100 },
        ],
      }),
      ["SHIPPING"],
      95,
    );

    expect(
      result.operations[0].deliveryDiscountsAdd.candidates[0].value,
    ).toEqual({
      percentage: { value: "100" },
    });
  });

  // ── Tiers scoped to subscription vs. one-time-only carts (Zaid's request:
  // different shipping-tier ladders depending on whether the cart has a
  // subscription item anywhere in it) ──

  function subscriptionGroup(id = "gid://shopify/CartDeliveryGroup/sub") {
    return {
      id,
      cartLines: [
        {
          sellingPlanAllocation: {
            sellingPlan: { id: "gid://shopify/SellingPlan/1" },
          },
        },
      ],
    };
  }

  function oneTimeGroup(id = "gid://shopify/CartDeliveryGroup/one-time") {
    return { id, cartLines: [{ sellingPlanAllocation: null }] };
  }

  const conditionalTiersConfig = config({
    shippingTiers: [
      { minimumSubtotal: 50, discountPercentage: 50, appliesWhen: "has_subscription" },
      { minimumSubtotal: 100, discountPercentage: 100, appliesWhen: "has_subscription" },
      { minimumSubtotal: 80, discountPercentage: 50, appliesWhen: "one_time_only" },
    ],
  });

  it("applies the has_subscription ladder when the cart has a subscription line, at its lower threshold", () => {
    const result = runWith(
      [lineWithAttribute("protein-complete-lp")],
      [subscriptionGroup()],
      conditionalTiersConfig,
      ["SHIPPING"],
      60,
    );

    expect(
      result.operations[0].deliveryDiscountsAdd.candidates[0].value,
    ).toEqual({ percentage: { value: "50" } });
  });

  it("applies the has_subscription ladder's free-shipping threshold", () => {
    const result = runWith(
      [lineWithAttribute("protein-complete-lp")],
      [subscriptionGroup()],
      conditionalTiersConfig,
      ["SHIPPING"],
      150,
    );

    expect(
      result.operations[0].deliveryDiscountsAdd.candidates[0].value,
    ).toEqual({ percentage: { value: "100" } });
  });

  it("applies the one_time_only ladder when no cart line anywhere has a subscription", () => {
    const result = runWith(
      [lineWithAttribute("protein-complete-lp")],
      [oneTimeGroup()],
      conditionalTiersConfig,
      ["SHIPPING"],
      90,
    );

    expect(
      result.operations[0].deliveryDiscountsAdd.candidates[0].value,
    ).toEqual({ percentage: { value: "50" } });
  });

  it("does not discount a one-time-only cart below the one_time_only threshold, even though a lower has_subscription tier exists", () => {
    const result = runWith(
      [lineWithAttribute("protein-complete-lp")],
      [oneTimeGroup()],
      conditionalTiersConfig,
      ["SHIPPING"],
      60,
    );

    expect(result).toEqual({ operations: [] });
  });

  it("always resolves against the has_subscription ladder when the cart mixes one-time and subscription lines, even when that's worse than the one-time ladder", () => {
    const mixedGroupsConfig = config({
      shippingTiers: [
        { minimumSubtotal: 50, discountPercentage: 25, appliesWhen: "has_subscription" },
        { minimumSubtotal: 50, discountPercentage: 100, appliesWhen: "one_time_only" },
      ],
    });

    const result = runWith(
      [lineWithAttribute("protein-complete-lp")],
      [oneTimeGroup("gid://shopify/CartDeliveryGroup/one-time"), subscriptionGroup("gid://shopify/CartDeliveryGroup/sub")],
      mixedGroupsConfig,
      ["SHIPPING"],
      60,
    );

    expect(
      result.operations[0].deliveryDiscountsAdd.candidates[0].value,
    ).toEqual({ percentage: { value: "25" } });
  });

  it("gives no shipping discount for a one-time cart when only has_subscription tiers are configured", () => {
    const result = runWith(
      [lineWithAttribute("protein-complete-lp")],
      [oneTimeGroup()],
      config({
        shippingTiers: [
          { minimumSubtotal: 0, discountPercentage: 100, appliesWhen: "has_subscription" },
        ],
      }),
      ["SHIPPING"],
      500,
    );

    expect(result).toEqual({ operations: [] });
  });

  it("an unconditional tier (no appliesWhen) still competes regardless of cart composition", () => {
    const result = runWith(
      [lineWithAttribute("protein-complete-lp")],
      [oneTimeGroup()],
      config({
        shippingTiers: [{ minimumSubtotal: 0, discountPercentage: 15 }],
      }),
      ["SHIPPING"],
      10,
    );

    expect(
      result.operations[0].deliveryDiscountsAdd.candidates[0].value,
    ).toEqual({ percentage: { value: "15" } });
  });

  // ── A subscription's FIRST delivery is groupType ONE_TIME_PURCHASE too ──
  // (only later, recurring deliveries are groupType SUBSCRIPTION) — a rule
  // scoped to "one-time purchase only" must still exclude it.

  it("does not discount a first-time subscription checkout even though its groupType is ONE_TIME_PURCHASE", () => {
    const result = runWith(
      [lineWithAttribute("protein-complete-lp")],
      [
        {
          id: "gid://shopify/CartDeliveryGroup/initial",
          groupType: "ONE_TIME_PURCHASE",
          cartLines: [
            {
              sellingPlanAllocation: {
                sellingPlan: { id: "gid://shopify/SellingPlan/1" },
              },
            },
          ],
        },
      ],
      config({ targetDeliveryGroupTypes: ["ONE_TIME_PURCHASE"] }),
    );

    expect(result).toEqual({ operations: [] });
  });

  it("still discounts a genuine one-time purchase group with no selling plan on any of its lines", () => {
    const result = runWith(
      [lineWithAttribute("protein-complete-lp")],
      [
        {
          id: "gid://shopify/CartDeliveryGroup/initial",
          groupType: "ONE_TIME_PURCHASE",
          cartLines: [{ sellingPlanAllocation: null }],
        },
      ],
      config({ targetDeliveryGroupTypes: ["ONE_TIME_PURCHASE"] }),
    );

    expect(result.operations).toHaveLength(1);
  });

  it("discounts a first-time subscription checkout when the rule targets subscriptions", () => {
    const result = runWith(
      [lineWithAttribute("protein-complete-lp")],
      [
        {
          id: "gid://shopify/CartDeliveryGroup/initial",
          groupType: "ONE_TIME_PURCHASE",
          cartLines: [
            {
              sellingPlanAllocation: {
                sellingPlan: { id: "gid://shopify/SellingPlan/1" },
              },
            },
          ],
        },
      ],
      config({ targetDeliveryGroupTypes: ["SUBSCRIPTION"] }),
    );

    expect(result.operations).toHaveLength(1);
  });

  it("can target only SKIO recurring subscription groups", () => {
    const result = runWith(
      [lineWithAttribute("protein-complete-lp")],
      [
        {
          id: "gid://shopify/CartDeliveryGroup/initial",
          groupType: "ONE_TIME_PURCHASE",
        },
        {
          id: "gid://shopify/CartDeliveryGroup/recurring",
          groupType: "SUBSCRIPTION",
        },
      ],
      config({
        deliveryDiscountType: "percentage",
        deliveryDiscountPercentage: 50,
        targetDeliveryGroupTypes: ["SUBSCRIPTION"],
      }),
    );

    expect(
      result.operations[0].deliveryDiscountsAdd.candidates[0],
    ).toMatchObject({
      targets: [
        { deliveryGroup: { id: "gid://shopify/CartDeliveryGroup/recurring" } },
      ],
      value: { percentage: { value: "50" } },
    });
  });

  it("supports a fixed shipping discount amount", () => {
    const result = runWith(
      [lineWithAttribute("protein-complete-lp")],
      [
        {
          id: "gid://shopify/CartDeliveryGroup/initial",
          groupType: "ONE_TIME_PURCHASE",
        },
      ],
      config({
        deliveryDiscountType: "fixed_amount",
        shippingDiscountAmount: 6.99,
        targetDeliveryGroupTypes: ["ONE_TIME_PURCHASE"],
      }),
    );

    expect(
      result.operations[0].deliveryDiscountsAdd.candidates[0].value,
    ).toEqual({
      fixedAmount: { amount: "6.99" },
    });
  });

  it("fails closed for invalid discount values or an empty profile selection", () => {
    const groups = [
      {
        id: "gid://shopify/CartDeliveryGroup/initial",
        groupType: "ONE_TIME_PURCHASE",
      },
    ];
    const lines = [lineWithAttribute("protein-complete-lp")];

    expect(
      runWith(lines, groups, config({ deliveryDiscountPercentage: 10 })),
    ).toEqual({
      operations: [],
    });
    expect(
      runWith(
        lines,
        groups,
        config({
          deliveryDiscountType: "fixed_amount",
          shippingDiscountAmount: 0,
        }),
      ),
    ).toEqual({ operations: [] });
    expect(
      runWith(lines, groups, config({ targetDeliveryGroupTypes: [] })),
    ).toEqual({
      operations: [],
    });
  });

  it("does not discount shipping when no cart line carries the landing tag", () => {
    const result = runWith(
      [lineWithAttribute(null), lineWithAttribute("some-other-page")],
      [{ id: "gid://shopify/CartDeliveryGroup/1" }],
    );

    expect(result).toEqual({ operations: [] });
  });

  it("does not discount shipping when the rule is disabled", () => {
    const result = runWith(
      [lineWithAttribute("protein-complete-lp")],
      [{ id: "gid://shopify/CartDeliveryGroup/1" }],
      config({ enabled: false }),
    );

    expect(result).toEqual({ operations: [] });
  });

  it("does not discount shipping until tagged anchor quantity reaches the configured minimum", () => {
    const result = runWith(
      [lineWithAttribute("protein-complete-lp", { quantity: 1 })],
      [{ id: "gid://shopify/CartDeliveryGroup/1" }],
      config({
        requiredAnchorVariantIds: [PROTEIN_VARIANT_ID],
        requiredAnchorMinQuantity: 2,
      }),
    );

    expect(result).toEqual({ operations: [] });
  });

  it("discounts shipping when tagged anchor quantity reaches the configured minimum", () => {
    const result = runWith(
      [
        lineWithAttribute("protein-complete-lp", { quantity: 1 }),
        lineWithAttribute("protein-complete-lp", { quantity: 1 }),
      ],
      [{ id: "gid://shopify/CartDeliveryGroup/1" }],
      config({
        requiredAnchorVariantIds: [PROTEIN_VARIANT_ID],
        requiredAnchorMinQuantity: 2,
      }),
    );

    expect(result.operations).toHaveLength(1);
  });

  it("ignores non-landing_free_shipping rules in the same shared config", () => {
    const cfg = {
      version: 1,
      combinesWith: {
        orderDiscounts: true,
        productDiscounts: true,
        shippingDiscounts: true,
      },
      rules: [
        {
          id: "pa7",
          type: "pa7_cross_sell",
          enabled: true,
          triggerProductId: "x",
          targetProductIds: ["y"],
          targetLineQuantityEquals: 1,
          discountPercentage: 10,
          message: "irrelevant",
        },
      ],
    };
    const result = runWith(
      [lineWithAttribute("protein-complete-lp")],
      [{ id: "gid://shopify/CartDeliveryGroup/1" }],
      cfg,
    );

    expect(result).toEqual({ operations: [] });
  });

  it("returns no operations when the cart has no delivery groups", () => {
    const result = runWith([lineWithAttribute("protein-complete-lp")], []);

    expect(result).toEqual({ operations: [] });
  });
});

// ---------------------------------------------------------------------------
// quiz_bundle_free_shipping (Product Quiz) — same _quiz_bundle_id grouping
// and expectedPaidCount abuse guard as quiz_bundle_price_match, applied to
// shipping instead of price. Fully generic, no product IDs configured.
// ---------------------------------------------------------------------------

describe("quiz_bundle_free_shipping", () => {
  function quizShippingConfig(overrides = {}) {
    return {
      version: 1,
      combinesWith: {
        orderDiscounts: true,
        productDiscounts: true,
        shippingDiscounts: true,
      },
      rules: [
        {
          id: "quiz-bundle-free-shipping",
          type: "quiz_bundle_free_shipping",
          enabled: true,
          message: "Product Quiz Bundle",
          ...overrides,
        },
      ],
    };
  }

  function quizDeliveryLine({
    bundleId = "pq-1",
    isGift = false,
    expectedPaidCount = 1,
    quantity = 1,
  } = {}) {
    return {
      quantity,
      merchandise: { __typename: "ProductVariant", id: PROTEIN_VARIANT_ID },
      quizBundleIdAttribute: { value: bundleId },
      quizFreeGiftAttribute: isGift ? { value: "true" } : null,
      quizExpectedPaidCountAttribute: { value: String(expectedPaidCount) },
    };
  }

  it("discounts shipping to 100% when every expected paid line is present", () => {
    const result = runWith(
      [
        quizDeliveryLine({ expectedPaidCount: 4 }),
        quizDeliveryLine({ expectedPaidCount: 4 }),
        quizDeliveryLine({ expectedPaidCount: 4 }),
        quizDeliveryLine({ expectedPaidCount: 4 }),
        quizDeliveryLine({ isGift: true, expectedPaidCount: 4 }),
      ],
      [{ id: "gid://shopify/CartDeliveryGroup/1" }],
      quizShippingConfig(),
    );

    expect(result.operations).toHaveLength(1);
    expect(result.operations[0].deliveryDiscountsAdd.candidates[0]).toEqual({
      message: "Product Quiz Bundle",
      targets: [{ deliveryGroup: { id: "gid://shopify/CartDeliveryGroup/1" } }],
      value: { percentage: { value: "100" } },
    });
  });

  it("does not discount shipping when no line carries _quiz_bundle_id", () => {
    const result = runWith(
      [lineWithAttribute(null)],
      [{ id: "gid://shopify/CartDeliveryGroup/1" }],
      quizShippingConfig(),
    );
    expect(result).toEqual({ operations: [] });
  });

  it("does not discount shipping when the rule is disabled", () => {
    const result = runWith(
      [quizDeliveryLine({ expectedPaidCount: 1 })],
      [{ id: "gid://shopify/CartDeliveryGroup/1" }],
      quizShippingConfig({ enabled: false }),
    );
    expect(result).toEqual({ operations: [] });
  });

  // ── Abuse guard: removing a paid line must kill the shipping discount too ──

  it("does not discount shipping if the shopper removes just ONE of the bundle's paid lines", () => {
    const result = runWith(
      [
        // Bundle originally had 4 paid lines; only 3 are still in the cart.
        quizDeliveryLine({ expectedPaidCount: 4 }),
        quizDeliveryLine({ expectedPaidCount: 4 }),
        quizDeliveryLine({ expectedPaidCount: 4 }),
        quizDeliveryLine({ isGift: true, expectedPaidCount: 4 }),
      ],
      [{ id: "gid://shopify/CartDeliveryGroup/1" }],
      quizShippingConfig(),
    );
    expect(result).toEqual({ operations: [] });
  });

  it("does not discount shipping if the shopper removes ALL paid lines from the cart", () => {
    const result = runWith(
      [quizDeliveryLine({ isGift: true, expectedPaidCount: 4 })],
      [{ id: "gid://shopify/CartDeliveryGroup/1" }],
      quizShippingConfig(),
    );
    expect(result).toEqual({ operations: [] });
  });

  it("resumes discounting shipping once the missing paid line is added back", () => {
    const result = runWith(
      [
        quizDeliveryLine({ expectedPaidCount: 4 }),
        quizDeliveryLine({ expectedPaidCount: 4 }),
        quizDeliveryLine({ expectedPaidCount: 4 }),
        quizDeliveryLine({ expectedPaidCount: 4 }),
      ],
      [{ id: "gid://shopify/CartDeliveryGroup/1" }],
      quizShippingConfig(),
    );
    expect(result.operations).toHaveLength(1);
  });

  it("never touches lines from the unrelated Bundle Builder feature (_bundle_item/_bundle_id)", () => {
    const bundleBuilderLine = {
      quantity: 1,
      merchandise: { __typename: "ProductVariant", id: PROTEIN_VARIANT_ID },
      // No quizBundleIdAttribute at all — this rule only reads that key.
    };
    const result = runWith(
      [bundleBuilderLine],
      [{ id: "gid://shopify/CartDeliveryGroup/1" }],
      quizShippingConfig(),
    );
    expect(result).toEqual({ operations: [] });
  });

  it("ignores landing_free_shipping rules and vice versa in the same shared config", () => {
    const cfg = {
      version: 1,
      combinesWith: {
        orderDiscounts: true,
        productDiscounts: true,
        shippingDiscounts: true,
      },
      rules: [
        {
          id: "tru-landing-free-shipping",
          type: "landing_free_shipping",
          enabled: true,
          requiredLineAttributeKey: "__landing_source",
          requiredLineAttributeValue: "protein-complete-lp",
          message: "Free shipping — Protein Complete bundle",
        },
      ],
    };
    const result = runWith(
      [quizDeliveryLine({ expectedPaidCount: 1 })],
      [{ id: "gid://shopify/CartDeliveryGroup/1" }],
      cfg,
    );
    expect(result).toEqual({ operations: [] });
  });
});
