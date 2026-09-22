import type { SkioShippingTiersConfig, SkioShippingTier } from "./skioShippingTiers";

// ---------------------------------------------------------------------------
// Pure decision logic for "what shipping fee should Skio charge on this
// subscription's next order?" — deliberately has zero dependency on the Skio
// API client, so it's fully unit-testable without any network mocking and
// without needing real Skio credentials.
//
// Design choice: EVERY cycle's shipping price for these tiers — including
// cycle 1 — is set through Skio's setDeliveryPriceOverride, not through our
// own Shopify shipping discount Function. See skioShippingTiers.ts for why
// (Shopify's own "any shipping discount on the origin order becomes 100% on
// every renewal" behavior rules out doing this via our Function at all).
// ---------------------------------------------------------------------------

export interface SkioSubscriptionSnapshot {
  id: string;
  subscriptionDurationMonths: number;
  subtotal: number;
  cyclesCompleted: number;
  /** Shopify variant GIDs (from Skio's ProductVariant.platformId) across active lines. */
  productVariantIds: string[];
}

export interface ShippingOverrideDecision {
  subscriptionId: string;
  matchedTierId: string | null;
  /** The cycle this decision is for (1-indexed): cyclesCompleted + 1. */
  targetCycle: number;
  /**
   * null = do not call setDeliveryPriceOverride for this cycle (no tier
   * matched, or the matched tier's override for this cycle is explicitly
   * "leave it alone").
   */
  overrideAmount: number | null;
}

function tierMatches(tier: SkioShippingTier, subscription: SkioSubscriptionSnapshot): boolean {
  if (tier.subscriptionDurationMonths !== subscription.subscriptionDurationMonths) return false;
  if (subscription.subtotal < tier.minSubtotal) return false;
  if (tier.maxSubtotal !== null && subscription.subtotal >= tier.maxSubtotal) return false;
  if (tier.productVariantIds !== null) {
    const hasMatchingVariant = subscription.productVariantIds.some((id) => tier.productVariantIds!.includes(id));
    if (!hasMatchingVariant) return false;
  }
  return true;
}

/**
 * Tiers are evaluated in array order; the first match wins (same convention
 * as the other multi-tier rule configs in this app — merchants control
 * priority by ordering, not by "most specific" inference).
 */
function findMatchingTier(
  config: SkioShippingTiersConfig,
  subscription: SkioSubscriptionSnapshot,
): SkioShippingTier | null {
  return config.tiers.find((tier) => tierMatches(tier, subscription)) ?? null;
}

function overrideForCycle(tier: SkioShippingTier, targetCycle: number) {
  const explicit = tier.cycleOverrides.find((entry) => entry.cycle === targetCycle);
  return (explicit ?? { override: tier.defaultOverride }).override;
}

export function resolveShippingOverride(
  config: SkioShippingTiersConfig,
  subscription: SkioSubscriptionSnapshot,
): ShippingOverrideDecision {
  const targetCycle = subscription.cyclesCompleted + 1;
  const tier = findMatchingTier(config, subscription);

  if (!tier) {
    return { subscriptionId: subscription.id, matchedTierId: null, targetCycle, overrideAmount: null };
  }

  return {
    subscriptionId: subscription.id,
    matchedTierId: tier.id,
    targetCycle,
    overrideAmount: overrideForCycle(tier, targetCycle).amount,
  };
}

export function resolveShippingOverrides(
  config: SkioShippingTiersConfig,
  subscriptions: SkioSubscriptionSnapshot[],
): ShippingOverrideDecision[] {
  return subscriptions.map((subscription) => resolveShippingOverride(config, subscription));
}
