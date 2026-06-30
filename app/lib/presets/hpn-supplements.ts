import type { HpnPromoConfig } from "../validations";

// ── Product GIDs ──────────────────────────────────────────────────────
const P = {
  PA7:      "gid://shopify/Product/1313973239892",
  C2:       "gid://shopify/Product/1319321763924",
  T5:       "gid://shopify/Product/1313557741652",
  NAD3_240: "gid://shopify/Product/6784435060873",
} as const;

// ── Variant GIDs ──────────────────────────────────────────────────────
const V = {
  NAD3_SINGLE:       "gid://shopify/ProductVariant/21174522675284",
  PLANTA_SAMPLE_PB:  "gid://shopify/ProductVariant/40608348438665",
  PLANTA_SAMPLE_CAC: "gid://shopify/ProductVariant/40608348373129",
  S9_1WK_POUCH:      "gid://shopify/ProductVariant/44633124995209",
  N4_1WK_POUCH:      "gid://shopify/ProductVariant/44633124864137",
} as const;

export const hpnSupplementsPreset: HpnPromoConfig = {
  version: 1,
  rules: [
    {
      id: "pa7-cross-sell",
      type: "pa7_cross_sell",
      enabled: true,
      triggerProductId: P.PA7,
      targetProductIds: [P.C2, P.T5],
      targetLineQuantityEquals: 1,
      discountPercentage: 10,
      message: "Congratulations! 10% Off (when purchased with PA7)",
    },
    {
      id: "nad3-single-planta-samples",
      type: "required_variants_free_variants",
      enabled: true,
      requiredVariantIds: [
        V.NAD3_SINGLE,
        V.PLANTA_SAMPLE_PB,
        V.PLANTA_SAMPLE_CAC,
      ],
      freeVariantIds: [V.PLANTA_SAMPLE_PB, V.PLANTA_SAMPLE_CAC],
      freeQuantityPerLine: 1,
      discountPercentage: 100,
      message: "Free Planta Samples - NAD3 Subscription",
    },
    {
      id: "nad3-240-pouches",
      type: "required_product_with_free_variants",
      enabled: true,
      triggerProductId: P.NAD3_240,
      requiredVariantIds: [V.S9_1WK_POUCH, V.N4_1WK_POUCH],
      freeVariantIds: [V.S9_1WK_POUCH, V.N4_1WK_POUCH],
      freeQuantityPerLine: 1,
      discountPercentage: 100,
      message: "Free 1-Week Pouches - NAD3 240 Bundle",
    },
  ],
  combinesWith: {
    orderDiscounts: true,
    productDiscounts: true,
    shippingDiscounts: true,
  },
};
