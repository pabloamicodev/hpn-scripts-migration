import type { HpnPromoConfig } from "../validations";

// ── Lean Plant Protein product GIDs ───────────────────────────────────
const P = {
  LEAN_PROTEIN_ACAI_BERRY_BLAST:        "gid://shopify/Product/7193611337967",
  LEAN_PROTEIN_CHURRO:                  "gid://shopify/Product/9000958230767",
  LEAN_PROTEIN_FRESAS_CON_CREMA:        "gid://shopify/Product/8860777447663",
  LEAN_PROTEIN_UNICORN_MILKSHAKE:       "gid://shopify/Product/8102235832559",
  LEAN_PROTEIN_VANILLA_CARAMEL_CUPCAKE: "gid://shopify/Product/7814816268527",
  LEAN_PROTEIN_CHOCOLATE_SEA_SALT:      "gid://shopify/Product/7814817153263",
  LEAN_PROTEIN_CAFE_LATTE:              "gid://shopify/Product/7814817710319",
  LEAN_PROTEIN_HORCHATA:                "gid://shopify/Product/7936022773999",
} as const;

const LEAN_PROTEIN_PRODUCTS = Object.values(P);

export const oneSolPreset: HpnPromoConfig = {
  version: 1,
  rules: [
    {
      // Bundle-Two Subscription Discount
      // First 2 qualifying Lean Plant Protein units get 10% off when:
      //   - purchased as a subscription
      //   - line has __bundle_type = two
      id: "bundle-two-subscription",
      type: "subscription_bundle_group",
      enabled: true,
      targetProductIds: LEAN_PROTEIN_PRODUCTS,
      discountPercentage: 10,
      maxUnitsTotal: 2,
      requiredLineAttributeKey: "__bundle_type",
      requiredLineAttributeValue: "two",
      message: "10% off first two subscription units",
      conditions: {
        requiresSubscriptionInCart: true,
      },
    },
  ],
  combinesWith: {
    orderDiscounts: true,
    productDiscounts: true,
    shippingDiscounts: true,
  },
};
