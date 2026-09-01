import { hpnSupplementsPreset } from "./hpn-supplements";
import { gettruSuppsPreset } from "./gettrusupps";
import { oneSolPreset } from "./one-sol";
import { ambrosiaPreset } from "./ambrosia";
import type { HpnPromoConfig } from "../validations";

// Keyed by myshopify.com domain. The shop param from Shopify's session is
// always the full domain (e.g. "gettrusupps.myshopify.com").
const PRESETS: Record<string, HpnPromoConfig> = {
  "hpn-supplements.myshopify.com":       hpnSupplementsPreset,
  "gettrusupps.myshopify.com":           gettruSuppsPreset,
  "onesolsupps.myshopify.com":           oneSolPreset,
  "ambrosia-nutraceuticals.myshopify.com": ambrosiaPreset,
};

/**
 * Returns the default discount config for the given shop domain.
 * Falls back to hpn-supplements if the domain is unrecognized.
 */
export function getStorePreset(shop: string): HpnPromoConfig {
  return PRESETS[shop] ?? hpnSupplementsPreset;
}

const DISCOUNT_TITLES: Record<string, string> = {
  "hpn-supplements.myshopify.com":         "HPN Scripts Migration Discounts",
  "gettrusupps.myshopify.com":             "GetTru Scripts Migration Discounts",
  "onesolsupps.myshopify.com":             "One Sol Scripts Migration Discounts",
  "ambrosia-nutraceuticals.myshopify.com": "Ambrosia Scripts Migration Discounts",
};

/**
 * Returns the automatic app discount title for the given shop domain.
 * Falls back to the hpn-supplements title if the domain is unrecognized.
 */
export function getDiscountTitle(shop: string): string {
  return DISCOUNT_TITLES[shop] ?? DISCOUNT_TITLES["hpn-supplements.myshopify.com"];
}
