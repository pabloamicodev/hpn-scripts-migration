// ---------------------------------------------------------------------------
// Skio GraphQL API client — https://graphql.skio.com/v1/graphql.
//
// Schema confirmed via live introspection against a real Skio API key
// (2026-09-22) — this is a Hasura-generated API: list queries take
// `where`/`limit`/`offset`/`order_by` (no Relay-style cursor connections),
// and mutation payloads don't carry a `userErrors` list — failures surface
// as ordinary top-level GraphQL `errors`.
//
// Things confirmed empirically (via a disposable test subscription created
// with no paymentMethodId, so it could never actually bill anyone) that are
// easy to get wrong by guessing:
//  - Auth header is `authorization: API <token>` — not `Bearer <token>` and
//    not the bare token.
//  - A subscription's plan duration lives on BillingPolicy as
//    `interval: "DAY"` + `intervalCount` (e.g. a "3-month" plan is
//    interval=DAY, intervalCount=90) — there is no MONTH-based interval in
//    the data actually seen. subscriptionDurationMonths in
//    skioShippingTiers.ts is derived by rounding intervalCount/30.
//  - setDeliveryPriceOverride(deliveryPrice: 1.99) correctly and precisely
//    set the subscription's `deliveryPrice` field to 1.99 — that's the field
//    that reflects the actual, effective shipping charge, and it supports
//    full cents precision (numeric/decimal). `deliveryPriceOverride` itself
//    (an Int) came back as `1`, not `1.99` or `199` — it is NOT a price at
//    all, just some other override flag/marker. Comparisons and read-back
//    verification must use `deliveryPrice`, never `deliveryPriceOverride`.
//  - ProductVariant.platformId on Skio's side is the exact Shopify variant
//    GID (e.g. "gid://shopify/ProductVariant/12195880108116") — confirmed
//    live — so tier product filters can be expressed directly in Shopify
//    GIDs (matching this app's ProductPicker component) with zero ID
//    translation needed.
// ---------------------------------------------------------------------------

export type SkioGraphQLProxyFn = <TData = unknown>(
  query: string,
  variables?: Record<string, unknown>,
) => Promise<{ data?: TData; errors?: { message: string }[] }>;

const SKIO_API_URL = "https://graphql.skio.com/v1/graphql";

export function makeSkioGraphqlProxy(apiKey: string): SkioGraphQLProxyFn {
  return async <TData = unknown>(query: string, variables?: Record<string, unknown>) => {
    const response = await fetch(SKIO_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        authorization: `API ${apiKey}`,
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      throw new Error(`Skio API request failed: HTTP ${response.status} ${response.statusText}`);
    }

    return response.json() as Promise<{ data?: TData; errors?: { message: string }[] }>;
  };
}

function getSkioErrorMessage(errors?: { message: string }[]) {
  return errors?.map((e) => e.message).join(", ");
}

function assertNoSkioErrors(result: { errors?: { message: string }[] }, operationName: string) {
  if (result.errors?.length) {
    throw new Error(`${operationName} failed: ${getSkioErrorMessage(result.errors)}`);
  }
}

const LIST_ACTIVE_SUBSCRIPTIONS_QUERY = `
  query ListActiveSubscriptions($limit: Int!, $offset: Int!) {
    Subscriptions(
      limit: $limit
      offset: $offset
      where: { status: { _eq: "ACTIVE" } }
      order_by: { id: asc }
    ) {
      id
      status
      cyclesCompleted
      nextBillingDate
      deliveryPrice
      deliveryPriceOverride
      BillingPolicy {
        interval
        intervalCount
      }
      SubscriptionLines {
        priceWithoutDiscount
        quantity
        removedAt
        ProductVariant {
          platformId
        }
      }
    }
  }
`;

const GET_SUBSCRIPTION_BY_ID_QUERY = `
  query GetSkioSubscription($id: uuid!) {
    SubscriptionByPk(id: $id) {
      id
      status
      cyclesCompleted
      nextBillingDate
      deliveryPrice
      deliveryPriceOverride
      BillingPolicy {
        interval
        intervalCount
      }
      SubscriptionLines {
        priceWithoutDiscount
        quantity
        removedAt
        ProductVariant {
          platformId
        }
      }
    }
  }
`;

