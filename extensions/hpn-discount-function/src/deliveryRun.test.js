import { describe, expect, it } from "vitest";

import { cartDeliveryOptionsDiscountsGenerateRun } from "./deliveryRun.js";

function lineWithAttribute(value) {
  return { landingSourceAttribute: value == null ? null : { value } };
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

  it("discounts every delivery group to 100% when a cart line carries the landing tag", () => {
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
                targets: [{ deliveryGroup: { id: "gid://shopify/CartDeliveryGroup/1" } }],
                value: { percentage: { value: "100" } },
              },
              {
                message: "Free shipping — Protein Complete bundle",
                targets: [{ deliveryGroup: { id: "gid://shopify/CartDeliveryGroup/2" } }],
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
