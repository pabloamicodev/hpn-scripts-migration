import { hpnSupplementsPreset } from "./hpn-supplements";
import { gettruSuppsPreset } from "./gettrusupps";
import { oneSolPreset } from "./one-sol";
import type { HpnPromoConfig } from "../validations";

// Keyed by myshopify.com domain. The shop param from Shopify's session is
// always the full domain (e.g. "gettrusupps.myshopify.com").
const PRESETS: Record<string, HpnPromoConfig> = {
  "hpn-supplements.myshopify.com": hpnSupplementsPreset,
  "gettrusupps.myshopify.com":     gettruSuppsPreset,
  "onesolsupps.myshopify.com":     oneSolPreset,
};

/**
 * Returns the default discount config for the given shop domain.
 * Falls back to hpn-supplements if the domain is unrecognized.
 */
export function getStorePreset(shop: string): HpnPromoConfig {
  return PRESETS[shop] ?? hpnSupplementsPreset;
}