const SET_DELIVERY_PRICE_OVERRIDE_MUTATION = `
  mutation SetDeliveryPriceOverride($input: SetDeliveryPriceOverrideInput!) {
    setDeliveryPriceOverride(input: $input) {
      subscriptionId
    }
  }
`;

interface RawSkioSubscriptionLine {
  priceWithoutDiscount: number;
  quantity: number;
  removedAt: string | null;
  ProductVariant: { platformId: string };
}

export interface RawSkioSubscription {
  id: string;
  status: string;
  cyclesCompleted: number | null;
  nextBillingDate: string | null;
  deliveryPrice: number;
  deliveryPriceOverride: number | null;
  BillingPolicy: {
    interval: string;
    intervalCount: number;
  };
  SubscriptionLines: RawSkioSubscriptionLine[];
}

interface ListActiveSubscriptionsData {
  Subscriptions: RawSkioSubscription[];
}

interface GetSubscriptionByIdData {
  SubscriptionByPk: RawSkioSubscription | null;
}

export async function getSkioSubscriptionById(
  proxy: SkioGraphQLProxyFn,
  id: string,
): Promise<RawSkioSubscription | null> {
  const result = await proxy<GetSubscriptionByIdData>(GET_SUBSCRIPTION_BY_ID_QUERY, { id });
  assertNoSkioErrors(result, "GetSkioSubscription");
  return result.data?.SubscriptionByPk ?? null;
}

interface SetDeliveryPriceOverrideData {
  setDeliveryPriceOverride: { subscriptionId: string } | null;
}

const PAGE_SIZE = 100;

/**
 * Fetches every ACTIVE Skio subscription, offset-paginated (Hasura has no
 * cursor for this list). Stops once a page comes back short of PAGE_SIZE.
 */
export async function listActiveSkioSubscriptions(
  proxy: SkioGraphQLProxyFn,
): Promise<RawSkioSubscription[]> {
  const subscriptions: RawSkioSubscription[] = [];
  let offset = 0;

  for (;;) {
    const result = await proxy<ListActiveSubscriptionsData>(LIST_ACTIVE_SUBSCRIPTIONS_QUERY, {
      limit: PAGE_SIZE,
      offset,
    });
    assertNoSkioErrors(result, "ListActiveSubscriptions");

    const page = result.data?.Subscriptions ?? [];
    subscriptions.push(...page);

    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return subscriptions;
}

/**
 * intervalCount is expressed in days on Skio's BillingPolicy (confirmed live:
 * a "3-month" plan is interval=DAY, intervalCount=90) — round to the nearest
 * month for tier matching against skioShippingTiers' subscriptionDurationMonths.
 * Only handles interval "DAY"; any other interval unit returns null so the
 * subscription is simply excluded from tier matching rather than mismatched.
 */
export function intervalToDurationMonths(policy: { interval: string; intervalCount: number }): number | null {
  if (policy.interval !== "DAY") return null;
  return Math.round(policy.intervalCount / 30);
}

/** Sum of active (non-removed) line prices — used as the tier subtotal. */
export function subscriptionSubtotal(subscription: RawSkioSubscription): number {
  return subscription.SubscriptionLines.filter((line) => !line.removedAt).reduce(
    (sum, line) => sum + line.priceWithoutDiscount * line.quantity,
    0,
  );
}

/** Shopify variant GIDs (via ProductVariant.platformId) across active (non-removed) lines. */
export function subscriptionProductVariantIds(subscription: RawSkioSubscription): string[] {
  return subscription.SubscriptionLines.filter((line) => !line.removedAt).map(
    (line) => line.ProductVariant.platformId,
  );
}

export async function setSkioDeliveryPriceOverride(
  proxy: SkioGraphQLProxyFn,
  subscriptionId: string,
  deliveryPrice: number,
): Promise<void> {
  const result = await proxy<SetDeliveryPriceOverrideData>(SET_DELIVERY_PRICE_OVERRIDE_MUTATION, {
    input: { subscriptionId, deliveryPrice },
  });
  assertNoSkioErrors(result, "SetDeliveryPriceOverride");

  if (!result.data?.setDeliveryPriceOverride?.subscriptionId) {
    throw new Error("SetDeliveryPriceOverride returned no result and no error.");
  }
}
