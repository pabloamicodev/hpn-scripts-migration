import type { HpnPromoConfig } from "../validations";

// Nektar GLP-1 Starter Kit landing page
// (https://ambrosiacollective.com/pages/nektar-glp1-starter-kit) — buying
// either subscription tier (1 Tub / 3 Tub "Best Value") bundles a free
// Premium Ambrosia Shaker Bottle. The landing's own add-to-cart (theme:
// sections/mgn-special-shop.liquid) tags both the Nektar line(s) and the
// Shaker line with __landing_source so the same variants sold elsewhere
// (PDP, other landings) are unaffected.
//
// Not routed through BOGOS: BOGOS adds its gift lines itself, outside our
// control, so they can never carry our __landing_source property and this
// rule could never match them. The theme adds the Shaker directly instead.
//
// Anti-abuse is automatic, not a separate step: requiredAnchorVariantIds
// means the discount only applies while a tagged Nektar line is still in
// the cart. Remove it (cart page, checkout back-nav, etc.) and the very
// next discount recalculation stops discounting the Shaker — the price
// restores itself. The theme still removes the now-full-price Shaker line
// from the cart as a UX cleanup on top of this.
const NEKTAR_GLP1_LANDING_SOURCE = "nektar-glp1-starter-kit";

const NEKTAR_GLP1_FLAVOR_VARIANT_IDS = [
  "gid://shopify/ProductVariant/39328106578005", // Sour Gummy Candy
  "gid://shopify/ProductVariant/7623220887605",  // Fruit Symphony
  "gid://shopify/ProductVariant/41064870707285", // Strawberry Lychee
  "gid://shopify/ProductVariant/40818314149973", // Pineapple Mango
  "gid://shopify/ProductVariant/22546471419989", // Apple Symphony
  "gid://shopify/ProductVariant/40451298263125", // Honey Lemon
];

export const ambrosiaPreset: HpnPromoConfig = {
  version: 1,
  rules: [
    {
      id: "nektar-glp1-shaker-gift",
      type: "landing_scoped_product_discount",
      enabled: true,
      targetProductIds: [
        "gid://shopify/Product/4776921759829", // Ambrosia Collective Premium Shaker Bottle
      ],
      requiredLineAttributeKey: "__landing_source",
      requiredLineAttributeValue: NEKTAR_GLP1_LANDING_SOURCE,
      requiredAnchorVariantIds: NEKTAR_GLP1_FLAVOR_VARIANT_IDS,
      requiredAnchorMinQuantity: 1,
      requiresAnchorSubscription: true,
      discountPercentage: 100,
      message: "Nektar GLP-1 Starter Kit — Free Shaker Cup",
    },
  ],
  combinesWith: {
    orderDiscounts: true,
    productDiscounts: true,
    shippingDiscounts: true,
  },
};
