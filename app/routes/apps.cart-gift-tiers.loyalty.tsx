import type { LoaderFunctionArgs } from "react-router";

import { authenticate } from "~/shopify.server";
import { getSkioCreditBalance, makeSkioGraphqlProxy } from "~/lib/skioApi.server";

// Storefront app proxy: https://<shop>/apps/cart-gift-tiers/loyalty.
// Powers the cart drawer's "You have N points ($X)" line. Skio only issues
// full-access API tokens, so the token lives here (env) and never reaches the
// theme. The customer comes from Shopify's signed `logged_in_customer_id`, so
// a visitor can only ever read their own balance.
//
// Token per shop: SKIO_API_TOKEN_<SHOP HANDLE> (e.g. SKIO_API_TOKEN_GETTRUSUPPS).
// Any failure answers { balance: null } and the theme hides the line.

const SKIO_TIMEOUT_MS = 2500;
const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { expiresAt: number; body: unknown }>();

function json(data: unknown) {
  return new Response(JSON.stringify(data), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "private, no-store",
    },
  });
}

function skioTokenFor(shop: string) {
  const handle = shop.replace(/\.myshopify\.com$/, "").replace(/[^a-z0-9]/gi, "_").toUpperCase();
  return process.env[`SKIO_API_TOKEN_${handle}`]?.trim() || null;
}

export async function loader({ request }: LoaderFunctionArgs) {
  await authenticate.public.appProxy(request);

  const params = new URL(request.url).searchParams;
  const shop = params.get("shop") ?? "";
  const customerId = params.get("logged_in_customer_id") ?? "";
  const token = skioTokenFor(shop);
  if (!/^\d+$/.test(customerId) || !token) return json({ balance: null });

  const key = `${shop}:${customerId}`;
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return json(cached.body);

  try {
    const balance = await getSkioCreditBalance(
      makeSkioGraphqlProxy(token, SKIO_TIMEOUT_MS),
      `gid://shopify/Customer/${customerId}`,
    );
    const body = {
      balance: balance
        ? {
            credits: balance.credits,
            value: balance.siteCurrencyValue,
            formatted: balance.siteCurrencyStringValue,
          }
        : null,
    };
    cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, body });
    if (cache.size > 5000) cache.delete(cache.keys().next().value!);
    return json(body);
  } catch (error) {
    console.error("[apps/cart-gift-tiers/loyalty] Skio balance lookup failed", error);
    return json({ balance: null });
  }
}
