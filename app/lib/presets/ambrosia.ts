import type { HpnPromoConfig } from "../validations";

// Ambrosia Nutraceuticals — new standalone store, no promos defined yet.
// Ship installed with zero active discounts; rules get added here once
// the store's promo requirements are defined.
export const ambrosiaPreset: HpnPromoConfig = {
  version: 1,
  rules: [],
  combinesWith: {
    orderDiscounts: true,
    productDiscounts: true,
    shippingDiscounts: true,
  },
};
