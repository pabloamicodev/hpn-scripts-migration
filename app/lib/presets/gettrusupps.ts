import type { HpnPromoConfig } from "../validations";

// TRU Supplements — Swell loyalty rewards.
// Discounts are triggered by hidden line-item properties injected by Swell;
// no product GIDs are needed in the configuration.

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
  ],
  combinesWith: {
    orderDiscounts: true,
    productDiscounts: true,
    shippingDiscounts: true,
  },
};
