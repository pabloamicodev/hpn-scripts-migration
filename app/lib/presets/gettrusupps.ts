import type { HpnPromoConfig } from "../validations";

// TRU Supplements — Swell loyalty rewards.
// Discounts are triggered by hidden line-item properties injected by Swell;
// no product GIDs are needed in the configuration.

// Protein Complete landing page (https://gettrusupps.com/pages/protein-complete-lp).
// Scoped to this landing only via the __landing_source line item property,
// which the page's add-to-cart form must set on every line it adds (protein
// flavors + the two free-gift products) — see tru-store step2 ATC wiring.
const PROTEIN_LANDING_SOURCE_VALUE = "protein-complete-lp";

const PROTEIN_LANDING_FLAVOR_VARIANT_IDS = [
  "gid://shopify/ProductVariant/31358533206097", // Vanilla Cream
  "gid://shopify/ProductVariant/31358533140561", // Strawberry Cream
  "gid://shopify/ProductVariant/39594543808593", // Dulce de Leche
  "gid://shopify/ProductVariant/31358533271633", // Chocolate Cream
  "gid://shopify/ProductVariant/31927032250449", // Peanut Butter Banana Cupcake
  "gid://shopify/ProductVariant/32642048393297", // Chocolate Peanut Butter
  "gid://shopify/ProductVariant/31358533468241", // Banana Maple Muffin
  "gid://shopify/ProductVariant/32773556240465", // Coconut Macaron
];

export const gettruSuppsPreset: HpnPromoConfig = {
  version: 1,
  rules: [
    {
      // Free Product Reward: one unit of the reward line becomes free when
      // Swell sets _swell_discount_type = product on that line.
      id: "swell-free-product",
      type: "swell_free_product",
      enabled: true,
      message: "Rewards",
    },
    {
      // Fixed-Amount Cart Reward: the cent amount in _swell_discount_amount_cents
      // is distributed proportionally across eligible (non-free-product) lines.
      id: "swell-cart-fixed-amount",
      type: "swell_cart_fixed_amount",
      enabled: true,
      message: "Rewards",
    },
    {
      // Subscribe & Save tiers — 10% subscription discount is already baked
      // into these per-unit targets (list price $49.99 → ~$44.99, then extra
      // 15/20/25% off for 2/3/4 bags).
      id: "protein-landing-subscription-tiers",
      type: "landing_quantity_tier_fixed_price",
      enabled: true,
      targetVariantIds: PROTEIN_LANDING_FLAVOR_VARIANT_IDS,
      requiredLineAttributeKey: "__landing_source",
      requiredLineAttributeValue: PROTEIN_LANDING_SOURCE_VALUE,
      requiresSubscription: true,
      tiers: [
        { quantity: 1, targetPricePerUnit: 45.0 },
        { quantity: 2, targetPricePerUnit: 38.25 },
        { quantity: 3, targetPricePerUnit: 36.0 },
        { quantity: 4, targetPricePerUnit: 33.75 },
      ],
      message: "Protein Complete Bundle",
    },
    {
      // Buy-it-once tiers — same bulk % break as the subscription tiers
      // above (0/15/20/25%), just without the 10% subscription discount:
      // list price $49.99 straight through.
      id: "protein-landing-onetime-tiers",
      type: "landing_quantity_tier_fixed_price",
      enabled: true,
      targetVariantIds: PROTEIN_LANDING_FLAVOR_VARIANT_IDS,
      requiredLineAttributeKey: "__landing_source",
      requiredLineAttributeValue: PROTEIN_LANDING_SOURCE_VALUE,
      requiresSubscription: false,
      tiers: [
        { quantity: 1, targetPricePerUnit: 49.99 },
        { quantity: 2, targetPricePerUnit: 42.49 },
        { quantity: 3, targetPricePerUnit: 39.99 },
        { quantity: 4, targetPricePerUnit: 37.49 },
      ],
      message: "Protein Complete Bundle",
    },
    {
      // Free gift products (shaker + ebook) — only free when added by this
      // landing's own ATC flow, never when added from their own PDPs.
      id: "protein-landing-free-gifts",
      type: "landing_scoped_product_discount",
      enabled: true,
      targetProductIds: [
        "gid://shopify/Product/15030069100912", // TRU Sport Shaker - Clear & Black
        // The BOGOS.io "_sca_clone_freegift" clone (15092501152112) doesn't
        // work here — BOGOS actively manages/removes its own clone gift line
        // items from the cart when they weren't added through its own gift
        // flow. Use the real product instead, same as the shaker above.
        "gid://shopify/Product/15083050828144", // Lifestyle Nutrition Guide (real product)
      ],
      requiredLineAttributeKey: "__landing_source",
      requiredLineAttributeValue: PROTEIN_LANDING_SOURCE_VALUE,
      discountPercentage: 100,
      message: "Protein Complete Bundle",
    },
    {
      // Free shipping for the whole order whenever any line came from this landing.
      id: "protein-landing-free-shipping",
      type: "landing_free_shipping",
      enabled: true,
      requiredLineAttributeKey: "__landing_source",
      requiredLineAttributeValue: PROTEIN_LANDING_SOURCE_VALUE,
      message: "Protein Complete Bundle",
    },
  ],
  combinesWith: {
    orderDiscounts: true,
    productDiscounts: true,
    shippingDiscounts: true,
  },
};
