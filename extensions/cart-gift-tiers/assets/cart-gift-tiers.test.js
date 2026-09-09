import { describe, expect, it } from "vitest";

// The widget's entry point calls document.getElementById on load, before
// any of its exports are reachable — stub just enough of `document` so
// importing it here (as a plain ES module, no browser) takes the "no root
// element" early-return path and still exports the pure tier-matching
// logic this file exercises. Nothing below touches document/fetch/window.
// A dynamic import (not a static one) is required so this stub actually
// runs first — static imports are hoisted above any other top-level code.
globalThis.document = { getElementById: () => null };
const { activeTiers, giftTierOf, productTierQualifies, qualifyingSubtotal } =
  await import("./cart-gift-tiers.js");

function paidItem(productId, cents) {
  return { product_id: productId, original_line_price: cents, properties: {} };
}

function giftItem(productId, cents, tierId) {
  return {
    product_id: productId,
    original_line_price: cents,
    properties: { __cart_gift_tier: tierId },
  };
}

// ---------------------------------------------------------------------------
// giftTierOf
// ---------------------------------------------------------------------------

describe("giftTierOf", () => {
  it("returns the tier id from the __cart_gift_tier property", () => {
    expect(giftTierOf(giftItem(1, 100, "tier-1"))).toBe("tier-1");
  });

  it("returns undefined for a line with no properties at all", () => {
    expect(giftTierOf({ product_id: 1 })).toBeUndefined();
  });

  it("returns undefined for a plain paid line", () => {
    expect(giftTierOf(paidItem(1, 100))).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// qualifyingSubtotal
// ---------------------------------------------------------------------------

describe("qualifyingSubtotal", () => {
  it("sums paid line prices, converting cents to dollars", () => {
    const cart = { items: [paidItem(1, 4999), paidItem(2, 2000)] };
    expect(qualifyingSubtotal(cart)).toBeCloseTo(69.99);
  });

  it("excludes gift-tagged lines from the subtotal, regardless of their price", () => {
    const cart = {
      items: [paidItem(1, 4999), giftItem(2, 1999, "tier-1")],
    };
    // The gift line's $19.99 must never count, even though /cart.js reports
    // it at full price (the discount only ever applies at checkout).
    expect(qualifyingSubtotal(cart)).toBeCloseTo(49.99);
  });

  it("returns 0 for an empty cart", () => {
    expect(qualifyingSubtotal({ items: [] })).toBe(0);
  });

  it("falls back to line_price when original_line_price is absent", () => {
    const cart = { items: [{ product_id: 1, line_price: 1000, properties: {} }] };
    expect(qualifyingSubtotal(cart)).toBeCloseTo(10);
  });
});

// ---------------------------------------------------------------------------
// productTierQualifies
// ---------------------------------------------------------------------------

describe("productTierQualifies", () => {
  const tier = { triggerProductIds: ["111", "222"] };

  it("qualifies when a trigger product is in the cart", () => {
    const cart = { items: [paidItem(111, 4999)] };
    expect(productTierQualifies(tier, cart)).toBe(true);
  });

  it("does not qualify when no trigger product is in the cart", () => {
    const cart = { items: [paidItem(333, 4999)] };
    expect(productTierQualifies(tier, cart)).toBe(false);
  });

  it("does not qualify on an empty cart", () => {
    expect(productTierQualifies(tier, { items: [] })).toBe(false);
  });

  it("ignores a matching product_id on a line that is itself a gift", () => {
    // Should never happen in practice (a trigger product wouldn't also be
    // tagged as someone's gift), but the same exclusion qualifyingSubtotal
    // applies for the same reason: a gift line must never be able to
    // qualify a tier on its own.
    const cart = { items: [giftItem(111, 1999, "some-other-tier")] };
    expect(productTierQualifies(tier, cart)).toBe(false);
  });

  it("matches product_id as a number against string triggerProductIds", () => {
    // /cart.js reports product_id as a JS number; the proxy sends
    // triggerProductIds as legacy-id strings -- productTierQualifies must
    // coerce before comparing, or every real cart would silently never match.
    const cart = { items: [{ product_id: 111, original_line_price: 100, properties: {} }] };
    expect(productTierQualifies(tier, cart)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// activeTiers
// ---------------------------------------------------------------------------

describe("activeTiers", () => {
  it("does not activate a subtotal tier below its threshold", () => {
    const config = {
      stackingMode: "highest_tier_only",
      tiers: [{ id: "tier-1", qualifyingType: "subtotal", minimumSubtotal: 85 }],
    };
    const cart = { items: [paidItem(1, 4999)] };
    expect(activeTiers(cart, config)).toEqual([]);
  });

  it("activates a subtotal tier once its threshold is reached", () => {
    const config = {
      stackingMode: "highest_tier_only",
      tiers: [{ id: "tier-1", qualifyingType: "subtotal", minimumSubtotal: 85 }],
    };
    const cart = { items: [paidItem(1, 8500)] };
    expect(activeTiers(cart, config)).toEqual([config.tiers[0]]);
  });

  it("highest_tier_only picks only the highest qualifying subtotal tier", () => {
    const tier50 = { id: "tier-50", qualifyingType: "subtotal", minimumSubtotal: 50 };
    const tier100 = { id: "tier-100", qualifyingType: "subtotal", minimumSubtotal: 100 };
    const config = { stackingMode: "highest_tier_only", tiers: [tier50, tier100] };
    const cart = { items: [paidItem(1, 10000)] };
    expect(activeTiers(cart, config)).toEqual([tier100]);
  });

  it("cumulative returns every qualifying subtotal tier", () => {
    const tier50 = { id: "tier-50", qualifyingType: "subtotal", minimumSubtotal: 50 };
    const tier100 = { id: "tier-100", qualifyingType: "subtotal", minimumSubtotal: 100 };
    const config = { stackingMode: "cumulative", tiers: [tier50, tier100] };
    const cart = { items: [paidItem(1, 10000)] };
    expect(activeTiers(cart, config)).toEqual([tier50, tier100]);
  });

  it("activates every qualifying product tier at once -- no highest-tier reduction", () => {
    const wheyTier = { id: "tier-whey", qualifyingType: "product", triggerProductIds: ["1"] };
    const veganTier = { id: "tier-vegan", qualifyingType: "product", triggerProductIds: ["2"] };
    const config = { stackingMode: "highest_tier_only", tiers: [wheyTier, veganTier] };
    const cart = { items: [paidItem(1, 100), paidItem(2, 100)] };
    expect(activeTiers(cart, config)).toEqual([wheyTier, veganTier]);
  });

  it("a product tier's own trigger check is independent of subtotal", () => {
    const productTier = { id: "tier-1", qualifyingType: "product", triggerProductIds: ["1"] };
    const config = { stackingMode: "highest_tier_only", tiers: [productTier] };
    // Well under any realistic subtotal threshold -- irrelevant here, since
    // this tier only ever checks trigger-product presence.
    const cart = { items: [paidItem(1, 4999)] };
    expect(activeTiers(cart, config)).toEqual([productTier]);
  });

  // ---------------------------------------------------------------------
  // Regression: the Ambrosia "free t-shirt" bug. A subtotal tier and a
  // product tier sharing an id must each still be judged purely on their
  // OWN condition here -- this is what hpnPromoConfigSchema's superRefine
  // (tests/unit/validations.test.ts) now refuses to save in the first
  // place, but this test pins down that activeTiers itself was never the
  // part that got confused: it always returns the tier objects that
  // genuinely qualify, never a same-id stand-in.
  // ---------------------------------------------------------------------
  it("judges same-id subtotal and product tiers independently", () => {
    const shirtTier = { id: "tier-1", qualifyingType: "subtotal", minimumSubtotal: 85 };
    const cookbookTier = { id: "tier-1", qualifyingType: "product", triggerProductIds: ["1"] };
    const config = { stackingMode: "highest_tier_only", tiers: [shirtTier, cookbookTier] };

    // Cart: one $49.99 protein bag -- the cookbook's trigger product is
    // present (qualifies), but the cart is nowhere near the shirt's $85
    // subtotal threshold (must not qualify).
    const cart = { items: [paidItem(1, 4999)] };

    expect(activeTiers(cart, config)).toEqual([cookbookTier]);
  });
});
