import { describe, expect, it } from "vitest";

import { cartLinesDiscountsGenerateRun } from "./index.js";

const PRODUCT_IDS = {
  pa7: "gid://shopify/Product/1313973239892",
  c2: "gid://shopify/Product/1319321763924",
  t5: "gid://shopify/Product/1313557741652",
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
      targetProductIds: [PRODUCT_IDS.c2, PRODUCT_IDS.t5],
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
      freeQuantityPerLine: 1,
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
      productLine("line-t5", PRODUCT_IDS.t5, VARIANT_IDS.unrelated),
      productLine("line-c2-qty2", PRODUCT_IDS.c2, VARIANT_IDS.unrelated, 2),
    ]);

    expect(candidates(result)).toEqual([
      {
        targets: [{ cartLine: { id: "line-c2" } }],
        value: { percentage: { value: "10" } },
        message: "PA7 cross-sell",
      },
      {
        targets: [{ cartLine: { id: "line-t5" } }],
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
        targets: [{ cartLine: { id: "pb", quantity: 1 } }],
        value: { percentage: { value: "100.0" } },
        message: "Free Planta Samples",
      },
      {
        targets: [{ cartLine: { id: "cacao", quantity: 1 } }],
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

  it("applies pouches discount when each free pouch line has exactly one unit", () => {
    const result = runWithLines([
      productLine("nad3-240", PRODUCT_IDS.nad3_240, VARIANT_IDS.unrelated),
      productLine("s9", PRODUCT_IDS.unrelated, VARIANT_IDS.s9, 1),
      productLine("n4", PRODUCT_IDS.unrelated, VARIANT_IDS.n4, 1),
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

  it("does not apply pouches discount when any pouch line quantity exceeds one", () => {
    const result = runWithLines([
      productLine("nad3-240", PRODUCT_IDS.nad3_240, VARIANT_IDS.unrelated),
      productLine("s9", PRODUCT_IDS.unrelated, VARIANT_IDS.s9, 3),
      productLine("n4", PRODUCT_IDS.unrelated, VARIANT_IDS.n4, 2),
    ]);

    expect(result).toEqual({ operations: [] });
  });

  it("does not apply pouches discount without the NAD3 240 trigger product", () => {
    const result = runWithLines([
      productLine("s9", PRODUCT_IDS.unrelated, VARIANT_IDS.s9),
      productLine("n4", PRODUCT_IDS.unrelated, VARIANT_IDS.n4),
    ]);

    expect(result).toEqual({ operations: [] });
  });

  it("does not apply pouches discount when one pouch variant is missing", () => {
    const result = runWithLines([
      productLine("nad3-240", PRODUCT_IDS.nad3_240, VARIANT_IDS.unrelated),
      productLine("s9", PRODUCT_IDS.unrelated, VARIANT_IDS.s9),
      // n4 is absent
    ]);

    expect(result).toEqual({ operations: [] });
  });

  it("skips disabled rules and produces no discounts", () => {
    const disabledConfig = {
      ...baseConfig,
      rules: baseConfig.rules.map((r) => ({ ...r, enabled: false })),
    };

    const result = runWithLines(
      [
        productLine("pa7", PRODUCT_IDS.pa7, VARIANT_IDS.unrelated),
        productLine("c2", PRODUCT_IDS.c2, VARIANT_IDS.unrelated),
      ],
      disabledConfig,
    );

    expect(result).toEqual({ operations: [] });
  });

  it("returns no discounts for an empty cart", () => {
    expect(runWithLines([])).toEqual({ operations: [] });
  });

  it("applies all three rules simultaneously when every trigger is present", () => {
    const result = runWithLines([
      // PA7 cross-sell: trigger + C2 qty 1
      productLine("pa7", PRODUCT_IDS.pa7, VARIANT_IDS.unrelated),
      productLine("c2", PRODUCT_IDS.c2, VARIANT_IDS.unrelated),
      // Planta samples: all three required variants
      productLine("nad3-single", PRODUCT_IDS.unrelated, VARIANT_IDS.nad3Single),
      productLine("pb", PRODUCT_IDS.unrelated, VARIANT_IDS.plantaPb),
      productLine("cacao", PRODUCT_IDS.unrelated, VARIANT_IDS.plantaCacao),
      // Pouches: NAD3 240 product + both pouch variants
      productLine("nad3-240", PRODUCT_IDS.nad3_240, VARIANT_IDS.unrelated),
      productLine("s9", PRODUCT_IDS.unrelated, VARIANT_IDS.s9),
      productLine("n4", PRODUCT_IDS.unrelated, VARIANT_IDS.n4),
    ]);

    const list = candidates(result);
    expect(list).toHaveLength(5);
    expect(list).toContainEqual({
      targets: [{ cartLine: { id: "c2" } }],
      value: { percentage: { value: "10" } },
      message: "PA7 cross-sell",
    });
    expect(list).toContainEqual({
      targets: [{ cartLine: { id: "pb", quantity: 1 } }],
      value: { percentage: { value: "100.0" } },
      message: "Free Planta Samples",
    });
    expect(list).toContainEqual({
      targets: [{ cartLine: { id: "cacao", quantity: 1 } }],
      value: { percentage: { value: "100.0" } },
      message: "Free Planta Samples",
    });
    expect(list).toContainEqual({
      targets: [{ cartLine: { id: "s9", quantity: 1 } }],
      value: { percentage: { value: "100.0" } },
      message: "Free Pouches",
    });
    expect(list).toContainEqual({
      targets: [{ cartLine: { id: "n4", quantity: 1 } }],
      value: { percentage: { value: "100.0" } },
      message: "Free Pouches",
    });
  });

  it("applies PA7 cross-sell correctly with multiple PA7 trigger lines in cart", () => {
    const result = runWithLines([
      productLine("pa7-a", PRODUCT_IDS.pa7, VARIANT_IDS.unrelated),
      productLine("pa7-b", PRODUCT_IDS.pa7, VARIANT_IDS.unrelated),
      productLine("c2", PRODUCT_IDS.c2, VARIANT_IDS.unrelated),
    ]);

    expect(candidates(result)).toEqual([
      {
        targets: [{ cartLine: { id: "c2" } }],
        value: { percentage: { value: "10" } },
        message: "PA7 cross-sell",
      },
    ]);
  });

  // ── PA7: percentage serialisation and non-default quantity threshold ──────

  it("serialises decimal PA7 discount percentage correctly", () => {
    const config = {
      ...baseConfig,
      rules: [
        {
          ...baseConfig.rules[0],
          discountPercentage: 15.5,
        },
        ...baseConfig.rules.slice(1),
      ],
    };

    const result = runWithLines(
      [
        productLine("pa7", PRODUCT_IDS.pa7, VARIANT_IDS.unrelated),
        productLine("c2", PRODUCT_IDS.c2, VARIANT_IDS.unrelated),
      ],
      config,
    );

    expect(candidates(result)[0].value).toEqual({ percentage: { value: "15.5" } });
  });

  it("applies PA7 cross-sell only when target line quantity matches a non-default threshold", () => {
    const config = {
      ...baseConfig,
      rules: [
        {
          ...baseConfig.rules[0],
          targetLineQuantityEquals: 2,
        },
        ...baseConfig.rules.slice(1),
      ],
    };

    const result = runWithLines(
      [
        productLine("pa7", PRODUCT_IDS.pa7, VARIANT_IDS.unrelated),
        productLine("c2-qty1", PRODUCT_IDS.c2, VARIANT_IDS.unrelated, 1), // wrong qty
        productLine("c2-qty2", PRODUCT_IDS.c2, VARIANT_IDS.unrelated, 2), // correct qty
      ],
      config,
    );

    expect(candidates(result)).toEqual([
      {
        targets: [{ cartLine: { id: "c2-qty2" } }],
        value: { percentage: { value: "10" } },
        message: "PA7 cross-sell",
      },
    ]);
  });

  // ── Planta: one free unit per variant across the cart ─────────────────────

  it("discounts exactly one unit of each Planta variant", () => {
    const config = {
      ...baseConfig,
      rules: [
        baseConfig.rules[0],
        {
          ...baseConfig.rules[1],
          freeQuantityPerLine: 1,
        },
        baseConfig.rules[2],
      ],
    };

    const result = runWithLines(
      [
        productLine("nad3", PRODUCT_IDS.unrelated, VARIANT_IDS.nad3Single),
        productLine("pb", PRODUCT_IDS.unrelated, VARIANT_IDS.plantaPb, 3),
        productLine("cacao", PRODUCT_IDS.unrelated, VARIANT_IDS.plantaCacao, 2),
      ],
      config,
    );

    expect(candidates(result)).toEqual([
      {
        targets: [{ cartLine: { id: "pb", quantity: 1 } }],
        value: { percentage: { value: "100.0" } },
        message: "Free Planta Samples",
      },
      {
        targets: [{ cartLine: { id: "cacao", quantity: 1 } }],
        value: { percentage: { value: "100.0" } },
        message: "Free Planta Samples",
      },
    ]);
  });

  it("skips an unsafe Planta config that allows more than one free unit", () => {
    const config = {
      ...baseConfig,
      rules: [
        baseConfig.rules[0],
        {
          ...baseConfig.rules[1],
          freeQuantityPerLine: 5,
        },
        baseConfig.rules[2],
      ],
    };

    const result = runWithLines(
      [
        productLine("nad3", PRODUCT_IDS.unrelated, VARIANT_IDS.nad3Single),
        productLine("pb", PRODUCT_IDS.unrelated, VARIANT_IDS.plantaPb, 2),
        productLine("cacao", PRODUCT_IDS.unrelated, VARIANT_IDS.plantaCacao),
      ],
      config,
    );

    expect(result).toEqual({ operations: [] });
  });

  it("discounts only one line when the same Planta variant is split across cart lines", () => {
    const result = runWithLines([
      productLine("nad3", PRODUCT_IDS.unrelated, VARIANT_IDS.nad3Single),
      productLine("pb-a", PRODUCT_IDS.unrelated, VARIANT_IDS.plantaPb),
      productLine("pb-b", PRODUCT_IDS.unrelated, VARIANT_IDS.plantaPb),
      productLine("cacao-a", PRODUCT_IDS.unrelated, VARIANT_IDS.plantaCacao),
      productLine("cacao-b", PRODUCT_IDS.unrelated, VARIANT_IDS.plantaCacao),
    ]);

    expect(candidates(result)).toEqual([
      {
        targets: [{ cartLine: { id: "pb-a", quantity: 1 } }],
        value: { percentage: { value: "100.0" } },
        message: "Free Planta Samples",
      },
      {
        targets: [{ cartLine: { id: "cacao-a", quantity: 1 } }],
        value: { percentage: { value: "100.0" } },
        message: "Free Planta Samples",
      },
    ]);
  });

  // ── Pouches: missing freeQuantityPerLine guard ────────────────────────────

  it("skips pouches rule when freeQuantityPerLine is missing from config", () => {
    const { freeQuantityPerLine: _omitted, ...pouchesRuleWithoutCap } = baseConfig.rules[2];
    const config = {
      ...baseConfig,
      rules: [baseConfig.rules[0], baseConfig.rules[1], pouchesRuleWithoutCap],
    };

    const result = runWithLines(
      [
        productLine("nad3-240", PRODUCT_IDS.nad3_240, VARIANT_IDS.unrelated),
        productLine("s9", PRODUCT_IDS.unrelated, VARIANT_IDS.s9),
        productLine("n4", PRODUCT_IDS.unrelated, VARIANT_IDS.n4),
      ],
      config,
    );

    expect(result).toEqual({ operations: [] });
  });

  // ── Error handling: non-ProductVariant lines and malformed rules ──────────

  it("ignores non-ProductVariant cart lines when evaluating rules", () => {
    const giftCardLine = {
      id: "gift",
      quantity: 1,
      merchandise: { __typename: "CustomProduct", id: "gid://shopify/CustomProduct/1" },
    };

    const result = runWithLines([
      productLine("pa7", PRODUCT_IDS.pa7, VARIANT_IDS.unrelated),
      productLine("c2", PRODUCT_IDS.c2, VARIANT_IDS.unrelated),
      giftCardLine,
    ]);

    // Gift card is filtered out; PA7 rule still fires for c2
    expect(candidates(result)).toEqual([
      {
        targets: [{ cartLine: { id: "c2" } }],
        value: { percentage: { value: "10" } },
        message: "PA7 cross-sell",
      },
    ]);
  });

  it("skips null and malformed entries inside the rules array", () => {
    const config = {
      ...baseConfig,
      rules: [
        null,
        { id: "broken" }, // missing type
        { type: 42, enabled: true }, // type is not a string
        baseConfig.rules[0], // valid — should still fire
      ],
    };

    const result = runWithLines(
      [
        productLine("pa7", PRODUCT_IDS.pa7, VARIANT_IDS.unrelated),
        productLine("c2", PRODUCT_IDS.c2, VARIANT_IDS.unrelated),
      ],
      config,
    );

    expect(candidates(result)).toEqual([
      {
        targets: [{ cartLine: { id: "c2" } }],
        value: { percentage: { value: "10" } },
        message: "PA7 cross-sell",
      },
    ]);
  });

  // ── Enabled: partial disable (one rule off, others still fire) ────────────

  it("fires remaining rules when only one rule is disabled", () => {
    const config = {
      ...baseConfig,
      rules: [
        { ...baseConfig.rules[0], enabled: false }, // PA7 disabled
        baseConfig.rules[1], // Planta enabled
        baseConfig.rules[2], // Pouches enabled
      ],
    };

    const result = runWithLines(
      [
        // PA7 trigger in cart but rule is off
        productLine("pa7", PRODUCT_IDS.pa7, VARIANT_IDS.unrelated),
        productLine("c2", PRODUCT_IDS.c2, VARIANT_IDS.unrelated),
        // Planta: all required present
        productLine("nad3", PRODUCT_IDS.unrelated, VARIANT_IDS.nad3Single),
        productLine("pb", PRODUCT_IDS.unrelated, VARIANT_IDS.plantaPb),
        productLine("cacao", PRODUCT_IDS.unrelated, VARIANT_IDS.plantaCacao),
      ],
      config,
    );

    const list = candidates(result);
    // c2 must NOT be discounted (PA7 rule is off)
    expect(list.some((c) => c.targets[0]?.cartLine?.id === "c2")).toBe(false);
    // Planta samples must still be discounted
    expect(list).toContainEqual({
      targets: [{ cartLine: { id: "pb", quantity: 1 } }],
      value: { percentage: { value: "100.0" } },
      message: "Free Planta Samples",
    });
    expect(list).toContainEqual({
      targets: [{ cartLine: { id: "cacao", quantity: 1 } }],
      value: { percentage: { value: "100.0" } },
      message: "Free Planta Samples",
    });
  });

  it("deduplicates overlapping rules and keeps the strongest discount per line", () => {
    const result = runWithLines([
      productLine("pa7", PRODUCT_IDS.pa7, VARIANT_IDS.unrelated),
      productLine("nad3", PRODUCT_IDS.unrelated, VARIANT_IDS.nad3Single),
      productLine("shared", PRODUCT_IDS.c2, VARIANT_IDS.plantaPb),
      productLine("cacao", PRODUCT_IDS.unrelated, VARIANT_IDS.plantaCacao),
    ]);

    const list = candidates(result);
    expect(list.filter((candidate) => candidate.targets[0].cartLine.id === "shared"))
      .toEqual([
        {
          targets: [{ cartLine: { id: "shared", quantity: 1 } }],
          value: { percentage: { value: "100.0" } },
          message: "Free Planta Samples",
        },
      ]);
  });

  it("skips a pouches rule configured with more than one free unit", () => {
    const config = {
      ...baseConfig,
      rules: [
        baseConfig.rules[0],
        baseConfig.rules[1],
        { ...baseConfig.rules[2], freeQuantityPerLine: 2 },
      ],
    };

    const result = runWithLines(
      [
        productLine("nad3-240", PRODUCT_IDS.nad3_240, VARIANT_IDS.unrelated),
        productLine("s9", PRODUCT_IDS.unrelated, VARIANT_IDS.s9, 3),
        productLine("n4", PRODUCT_IDS.unrelated, VARIANT_IDS.n4, 3),
      ],
      config,
    );

    expect(result).toEqual({ operations: [] });
  });
});
