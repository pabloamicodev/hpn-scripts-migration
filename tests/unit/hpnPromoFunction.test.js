import { describe, expect, it } from "vitest";
import { cartLinesDiscountsGenerateRun } from "../../extensions/hpn-discount-function/src/index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const P = (n) => `gid://shopify/Product/${n}`;
const V = (n) => `gid://shopify/ProductVariant/${n}`;
const L = (n) => `gid://shopify/CartLine/${n}`;

function cartLine(lineNum, productNum, variantNum, quantity = 1, extras = {}) {
  return {
    id: L(lineNum),
    quantity,
    merchandise: {
      __typename: "ProductVariant",
      id: V(variantNum),
      product: { id: P(productNum) },
    },
    sellingPlanAllocation: null,
    cost: { totalAmount: { amount: String(quantity * 10) } },
    ...extras,
  };
}

function makeInput(config, lines = [], extras = {}) {
  const { cart: cartOverride, ...otherExtras } = extras;
  return {
    discount: {
      discountClasses: ["PRODUCT"],
      metafield: { value: JSON.stringify(config) },
    },
    cart: {
      buyerIdentity: {},
      cost: { subtotalAmount: { amount: "100.00" } },
      attributes: [],
      lines,
      ...(cartOverride ?? {}),
    },
    ...otherExtras,
  };
}

function pa7Config(overrides = {}) {
  return {
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
        message: "10% Off",
        ...overrides,
      },
    ],
  };
}

function getCandidates(result) {
  return result.operations?.[0]?.productDiscountsAdd?.candidates ?? [];
}

// ---------------------------------------------------------------------------
// Entry-point guards
// ---------------------------------------------------------------------------

