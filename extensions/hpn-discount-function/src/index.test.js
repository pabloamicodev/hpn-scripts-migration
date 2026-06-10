import { describe, expect, it } from "vitest";

import { cartLinesDiscountsGenerateRun } from "./index.js";

const PRODUCT_IDS = {
  pa7: "gid://shopify/Product/1313973239892",
  c2: "gid://shopify/Product/1319321763924",
  unrelated: "gid://shopify/Product/9999999999999",
  nad3_240: "gid://shopify/Product/6784435060873",
};

const VARIANT_IDS = {
  nad3Single: "gid://shopify/ProductVariant/21174522675284",
  plantaPb: "gid://shopify/ProductVariant/40608348438665",
  plantaCacao: "gid://shopify/ProductVariant/40608348373129",
  s9: "gid://shopify/ProductVariant/44633124995209",
  n4: "gid://shopify/ProductVariant/44633124864137",
  unrelated: "gid://shopify/ProductVariant/99999999999999",
};

const baseConfig = {
  version: 1,
  combinesWith: {
    orderDiscounts: true,
    productDiscounts: true,
    shippingDiscounts: true,
  },
  rules: [
    {
      id: "pa7-cross-sell",
      type: "pa7_cross_sell",
      enabled: true,
      triggerProductId: PRODUCT_IDS.pa7,
      targetProductIds: [PRODUCT_IDS.c2],
      targetLineQuantityEquals: 1,
      discountPercentage: 10,
      message: "PA7 cross-sell",
    },
    {
      id: "nad3-single-planta-samples",
      type: "required_variants_free_variants",
      enabled: true,
      requiredVariantIds: [
        VARIANT_IDS.nad3Single,
        VARIANT_IDS.plantaPb,
        VARIANT_IDS.plantaCacao,
      ],
      freeVariantIds: [VARIANT_IDS.plantaPb, VARIANT_IDS.plantaCacao],
      freeQuantityPerLine: null,
      message: "Free Planta Samples",
    },
    {
      id: "nad3-240-pouches",
      type: "required_product_with_free_variants",
      enabled: true,
      triggerProductId: PRODUCT_IDS.nad3_240,
      requiredVariantIds: [VARIANT_IDS.s9, VARIANT_IDS.n4],
      freeVariantIds: [VARIANT_IDS.s9, VARIANT_IDS.n4],
      freeQuantityPerLine: 1,
      message: "Free Pouches",
    },
  ],
};

function productLine(id, productId, variantId, quantity = 1) {
  return {
    id,
    quantity,
    merchandise: {
      __typename: "ProductVariant",
      id: variantId,
      product: {
        id: productId,
      },
    },
  };
}

function runWithLines(lines, config = baseConfig, discountClasses = ["PRODUCT"]) {
  return cartLinesDiscountsGenerateRun({
    cart: { lines },
    discount: {
      discountClasses,
      metafield: {
        value: JSON.stringify(config),
      },
    },
  });
}

function candidates(result) {
  return result.operations[0]?.productDiscountsAdd?.candidates ?? [];
}

describe("cartLinesDiscountsGenerateRun", () => {
  it("returns no operations when the discount does not include PRODUCT class", () => {
    const result = runWithLines(
      [productLine("pa7", PRODUCT_IDS.pa7, VARIANT_IDS.unrelated)],
      baseConfig,
      ["ORDER"],
    );

    expect(result).toEqual({ operations: [] });
  });

  it("returns no operations for missing or invalid config", () => {
    expect(
      cartLinesDiscountsGenerateRun({
        cart: { lines: [] },
        discount: { discountClasses: ["PRODUCT"], metafield: null },
      }),
    ).toEqual({ operations: [] });

    expect(
      cartLinesDiscountsGenerateRun({
        cart: { lines: [] },
        discount: {
          discountClasses: ["PRODUCT"],
          metafield: { value: "{bad json" },
        },
      }),
    ).toEqual({ operations: [] });
  });

  it("applies PA7 cross-sell discount only when the target quantity equals one", () => {
    const result = runWithLines([
      productLine("line-pa7", PRODUCT_IDS.pa7, VARIANT_IDS.unrelated),
      productLine("line-c2", PRODUCT_IDS.c2, VARIANT_IDS.unrelated),
      productLine("line-c2-qty2", PRODUCT_IDS.c2, VARIANT_IDS.unrelated, 2),
    ]);

    expect(candidates(result)).toEqual([
      {
        targets: [{ cartLine: { id: "line-c2" } }],
        value: { percentage: { value: "10" } },
        message: "PA7 cross-sell",
      },
    ]);
  });

  it("does not apply PA7 cross-sell without the trigger product", () => {
    const result = runWithLines([
      productLine("line-c2", PRODUCT_IDS.c2, VARIANT_IDS.unrelated),
    ]);

    expect(result).toEqual({ operations: [] });
  });

  it("applies Planta sample discounts when all required variants are present", () => {
    const result = runWithLines([
      productLine("nad3", PRODUCT_IDS.unrelated, VARIANT_IDS.nad3Single),
      productLine("pb", PRODUCT_IDS.unrelated, VARIANT_IDS.plantaPb, 2),
      productLine("cacao", PRODUCT_IDS.unrelated, VARIANT_IDS.plantaCacao),
    ]);

    expect(candidates(result)).toEqual([
      {
        targets: [{ cartLine: { id: "pb" } }],
        value: { percentage: { value: "100.0" } },
        message: "Free Planta Samples",
      },
      {
        targets: [{ cartLine: { id: "cacao" } }],
        value: { percentage: { value: "100.0" } },
        message: "Free Planta Samples",
      },
    ]);
  });

  it("does not apply Planta sample discounts when one sample is missing", () => {
    const result = runWithLines([
      productLine("nad3", PRODUCT_IDS.unrelated, VARIANT_IDS.nad3Single),
      productLine("pb", PRODUCT_IDS.unrelated, VARIANT_IDS.plantaPb),
    ]);

    expect(result).toEqual({ operations: [] });
  });

  it("applies only one free pouch unit per eligible pouch line", () => {
    const result = runWithLines([
      productLine("nad3-240", PRODUCT_IDS.nad3_240, VARIANT_IDS.unrelated),
      productLine("s9", PRODUCT_IDS.unrelated, VARIANT_IDS.s9, 3),
      productLine("n4", PRODUCT_IDS.unrelated, VARIANT_IDS.n4, 2),
    ]);

    expect(candidates(result)).toEqual([
      {
        targets: [{ cartLine: { id: "s9", quantity: 1 } }],
        value: { percentage: { value: "100.0" } },
        message: "Free Pouches",
      },
      {
        targets: [{ cartLine: { id: "n4", quantity: 1 } }],
        value: { percentage: { value: "100.0" } },
        message: "Free Pouches",
      },
    ]);
  });
});
