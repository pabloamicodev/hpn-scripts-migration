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

  it("applies only one free pouch unit per eligible pouch line regardless of cart quantity", () => {
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

  it("caps freeQuantityPerLine at the actual line quantity (Math.min)", () => {
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

    // freeQuantityPerLine=5 but line has qty=2 (pb) and qty=1 (cacao)
    // → discounts min(5,2)=2 and min(5,1)=1 respectively
    expect(candidates(result)).toEqual([
      {
        targets: [{ cartLine: { id: "pb", quantity: 2 } }],
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

  it("caps pouches freeQuantityPerLine at the actual line quantity (Math.min)", () => {
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

    // freeQuantityPerLine=2, lines have qty=3 → discounts min(2,3)=2 each
    expect(candidates(result)).toEqual([
      {
        targets: [{ cartLine: { id: "s9", quantity: 2 } }],
        value: { percentage: { value: "100.0" } },
        message: "Free Pouches",
      },
      {
        targets: [{ cartLine: { id: "n4", quantity: 2 } }],
        value: { percentage: { value: "100.0" } },
        message: "Free Pouches",
      },
    ]);
  });
});

// ---------------------------------------------------------------------------
// Helper for tests that need full cart context (attributes, buyerIdentity, cost)
// ---------------------------------------------------------------------------

function runWithCart(cart, config = baseConfig, discountClasses = ["PRODUCT"]) {
  return cartLinesDiscountsGenerateRun({
    cart,
    discount: {
      discountClasses,
      metafield: { value: JSON.stringify(config) },
    },
  });
}

// ---------------------------------------------------------------------------
// trigger_product_discounted_targets
// ---------------------------------------------------------------------------

describe("trigger_product_discounted_targets", () => {
  const HERO = "gid://shopify/Product/8800000000001";
  const UPSELL_A = "gid://shopify/Product/8800000000002";
  const UPSELL_B = "gid://shopify/Product/8800000000003";

  const config = {
    version: 1,
    combinesWith: { orderDiscounts: true, productDiscounts: true, shippingDiscounts: true },
    rules: [
      {
        id: "landing-bundle",
        type: "trigger_product_discounted_targets",
        enabled: true,
        triggerProductId: HERO,
        targets: [
          { productId: UPSELL_A, discountPercentage: 100 },
          { productId: UPSELL_B, discountPercentage: 35 },
        ],
        message: "Landing page bundle",
      },
    ],
  };

  it("discounts all target products when trigger is in cart", () => {
    const result = runWithLines([
      productLine("hero", HERO, VARIANT_IDS.unrelated),
      productLine("upsell-a", UPSELL_A, VARIANT_IDS.unrelated),
      productLine("upsell-b", UPSELL_B, VARIANT_IDS.unrelated),
    ], config);
    const list = candidates(result);
    expect(list).toHaveLength(2);
    expect(list.some((c) => c.targets[0].cartLine.id === "upsell-a" && c.value.percentage.value === "100.0")).toBe(true);
    expect(list.some((c) => c.targets[0].cartLine.id === "upsell-b" && c.value.percentage.value === "35")).toBe(true);
  });

  it("does nothing when trigger product is absent from cart", () => {
    const result = runWithLines([
      productLine("upsell-a", UPSELL_A, VARIANT_IDS.unrelated),
      productLine("upsell-b", UPSELL_B, VARIANT_IDS.unrelated),
    ], config);
    expect(result).toEqual({ operations: [] });
  });

  it("discounts only the targets actually present in cart (partial set)", () => {
    const result = runWithLines([
      productLine("hero", HERO, VARIANT_IDS.unrelated),
      productLine("upsell-a", UPSELL_A, VARIANT_IDS.unrelated),
      // UPSELL_B absent
    ], config);
    const list = candidates(result);
    expect(list).toHaveLength(1);
    expect(list[0].targets[0].cartLine.id).toBe("upsell-a");
    expect(list[0].value.percentage.value).toBe("100.0");
  });

  it("discounts multiple cart lines of the same target product", () => {
    const result = runWithLines([
      productLine("hero", HERO, VARIANT_IDS.unrelated),
      productLine("upsell-a-v1", UPSELL_A, VARIANT_IDS.unrelated),
      productLine("upsell-a-v2", UPSELL_A, VARIANT_IDS.s9), // same product, different variant/line
    ], config);
    const aLines = candidates(result).filter(
      (c) => c.targets[0].cartLine.id === "upsell-a-v1" || c.targets[0].cartLine.id === "upsell-a-v2",
    );
    expect(aLines).toHaveLength(2);
    expect(aLines.every((c) => c.value.percentage.value === "100.0")).toBe(true);
  });

  it("serialises partial percentage as a plain string (35 → '35', not '35.0')", () => {
    const result = runWithLines([
      productLine("hero", HERO, VARIANT_IDS.unrelated),
      productLine("upsell-b", UPSELL_B, VARIANT_IDS.unrelated),
    ], config);
    const [candidate] = candidates(result);
    expect(candidate.value.percentage.value).toBe("35");
  });

  it("fires when trigger product is also listed as a target (self-discount)", () => {
    const selfTargetConfig = {
      ...config,
      rules: [
        {
          ...config.rules[0],
          id: "self-bundle",
          targets: [
            { productId: HERO, discountPercentage: 20 }, // trigger discounts itself
            { productId: UPSELL_A, discountPercentage: 50 },
          ],
        },
      ],
    };
    const result = runWithLines([
      productLine("hero", HERO, VARIANT_IDS.unrelated),
      productLine("upsell-a", UPSELL_A, VARIANT_IDS.unrelated),
    ], selfTargetConfig);
    const list = candidates(result);
    expect(list).toHaveLength(2);
    expect(list.find((c) => c.targets[0].cartLine.id === "hero")?.value.percentage.value).toBe("20");
    expect(list.find((c) => c.targets[0].cartLine.id === "upsell-a")?.value.percentage.value).toBe("50");
  });

  it("skips rule when targets array is empty (malformed config, no valid target entries)", () => {
    const emptyTargetsConfig = { ...config, rules: [{ ...config.rules[0], targets: [] }] };
    const result = runWithLines([
      productLine("hero", HERO, VARIANT_IDS.unrelated),
    ], emptyTargetsConfig);
    expect(result).toEqual({ operations: [] });
  });
});

// ---------------------------------------------------------------------------
// loyalty_tier
// ---------------------------------------------------------------------------

describe("loyalty_tier", () => {
  const LOYALTY_PROD = "gid://shopify/Product/7700000000001";
  const LOYALTY_PROD_2 = "gid://shopify/Product/7700000000002";

  function loyaltyConfig(tiers, targetProductIds = [LOYALTY_PROD]) {
    return {
      version: 1,
      combinesWith: { orderDiscounts: true, productDiscounts: true, shippingDiscounts: true },
      rules: [
        {
          id: "loyalty",
          type: "loyalty_tier",
          enabled: true,
          targetProductIds,
          tiers,
          message: "Loyalty reward",
        },
      ],
    };
  }

  function runWithCustomer(numberOfOrders, cfg, lines) {
    return runWithCart({
      lines,
      buyerIdentity: { customer: { numberOfOrders } },
      attributes: [],
      cost: { subtotalAmount: { amount: "100.00" } },
    }, cfg);
  }

  const tiers = [
    { minOrders: 10, discountPercentage: 25 },
    { minOrders: 5, discountPercentage: 15 },
    { minOrders: 1, discountPercentage: 5 },
  ];

  const loyaltyLine = [productLine("p1", LOYALTY_PROD, VARIANT_IDS.unrelated)];

  it("skips when no customer in buyerIdentity (guest checkout)", () => {
    const cfg = loyaltyConfig(tiers);
    const result = runWithCart({
      lines: loyaltyLine,
      buyerIdentity: {},
      attributes: [],
      cost: { subtotalAmount: { amount: "100.00" } },
    }, cfg);
    expect(result).toEqual({ operations: [] });
  });

  it("applies lowest tier when customer has exactly the required minOrders (boundary qualifies)", () => {
    const [candidate] = candidates(runWithCustomer(1, loyaltyConfig(tiers), loyaltyLine));
    expect(candidate.value.percentage.value).toBe("5");
  });

  it("applies the highest qualifying tier, not the first qualifying one", () => {
    // Customer with 7 orders qualifies for both 1-order and 5-order tiers → picks 5-order (15%)
    const [candidate] = candidates(runWithCustomer(7, loyaltyConfig(tiers), loyaltyLine));
    expect(candidate.value.percentage.value).toBe("15");
  });

  it("applies top tier when customer exceeds all thresholds", () => {
    const [candidate] = candidates(runWithCustomer(20, loyaltyConfig(tiers), loyaltyLine));
    expect(candidate.value.percentage.value).toBe("25");
  });

  it("returns nothing when customer has 0 orders and lowest tier requires 1", () => {
    const result = runWithCustomer(0, loyaltyConfig(tiers), loyaltyLine);
    expect(result).toEqual({ operations: [] });
  });

  it("minOrders:0 tier qualifies any logged-in customer, including brand-new ones (0 orders)", () => {
    const cfg = loyaltyConfig([
      { minOrders: 0, discountPercentage: 5 },
      { minOrders: 5, discountPercentage: 15 },
    ]);
    const [candidate] = candidates(runWithCustomer(0, cfg, loyaltyLine));
    expect(candidate.value.percentage.value).toBe("5");
  });

  it("tiers provided in ascending order in config still resolves to highest qualifying tier", () => {
    // Function must sort descending internally to find the best tier
    const unsortedTiers = [
      { minOrders: 1, discountPercentage: 5 },   // lowest tier listed first
      { minOrders: 5, discountPercentage: 15 },
      { minOrders: 10, discountPercentage: 25 },  // highest tier listed last
    ];
    const [candidate] = candidates(runWithCustomer(8, loyaltyConfig(unsortedTiers), loyaltyLine));
    expect(candidate.value.percentage.value).toBe("15"); // 8 orders → 5-order tier wins
  });

  it("applies loyalty discount to all lines of all configured target products", () => {
    const cfg = loyaltyConfig(tiers, [LOYALTY_PROD, LOYALTY_PROD_2]);
    const lines = [
      productLine("p1", LOYALTY_PROD, VARIANT_IDS.unrelated),
      productLine("p2", LOYALTY_PROD_2, VARIANT_IDS.s9),
    ];
    const list = candidates(runWithCustomer(5, cfg, lines));
    expect(list).toHaveLength(2);
    expect(list.every((c) => c.value.percentage.value === "15")).toBe(true);
  });

  it("does nothing when the target product is not in the cart", () => {
    const cfg = loyaltyConfig(tiers);
    const result = runWithCustomer(10, cfg, [
      productLine("unrelated", PRODUCT_IDS.unrelated, VARIANT_IDS.unrelated),
    ]);
    expect(result).toEqual({ operations: [] });
  });
});

// ---------------------------------------------------------------------------
// global conditions (all rule types)
// ---------------------------------------------------------------------------

describe("global conditions", () => {
  function pa7WithConditions(conditions) {
    return {
      version: 1,
      combinesWith: { orderDiscounts: true, productDiscounts: true, shippingDiscounts: true },
      rules: [
        {
          id: "pa7",
          type: "pa7_cross_sell",
          enabled: true,
          triggerProductId: PRODUCT_IDS.pa7,
          targetProductIds: [PRODUCT_IDS.c2],
          targetLineQuantityEquals: 1,
          discountPercentage: 10,
          message: "PA7 cross-sell",
          conditions,
        },
      ],
    };
  }

  function fullCart({ lines, attributes = [], subtotal = "100.00", buyerIdentity = {} }) {
    return { lines, attributes, cost: { subtotalAmount: { amount: subtotal } }, buyerIdentity };
  }

  const pa7Lines = [
    productLine("pa7", PRODUCT_IDS.pa7, VARIANT_IDS.unrelated),
    productLine("c2", PRODUCT_IDS.c2, VARIANT_IDS.unrelated),
  ];

  it("fires when subtotal equals minimumCartSubtotal exactly (boundary must pass)", () => {
    const result = runWithCart(
      fullCart({ lines: pa7Lines, subtotal: "50.00" }),
      pa7WithConditions({ minimumCartSubtotal: 50 }),
    );
    expect(candidates(result)).toHaveLength(1);
  });

  it("skips when subtotal is one cent below minimumCartSubtotal", () => {
    const result = runWithCart(
      fullCart({ lines: pa7Lines, subtotal: "49.99" }),
      pa7WithConditions({ minimumCartSubtotal: 50 }),
    );
    expect(result).toEqual({ operations: [] });
  });

  it("fires when subtotal is above minimumCartSubtotal", () => {
    const result = runWithCart(
      fullCart({ lines: pa7Lines, subtotal: "200.00" }),
      pa7WithConditions({ minimumCartSubtotal: 50 }),
    );
    expect(candidates(result)).toHaveLength(1);
  });

  it("skips when required cart attribute key is absent", () => {
    const result = runWithCart(
      fullCart({ lines: pa7Lines, attributes: [] }),
      pa7WithConditions({ requiredCartAttributeKey: "source" }),
    );
    expect(result).toEqual({ operations: [] });
  });

  it("fires when required attribute key is present with any value (key-only check)", () => {
    const result = runWithCart(
      fullCart({ lines: pa7Lines, attributes: [{ key: "source", value: "lp-supplement-x" }] }),
      pa7WithConditions({ requiredCartAttributeKey: "source" }),
    );
    expect(candidates(result)).toHaveLength(1);
  });

  it("fires with key-only condition when CartAttribute.value is null (nullable field per Shopify API)", () => {
    // CartAttribute.value is Maybe<String> — null is a valid value when only checking key presence
    const result = runWithCart(
      fullCart({ lines: pa7Lines, attributes: [{ key: "source", value: null }] }),
      pa7WithConditions({ requiredCartAttributeKey: "source" }),
    );
    expect(candidates(result)).toHaveLength(1);
  });

  it("fires when attribute key and value both match exactly", () => {
    const result = runWithCart(
      fullCart({ lines: pa7Lines, attributes: [{ key: "source", value: "lp-supplement-x" }] }),
      pa7WithConditions({ requiredCartAttributeKey: "source", requiredCartAttributeValue: "lp-supplement-x" }),
    );
    expect(candidates(result)).toHaveLength(1);
  });

  it("skips when attribute key is present but value does not match", () => {
    const result = runWithCart(
      fullCart({ lines: pa7Lines, attributes: [{ key: "source", value: "lp-other" }] }),
      pa7WithConditions({ requiredCartAttributeKey: "source", requiredCartAttributeValue: "lp-supplement-x" }),
    );
    expect(result).toEqual({ operations: [] });
  });

  it("skips when requiredCartAttributeValue is set but CartAttribute.value is null", () => {
    const result = runWithCart(
      fullCart({ lines: pa7Lines, attributes: [{ key: "source", value: null }] }),
      pa7WithConditions({ requiredCartAttributeKey: "source", requiredCartAttributeValue: "lp-supplement-x" }),
    );
    expect(result).toEqual({ operations: [] });
  });

  it("fires when requiresSubscriptionInCart is true and a subscription line is in the cart", () => {
    const subLine = {
      ...productLine("sub", PRODUCT_IDS.pa7, VARIANT_IDS.unrelated),
      sellingPlanAllocation: { sellingPlan: { id: "gid://shopify/SellingPlan/1" } },
    };
    const result = runWithCart(
      fullCart({ lines: [subLine, productLine("c2", PRODUCT_IDS.c2, VARIANT_IDS.unrelated)] }),
      pa7WithConditions({ requiresSubscriptionInCart: true }),
    );
    expect(candidates(result)).toHaveLength(1);
  });

  it("skips when requiresSubscriptionInCart is true but no subscription in cart", () => {
    const result = runWithCart(
      fullCart({ lines: pa7Lines }),
      pa7WithConditions({ requiresSubscriptionInCart: true }),
    );
    expect(result).toEqual({ operations: [] });
  });

  it("a failing condition on one rule does not block other rules in the same config", () => {
    const config = {
      version: 1,
      combinesWith: { orderDiscounts: true, productDiscounts: true, shippingDiscounts: true },
      rules: [
        {
          id: "pa7",
          type: "pa7_cross_sell",
          enabled: true,
          triggerProductId: PRODUCT_IDS.pa7,
          targetProductIds: [PRODUCT_IDS.c2],
          targetLineQuantityEquals: 1,
          discountPercentage: 10,
          message: "PA7 cross-sell",
          conditions: { minimumCartSubtotal: 999 }, // will not be met
        },
        {
          id: "planta",
          type: "required_variants_free_variants",
          enabled: true,
          requiredVariantIds: [VARIANT_IDS.nad3Single, VARIANT_IDS.plantaPb, VARIANT_IDS.plantaCacao],
          freeVariantIds: [VARIANT_IDS.plantaPb, VARIANT_IDS.plantaCacao],
          freeQuantityPerLine: 1,
          discountPercentage: 100,
          message: "Free Planta Samples",
          // no conditions — fires unconditionally
        },
      ],
    };
    const result = runWithCart(
      fullCart({
        lines: [
          productLine("pa7", PRODUCT_IDS.pa7, VARIANT_IDS.unrelated),
          productLine("c2", PRODUCT_IDS.c2, VARIANT_IDS.unrelated),
          productLine("nad3", PRODUCT_IDS.unrelated, VARIANT_IDS.nad3Single),
          productLine("pb", PRODUCT_IDS.unrelated, VARIANT_IDS.plantaPb),
          productLine("cacao", PRODUCT_IDS.unrelated, VARIANT_IDS.plantaCacao),
        ],
        subtotal: "80.00",
      }),
      config,
    );
    const list = candidates(result);
    // PA7 blocked, Planta fires
    expect(list.some((c) => c.targets[0].cartLine.id === "c2")).toBe(false);
    expect(list.some((c) => c.targets[0].cartLine.id === "pb")).toBe(true);
    expect(list.some((c) => c.targets[0].cartLine.id === "cacao")).toBe(true);
  });

  it("all conditions must pass — a single failure blocks the rule even if others are satisfied", () => {
    const config = pa7WithConditions({
      minimumCartSubtotal: 50,
      requiredCartAttributeKey: "source",
    });
    // Subtotal is satisfied (80 >= 50), but attribute is missing → should skip
    const result = runWithCart(
      fullCart({ lines: pa7Lines, subtotal: "80.00", attributes: [] }),
      config,
    );
    expect(result).toEqual({ operations: [] });
  });
});

// ---------------------------------------------------------------------------
// subscription_bundle_group (One Sol Bundle-Two Subscription Discount)
// ---------------------------------------------------------------------------

describe("subscription_bundle_group", () => {
  const ACAI = "gid://shopify/Product/7193611337967";
  const CHURRO = "gid://shopify/Product/9000958230767";
  const SELLING_PLAN = { sellingPlan: { id: "gid://shopify/SellingPlan/1" } };

  function bundleConfig(overrides = {}) {
    return {
      version: 1,
      combinesWith: { orderDiscounts: true, productDiscounts: true, shippingDiscounts: true },
      rules: [
        {
          id: "bundle-two-subscription",
          type: "subscription_bundle_group",
          enabled: true,
          targetProductIds: [ACAI, CHURRO],
          discountPercentage: 10,
          maxUnitsTotal: 2,
          requiredLineAttributeKey: "__bundle_type",
          requiredLineAttributeValue: "two",
          message: "10% off first two subscription units",
          ...overrides,
        },
      ],
    };
  }

  // sellingPlanAllocation: undefined → not a subscription line.
  // attributeValue: null → no __bundle_type attribute on the line.
  function bundleLine(id, productId, quantity, { subscription = true, attributeValue = "two" } = {}) {
    return {
      ...productLine(id, productId, VARIANT_IDS.unrelated, quantity),
      sellingPlanAllocation: subscription ? SELLING_PLAN : undefined,
      attribute: attributeValue === null ? null : { value: attributeValue },
    };
  }

  it("discounts a single qualifying subscription unit", () => {
    const result = runWithLines(
      [bundleLine("line1", ACAI, 1)],
      bundleConfig(),
    );
    expect(candidates(result)).toEqual([
      {
        targets: [{ cartLine: { id: "line1", quantity: 1 } }],
        value: { percentage: { value: "10" } },
        message: "10% off first two subscription units",
      },
    ]);
  });

  it("discounts both units when exactly 2 qualifying units are in one line", () => {
    const result = runWithLines(
      [bundleLine("line1", ACAI, 2)],
      bundleConfig(),
    );
    expect(candidates(result)).toEqual([
      {
        targets: [{ cartLine: { id: "line1", quantity: 2 } }],
        value: { percentage: { value: "10" } },
        message: "10% off first two subscription units",
      },
    ]);
  });

  it("caps the discount at 2 units when a single line has 3 qualifying units", () => {
    const result = runWithLines(
      [bundleLine("line1", ACAI, 3)],
      bundleConfig(),
    );
    expect(candidates(result)).toEqual([
      {
        targets: [{ cartLine: { id: "line1", quantity: 2 } }],
        value: { percentage: { value: "10" } },
        message: "10% off first two subscription units",
      },
    ]);
  });

  it("caps the discount at 2 total units cart-wide across two different qualifying products", () => {
    const result = runWithLines(
      [bundleLine("acai", ACAI, 1), bundleLine("churro", CHURRO, 1)],
      bundleConfig(),
    );
    expect(candidates(result)).toEqual([
      {
        targets: [{ cartLine: { id: "acai", quantity: 1 } }],
        value: { percentage: { value: "10" } },
        message: "10% off first two subscription units",
      },
      {
        targets: [{ cartLine: { id: "churro", quantity: 1 } }],
        value: { percentage: { value: "10" } },
        message: "10% off first two subscription units",
      },
    ]);
  });

  it("does not discount when the line has no __bundle_type attribute", () => {
    const result = runWithLines(
      [bundleLine("line1", ACAI, 1, { attributeValue: null })],
      bundleConfig(),
    );
    expect(result).toEqual({ operations: [] });
  });

  it("does not discount when __bundle_type has the wrong value", () => {
    const result = runWithLines(
      [bundleLine("line1", ACAI, 1, { attributeValue: "one" })],
      bundleConfig(),
    );
    expect(result).toEqual({ operations: [] });
  });

  it("does not discount a non-subscription line even with __bundle_type=two", () => {
    const result = runWithLines(
      [bundleLine("line1", ACAI, 1, { subscription: false })],
      bundleConfig(),
    );
    expect(result).toEqual({ operations: [] });
  });

  it("skips the attribute check when requiredLineAttributeKey is not configured", () => {
    const result = runWithLines(
      [bundleLine("line1", ACAI, 1, { attributeValue: null })],
      bundleConfig({ requiredLineAttributeKey: undefined, requiredLineAttributeValue: undefined }),
    );
    expect(candidates(result)).toEqual([
      {
        targets: [{ cartLine: { id: "line1", quantity: 1 } }],
        value: { percentage: { value: "10" } },
        message: "10% off first two subscription units",
      },
    ]);
  });
});

// ---------------------------------------------------------------------------
// one_time_purchase_discount (One Sol Acai/Unicorn Milkshake 25% off)
// ---------------------------------------------------------------------------

describe("one_time_purchase_discount", () => {
  // Acai Berry Blast and Unicorn Milkshake are each sold as a variant under
  // two different products — 4 eligible variants total.
  const PRODUCT_ONE_ACAI = "gid://shopify/ProductVariant/42477833322735";
  const PRODUCT_ONE_UNICORN = "gid://shopify/ProductVariant/44045687324911";
  const PRODUCT_TWO_ACAI = "gid://shopify/ProductVariant/46171937145071";
  const PRODUCT_TWO_UNICORN = "gid://shopify/ProductVariant/46171936981231";

  function config(overrides = {}) {
    return {
      version: 1,
      combinesWith: { orderDiscounts: true, productDiscounts: true, shippingDiscounts: true },
      rules: [
        {
          id: "acai-unicorn-onetime-25-off",
          type: "one_time_purchase_discount",
          enabled: true,
          targetVariantIds: [PRODUCT_ONE_ACAI, PRODUCT_ONE_UNICORN, PRODUCT_TWO_ACAI, PRODUCT_TWO_UNICORN],
          discountPercentage: 25,
          message: "25% off Acai Berry Blast / Unicorn Milkshake",
          ...overrides,
        },
      ],
    };
  }

  function flavorLine(id, variantId, quantity, { subscription = false } = {}) {
    return {
      ...productLine(id, PRODUCT_IDS.unrelated, variantId, quantity),
      sellingPlanAllocation: subscription ? { sellingPlan: { id: "gid://shopify/SellingPlan/1" } } : undefined,
    };
  }

  it("discounts a one-time-purchase eligible variant at 25%, single unit", () => {
    const result = runWithLines([flavorLine("line1", PRODUCT_ONE_ACAI, 1)], config());
    expect(candidates(result)).toEqual([
      {
        targets: [{ cartLine: { id: "line1", quantity: 1 } }],
        value: { percentage: { value: "25" } },
        message: "25% off Acai Berry Blast / Unicorn Milkshake",
      },
    ]);
  });

  it("discounts only 1 unit on the line, regardless of quantity", () => {
    const result = runWithLines([flavorLine("line1", PRODUCT_ONE_ACAI, 10)], config());
    expect(candidates(result)).toEqual([
      {
        targets: [{ cartLine: { id: "line1", quantity: 1 } }],
        value: { percentage: { value: "25" } },
        message: "25% off Acai Berry Blast / Unicorn Milkshake",
      },
    ]);
  });

  it("does not discount a subscription line, even for an eligible variant", () => {
    const result = runWithLines(
      [flavorLine("line1", PRODUCT_ONE_ACAI, 1, { subscription: true })],
      config(),
    );
    expect(result).toEqual({ operations: [] });
  });

  it("discounts both flavors independently when both are in the cart as one-time", () => {
    const result = runWithLines(
      [flavorLine("acai", PRODUCT_ONE_ACAI, 2), flavorLine("unicorn", PRODUCT_ONE_UNICORN, 3)],
      config(),
    );
    const list = candidates(result);
    expect(list).toHaveLength(2);
    expect(list.some((c) => c.targets[0].cartLine.id === "acai")).toBe(true);
    expect(list.some((c) => c.targets[0].cartLine.id === "unicorn")).toBe(true);
  });

  it("discounts the same flavor across both products, only one needs to be present", () => {
    const result = runWithLines([flavorLine("line1", PRODUCT_TWO_UNICORN, 1)], config());
    expect(candidates(result)).toHaveLength(1);
  });

  it("does not discount a variant outside the eligible list", () => {
    const result = runWithLines(
      [flavorLine("line1", VARIANT_IDS.unrelated, 1)],
      config(),
    );
    expect(result).toEqual({ operations: [] });
  });

  it("discounts 1 unit per eligible variant when all 4 are in the cart at quantity 1", () => {
    const result = runWithLines(
      [
        flavorLine("l1", PRODUCT_ONE_ACAI, 1),
        flavorLine("l2", PRODUCT_ONE_UNICORN, 1),
        flavorLine("l3", PRODUCT_TWO_ACAI, 1),
        flavorLine("l4", PRODUCT_TWO_UNICORN, 1),
      ],
      config(),
    );
    const list = candidates(result);
    expect(list).toHaveLength(4);
    for (const id of ["l1", "l2", "l3", "l4"]) {
      expect(list.find((c) => c.targets[0].cartLine.id === id)?.targets[0].cartLine.quantity).toBe(1);
    }
  });

  it("discounts only 1 of 3 units when one eligible variant has quantity 3, leaving 2 at full price", () => {
    const result = runWithLines([flavorLine("line1", PRODUCT_ONE_ACAI, 3)], config());
    expect(candidates(result)).toEqual([
      {
        targets: [{ cartLine: { id: "line1", quantity: 1 } }],
        value: { percentage: { value: "25" } },
        message: "25% off Acai Berry Blast / Unicorn Milkshake",
      },
    ]);
  });
});
