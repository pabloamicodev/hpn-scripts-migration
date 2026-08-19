import { describe, expect, it } from "vitest";

import { cartDeliveryOptionsDiscountsGenerateRun } from "./index.js";

const PROTEIN_VARIANT_ID = "gid://shopify/ProductVariant/31358533206097";

function lineWithAttribute(value, { quantity = 1, variantId = PROTEIN_VARIANT_ID } = {}) {
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
    combinesWith: { orderDiscounts: true, productDiscounts: true, shippingDiscounts: true },
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

function runWith(lines, deliveryGroups, cfg = config(), discountClasses = ["SHIPPING"]) {
  return cartDeliveryOptionsDiscountsGenerateRun({
    cart: { lines, deliveryGroups },
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
        cart: { lines: [], deliveryGroups: [{ id: "gid://shopify/CartDeliveryGroup/1" }] },
        discount: { discountClasses: ["SHIPPING"], metafield: null },
      }),
    ).toEqual({ operations: [] });

    expect(
      cartDeliveryOptionsDiscountsGenerateRun({
        cart: { lines: [], deliveryGroups: [{ id: "gid://shopify/CartDeliveryGroup/1" }] },
        discount: { discountClasses: ["SHIPPING"], metafield: { value: "{bad json" } },
      }),
    ).toEqual({ operations: [] });
  });

  it("discounts every delivery group to 100% via a single candidate (one checkout label, not one per group)", () => {
    const result = runWith(
      [lineWithAttribute("protein-complete-lp")],
      [{ id: "gid://shopify/CartDeliveryGroup/1" }, { id: "gid://shopify/CartDeliveryGroup/2" }],
    );

    expect(result).toEqual({
      operations: [
        {
          deliveryDiscountsAdd: {
            candidates: [
              {
                message: "Free shipping — Protein Complete bundle",
                targets: [
                  { deliveryGroup: { id: "gid://shopify/CartDeliveryGroup/1" } },
                  { deliveryGroup: { id: "gid://shopify/CartDeliveryGroup/2" } },
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
      combinesWith: { orderDiscounts: true, productDiscounts: true, shippingDiscounts: true },
      rules: [
        { id: "pa7", type: "pa7_cross_sell", enabled: true, triggerProductId: "x", targetProductIds: ["y"], targetLineQuantityEquals: 1, discountPercentage: 10, message: "irrelevant" },
      ],
    };
    const result = runWith([lineWithAttribute("protein-complete-lp")], [{ id: "gid://shopify/CartDeliveryGroup/1" }], cfg);

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
      combinesWith: { orderDiscounts: true, productDiscounts: true, shippingDiscounts: true },
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

  function quizDeliveryLine(
    { bundleId = "pq-1", isGift = false, expectedPaidCount = 1, quantity = 1 } = {},
  ) {
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
      combinesWith: { orderDiscounts: true, productDiscounts: true, shippingDiscounts: true },
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
