import {
  listActiveSkioSubscriptions,
  getSkioSubscriptionById,
  setSkioDeliveryPriceOverride,
  intervalToDurationMonths,
  subscriptionSubtotal,
  subscriptionProductVariantIds,
  type SkioGraphQLProxyFn,
  type RawSkioSubscription,
} from "./skioApi.server";
import { resolveShippingOverride } from "./skioShippingSync";
import type { SkioShippingTiersConfig } from "./skioShippingTiers";
import { logger } from "./logger";

export interface SyncedSubscriptionResult {
  subscriptionId: string;
  matchedTierId: string | null;
  targetCycle: number;
  overrideAmount: number | null;
  /** false when overrideAmount already equals the subscription's current deliveryPrice — no call made. */
  applied: boolean;
}

function toSnapshot(subscription: RawSkioSubscription) {
  const subscriptionDurationMonths = intervalToDurationMonths(subscription.BillingPolicy);
  if (subscriptionDurationMonths === null) return null;

  return {
    id: subscription.id,
    subscriptionDurationMonths,
    subtotal: subscriptionSubtotal(subscription),
    cyclesCompleted: subscription.cyclesCompleted ?? 0,
    productVariantIds: subscriptionProductVariantIds(subscription),
  };
}

// Confirmed via a disposable test subscription (see skioApi.server.ts):
// deliveryPrice is the field that reflects the actual, effective shipping
// charge, in dollars, full cents precision. deliveryPriceOverride (an Int)
// is NOT a price — setting deliveryPrice to 1.99 via setDeliveryPriceOverride
// read back deliveryPriceOverride as 1, not 1.99 or 199. Comparisons here
// use deliveryPrice exclusively.
const EPSILON = 0.001;

function isAlreadyApplied(overrideAmount: number, currentDeliveryPrice: number): boolean {
  return Math.abs(currentDeliveryPrice - overrideAmount) < EPSILON;
}

export class DeliveryPriceOverrideVerificationError extends Error {
  constructor(subscriptionId: string, expectedDollars: number, actualStored: number | null) {
    super(
      `Delivery price override verification failed for subscription ${subscriptionId}: ` +
        `wrote ${expectedDollars} but read back deliveryPrice=${actualStored}. Halting the ` +
        `sync run before it mis-prices any more subscriptions.`,
    );
    this.name = "DeliveryPriceOverrideVerificationError";
  }
}

/**
 * Runs one full sync pass: fetches every active Skio subscription, decides
 * (via skioShippingSync's pure logic) what the delivery price should be for
 * each one's next cycle, and calls setDeliveryPriceOverride only where the
 * subscription's current deliveryPrice doesn't already match.
 *
 * Every write is immediately verified by reading the subscription back and
 * checking deliveryPrice. If it doesn't match what was sent, this throws and
 * stops processing further subscriptions.
 */
export async function runSkioShippingSync(
  proxy: SkioGraphQLProxyFn,
  tiersConfig: SkioShippingTiersConfig,
): Promise<SyncedSubscriptionResult[]> {
  const subscriptions = await listActiveSkioSubscriptions(proxy);
  const results: SyncedSubscriptionResult[] = [];

  for (const subscription of subscriptions) {
    const snapshot = toSnapshot(subscription);
    if (!snapshot) continue;

    const decision = resolveShippingOverride(tiersConfig, snapshot);

    if (decision.overrideAmount === null || isAlreadyApplied(decision.overrideAmount, subscription.deliveryPrice)) {
      results.push({ ...decision, applied: false });
      continue;
    }

    try {
      await setSkioDeliveryPriceOverride(proxy, subscription.id, decision.overrideAmount);

      const verification = await getSkioSubscriptionById(proxy, subscription.id);
      const storedPrice = verification?.deliveryPrice ?? null;
      if (storedPrice === null || !isAlreadyApplied(decision.overrideAmount, storedPrice)) {
        throw new DeliveryPriceOverrideVerificationError(subscription.id, decision.overrideAmount, storedPrice);
      }

      results.push({ ...decision, applied: true });
    } catch (err) {
      if (err instanceof DeliveryPriceOverrideVerificationError) throw err;

      logger.error(
        "[skioShippingSyncRunner] Failed to set delivery price override.",
        "subscriptionId:",
        subscription.id,
        err,
      );
      results.push({ ...decision, applied: false });
    }
  }

  return results;
}
