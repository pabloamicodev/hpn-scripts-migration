import type { HpnPromoConfig } from "./validations";
import { HPN_PRODUCTS, HPN_PROMO_MESSAGES, HPN_VARIANTS } from "./hpnPromoConstants";

export const defaultHpnPromoConfig: HpnPromoConfig = {
  version: 1,
  rules: [
    {
      id: "pa7-cross-sell",
      type: "pa7_cross_sell",
      enabled: true,
      triggerProductId: HPN_PRODUCTS.PA7_PRODUCT_ID,
      targetProductIds: [
        HPN_PRODUCTS.C2_PRODUCT_ID,
        HPN_PRODUCTS.T5_PRODUCT_ID,
      ],
      targetLineQuantityEquals: 1,
      discountPercentage: 10,
      message: HPN_PROMO_MESSAGES.PA7_CROSS_SELL,
    },
    {
      id: "nad3-single-planta-samples",
      type: "required_variants_free_variants",
      enabled: true,
      requiredVariantIds: [
        HPN_VARIANTS.NAD3_SINGLE_VARIANT_ID,
        HPN_VARIANTS.PLANTA_SAMPLE_VARIANT_ID_1,
        HPN_VARIANTS.PLANTA_SAMPLE_VARIANT_ID_2,
      ],
      freeVariantIds: [
        HPN_VARIANTS.PLANTA_SAMPLE_VARIANT_ID_1,
        HPN_VARIANTS.PLANTA_SAMPLE_VARIANT_ID_2,
      ],
      freeQuantityPerLine: 1,
      message: HPN_PROMO_MESSAGES.PLANTA_SAMPLES,
    },
    {
      id: "nad3-240-pouches",
      type: "required_product_with_free_variants",
      enabled: true,
      triggerProductId: HPN_PRODUCTS.NAD3_240_PRODUCT_ID,
      requiredVariantIds: [
        HPN_VARIANTS.S9_1WK_POUCH_VARIANT_ID,
        HPN_VARIANTS.N4_1WK_POUCH_VARIANT_ID,
      ],
      freeVariantIds: [
        HPN_VARIANTS.S9_1WK_POUCH_VARIANT_ID,
        HPN_VARIANTS.N4_1WK_POUCH_VARIANT_ID,
      ],
      freeQuantityPerLine: 1,
      message: HPN_PROMO_MESSAGES.FREE_POUCHES,
    },
  ],
  combinesWith: {
    orderDiscounts: true,
    productDiscounts: true,
    shippingDiscounts: true,
  },
};
