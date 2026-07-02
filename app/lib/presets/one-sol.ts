import type { HpnPromoConfig } from "../validations";

// ── Lean Plant Protein variant GIDs ───────────────────────────────────
// Acai Berry Blast and Unicorn Milkshake are each sold as a variant under
// BOTH of these two "Lean Plant Protein" products — 4 eligible variants total.
const V = {
  PROTEIN_7193611337967_ACAI_BERRY_BLAST:  "gid://shopify/ProductVariant/42477833322735",
  PROTEIN_7193611337967_UNICORN_MILKSHAKE: "gid://shopify/ProductVariant/44045687324911",
  PROTEIN_8860777447663_ACAI_BERRY_BLAST:  "gid://shopify/ProductVariant/46171937145071",
  PROTEIN_8860777447663_UNICORN_MILKSHAKE: "gid://shopify/ProductVariant/46171936981231",
} as const;

const ONE_TIME_DISCOUNT_VARIANTS = Object.values(V);

export const oneSolPreset: HpnPromoConfig = {
  version: 1,
  rules: [
    {
      // Acai Berry Blast / Unicorn Milkshake — 25% off one-time purchases only.
      // Each qualifying line discounts fully (all units), independently of
      // whether the other flavor/product is also in the cart.
      id: "acai-unicorn-onetime-25-off",
      type: "one_time_purchase_discount",
      enabled: true,
      targetVariantIds: ONE_TIME_DISCOUNT_VARIANTS,
      discountPercentage: 25,
      message: "25% off Acai Berry Blast / Unicorn Milkshake",
    },
  ],
  combinesWith: {
    orderDiscounts: true,
    productDiscounts: true,
    shippingDiscounts: true,
  },
};
