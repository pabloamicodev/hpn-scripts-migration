import { hpnSupplementsPreset } from "./presets/hpn-supplements";
export { getStorePreset } from "./presets/index";

// Static fallback used in UI components and test fixtures where no shop
// context is available (client-side rendering, unit test fixtures).
export const defaultHpnPromoConfig = hpnSupplementsPreset;