describe("cartLinesDiscountsGenerateRun — entry guards", () => {
  it("returns empty result when metafield value is missing", () => {
    const result = cartLinesDiscountsGenerateRun({
      discount: { discountClasses: ["PRODUCT"], metafield: null },
      cart: { lines: [], buyerIdentity: {}, cost: { subtotalAmount: { amount: "0" } }, attributes: [] },
    });
    expect(result.operations).toHaveLength(0);
  });

  it("returns empty result when discount class is not PRODUCT", () => {
    const result = cartLinesDiscountsGenerateRun(
      makeInput(pa7Config(), [cartLine(1, 1, 11), cartLine(2, 2, 21)], {
        discount: { discountClasses: ["ORDER"], metafield: { value: JSON.stringify(pa7Config()) } },
      }),
    );
    expect(result.operations).toHaveLength(0);
  });

  it("returns empty result when config JSON is malformed", () => {
    const result = cartLinesDiscountsGenerateRun({
      discount: { discountClasses: ["PRODUCT"], metafield: { value: "not-json" } },
      cart: { lines: [], buyerIdentity: {}, cost: { subtotalAmount: { amount: "0" } }, attributes: [] },
    });
    expect(result.operations).toHaveLength(0);
  });

  it("returns empty result when rules array is empty", () => {
    const config = { version: 1, rules: [] };
    const result = cartLinesDiscountsGenerateRun(makeInput(config, []));
    expect(result.operations).toHaveLength(0);
  });

  it("skips malformed rule entries without crashing", () => {
    const config = {
      version: 1,
      rules: [null, 42, { type: null }, { enabled: true }],
    };
    const result = cartLinesDiscountsGenerateRun(makeInput(config, []));
    expect(result.operations).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// pa7_cross_sell
// ---------------------------------------------------------------------------

describe("pa7_cross_sell", () => {
  it("produces a candidate for the target line", () => {
    const input = makeInput(pa7Config(), [cartLine(1, 1, 11), cartLine(2, 2, 21)]);
    const result = cartLinesDiscountsGenerateRun(input);
    const candidates = getCandidates(result);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].targets[0].cartLine.id).toBe(L(2));
    expect(candidates[0].value.percentage.value).toBe("10");
  });

  it("does not fire when trigger is absent", () => {
    const input = makeInput(pa7Config(), [cartLine(2, 2, 21)]);
    const result = cartLinesDiscountsGenerateRun(input);
    expect(getCandidates(result)).toHaveLength(0);
  });

  it("does not fire when target has wrong quantity", () => {
    const input = makeInput(pa7Config(), [cartLine(1, 1, 11), cartLine(2, 2, 21, 2)]);
    const result = cartLinesDiscountsGenerateRun(input);
    expect(getCandidates(result)).toHaveLength(0);
  });

  it("skips disabled rules", () => {
    const input = makeInput(pa7Config({ enabled: false }), [cartLine(1, 1, 11), cartLine(2, 2, 21)]);
    const result = cartLinesDiscountsGenerateRun(input);
    expect(getCandidates(result)).toHaveLength(0);
  });

  it("formats percentage=100 as '100.0'", () => {
    const config = pa7Config({ discountPercentage: 100 });
    const input = makeInput(config, [cartLine(1, 1, 11), cartLine(2, 2, 21)]);
    const [candidate] = getCandidates(cartLinesDiscountsGenerateRun(input));
    expect(candidate.value.percentage.value).toBe("100.0");
  });
});

// ---------------------------------------------------------------------------
// required_variants_free_variants
// ---------------------------------------------------------------------------

describe("required_variants_free_variants", () => {
  const config = {
    version: 1,
    rules: [
      {
        id: "bundle",
        type: "required_variants_free_variants",
        enabled: true,
        requiredVariantIds: [V(10), V(11)],
        freeVariantIds: [V(20)],
        freeQuantityPerLine: 1,
        discountPercentage: 100,
        message: "Free sample",
      },
    ],
  };

  it("fires when all required variants are in cart", () => {
    const lines = [cartLine(1, 1, 10), cartLine(2, 1, 11), cartLine(3, 2, 20)];
    const [candidate] = getCandidates(cartLinesDiscountsGenerateRun(makeInput(config, lines)));
    expect(candidate.targets[0].cartLine.id).toBe(L(3));
    expect(candidate.targets[0].cartLine.quantity).toBe(1);
  });

  it("does not fire when a required variant is missing", () => {
    const lines = [cartLine(1, 1, 10), cartLine(3, 2, 20)];
    expect(getCandidates(cartLinesDiscountsGenerateRun(makeInput(config, lines)))).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// required_product_with_free_variants — qty cap
// ---------------------------------------------------------------------------

describe("required_product_with_free_variants — freeQuantityPerLine cap", () => {
  const config = {
    version: 1,
    rules: [
      {
        id: "pouches",
        type: "required_product_with_free_variants",
        enabled: true,
        triggerProductId: P(1),
        requiredVariantIds: [V(10)],
        freeVariantIds: [V(20)],
        freeQuantityPerLine: 1,
        discountPercentage: 100,
        message: "Free pouch",
      },
    ],
  };

  it("caps discounted quantity at freeQuantityPerLine when line has more", () => {
    const lines = [cartLine(1, 1, 5), cartLine(2, 2, 10), cartLine(3, 3, 20, 3)];
    const [candidate] = getCandidates(cartLinesDiscountsGenerateRun(makeInput(config, lines)));
    expect(candidate.targets[0].cartLine.quantity).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// trigger_product_discounted_targets
// ---------------------------------------------------------------------------

describe("trigger_product_discounted_targets", () => {
  const config = {
    version: 1,
    rules: [
      {
        id: "tpdt",
        type: "trigger_product_discounted_targets",
        enabled: true,
        triggerProductId: P(1),
        targets: [
          { productId: P(2), discountPercentage: 100 },
          { productId: P(3), discountPercentage: 30 },
        ],
        message: "Bundle",
      },
    ],
  };

  it("applies per-target percentages", () => {
    const lines = [cartLine(1, 1, 5), cartLine(2, 2, 21), cartLine(3, 3, 31)];
    const candidates = getCandidates(cartLinesDiscountsGenerateRun(makeInput(config, lines)));
    expect(candidates).toHaveLength(2);
    const pcts = candidates.map((c) => c.value.percentage.value).sort();
    expect(pcts).toContain("100.0");
    expect(pcts).toContain("30");
  });
});

// ---------------------------------------------------------------------------
// loyalty_tier
// ---------------------------------------------------------------------------

describe("loyalty_tier", () => {
  const config = {
    version: 1,
    rules: [
      {
        id: "loyalty",
        type: "loyalty_tier",
        enabled: true,
        targetProductIds: [P(5)],
        tiers: [
          { minOrders: 1, discountPercentage: 5 },
          { minOrders: 5, discountPercentage: 15 },
        ],
        message: "Loyalty",
      },
    ],
  };

  function inputWithCustomer(numberOfOrders) {
    return makeInput(config, [cartLine(1, 5, 51)], {
      cart: { buyerIdentity: { customer: { numberOfOrders } }, attributes: [], cost: { subtotalAmount: { amount: "50" } } },
    });
  }

  it("skips guest (no buyerIdentity.customer)", () => {
    const input = makeInput(config, [cartLine(1, 5, 51)]);
    expect(getCandidates(cartLinesDiscountsGenerateRun(input))).toHaveLength(0);
  });

  it("applies correct tier for customer with 7 orders", () => {
    const [candidate] = getCandidates(cartLinesDiscountsGenerateRun(inputWithCustomer(7)));
    expect(candidate.value.percentage.value).toBe("15");
  });

  it("applies lower tier for customer with 1 order", () => {
    const [candidate] = getCandidates(cartLinesDiscountsGenerateRun(inputWithCustomer(1)));
    expect(candidate.value.percentage.value).toBe("5");
  });

  it("returns nothing when customer has 0 orders (below first tier)", () => {
    expect(getCandidates(cartLinesDiscountsGenerateRun(inputWithCustomer(0)))).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Global conditions
// ---------------------------------------------------------------------------

describe("global conditions", () => {
  const ruleBase = {
    id: "pa7",
    type: "pa7_cross_sell",
    enabled: true,
    triggerProductId: P(1),
    targetProductIds: [P(2)],
    targetLineQuantityEquals: 1,
    discountPercentage: 10,
    message: "test",
  };
  const lines = [cartLine(1, 1, 11), cartLine(2, 2, 21)];

  it("skips rule when subtotal is below minimumCartSubtotal", () => {
    const config = { version: 1, rules: [{ ...ruleBase, conditions: { minimumCartSubtotal: 200 } }] };
    const input = makeInput(config, lines, {
      cart: { cost: { subtotalAmount: { amount: "50.00" } }, buyerIdentity: {}, attributes: [] },
    });
    expect(getCandidates(cartLinesDiscountsGenerateRun(input))).toHaveLength(0);
  });

  it("fires rule when subtotal meets minimumCartSubtotal", () => {
    const config = { version: 1, rules: [{ ...ruleBase, conditions: { minimumCartSubtotal: 50 } }] };
    const input = makeInput(config, lines, {
      cart: { cost: { subtotalAmount: { amount: "100.00" } }, buyerIdentity: {}, attributes: [] },
    });
    expect(getCandidates(cartLinesDiscountsGenerateRun(input))).toHaveLength(1);
  });

  it("skips rule when required cart attribute is absent", () => {
    const config = { version: 1, rules: [{ ...ruleBase, conditions: { requiredCartAttributeKey: "source" } }] };
    const input = makeInput(config, lines, {
      cart: { attributes: [], buyerIdentity: {}, cost: { subtotalAmount: { amount: "100.00" } } },
    });
    expect(getCandidates(cartLinesDiscountsGenerateRun(input))).toHaveLength(0);
  });

  it("fires rule when required cart attribute is present", () => {
    const config = { version: 1, rules: [{ ...ruleBase, conditions: { requiredCartAttributeKey: "source" } }] };
    const input = makeInput(config, lines, {
      cart: {
        attributes: [{ key: "source", value: "lp" }],
        buyerIdentity: {},
        cost: { subtotalAmount: { amount: "100.00" } },
      },
    });
    expect(getCandidates(cartLinesDiscountsGenerateRun(input))).toHaveLength(1);
  });

  it("skips when requiresSubscriptionInCart is true but no subscription in cart", () => {
    const config = { version: 1, rules: [{ ...ruleBase, conditions: { requiresSubscriptionInCart: true } }] };
    const input = makeInput(config, lines);
    expect(getCandidates(cartLinesDiscountsGenerateRun(input))).toHaveLength(0);
  });

  it("fires when requiresSubscriptionInCart is true and cart has subscription", () => {
    const config = { version: 1, rules: [{ ...ruleBase, conditions: { requiresSubscriptionInCart: true } }] };
    const linesWithSub = [
      cartLine(1, 1, 11, 1, { sellingPlanAllocation: { sellingPlan: { id: "gid://shopify/SellingPlan/1" } } }),
      cartLine(2, 2, 21),
    ];
    const input = makeInput(config, linesWithSub);
    expect(getCandidates(cartLinesDiscountsGenerateRun(input))).toHaveLength(1);
  });
});
