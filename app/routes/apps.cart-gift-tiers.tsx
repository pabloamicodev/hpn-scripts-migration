import type { LoaderFunctionArgs } from "react-router";

import { authenticate } from "~/shopify.server";
import { makeGraphqlProxy } from "~/lib/graphqlProxy.server";
import { getVariantById } from "~/lib/shopifyProducts.server";
import { getStorePreset } from "~/lib/hpnPromoDefaults";
import type { CartSubtotalFreeGiftRule } from "~/lib/validations";

// Storefront-facing app proxy endpoint (Shopify signs and forwards
// requests from https://<shop>/apps/cart-gift-tiers to this route — see
// [app_proxy] in shopify.app*.toml). Powers the Theme App Extension's
// cart-gift-tiers widget: it has no admin session of its own, so this is
// the only way it can learn the shop's configured gift tiers.
//
// authenticate.public.appProxy(request) verifies Shopify's HMAC signature
// itself (throws 400 on failure) before this loader ever runs — there is
// no separate signature check needed here.

function json(data: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      // Storefront pages load this on every relevant page view — keep it
      // for a short window rather than hitting the Admin API every time.
      "Cache-Control": "public, max-age=30",
      ...init?.headers,
    },
  });
}

const EMPTY_RESPONSE = { stackingMode: "highest_tier_only", tiers: [] };

export async function loader({ request }: LoaderFunctionArgs) {
  const { session, admin } = await authenticate.public.appProxy(request);

  if (!session || !admin) {
    // Shop isn't installed (or has no offline session) — widget goes idle.
    return json(EMPTY_RESPONSE);
  }

  const config = getStorePreset(session.shop);
  const rule = config.rules.find(
    (r): r is CartSubtotalFreeGiftRule =>
      r.type === "cart_subtotal_free_gift" && r.enabled,
  );

  if (!rule) {
    return json(EMPTY_RESPONSE);
  }

  const graphqlProxy = makeGraphqlProxy(admin);

  try {
    const tiers = await Promise.all(
      rule.tiers.map(async (tier) => {
        const variants = await Promise.all(
          tier.giftVariantIds.map((id) => getVariantById(graphqlProxy, id)),
        );

        return {
          id: tier.id,
          minimumSubtotal: tier.minimumSubtotal,
          maxFreeUnits: tier.maxFreeUnits,
          discountPercentage: tier.discountPercentage,
          variants: variants
            .filter((v): v is NonNullable<typeof v> => v !== null && v.availableForSale !== false)
            .map((v) => ({
              id: v.id,
              title: v.product.title === v.title ? v.title : `${v.product.title} — ${v.title}`,
              image: v.image?.url ?? v.product.featuredImage?.url ?? null,
              price: v.price,
            })),
        };
      }),
    );

    return json({
      stackingMode: rule.stackingMode,
      tiers: tiers.filter((tier) => tier.variants.length > 0),
    });
  } catch (error) {
    console.error("[apps/cart-gift-tiers] failed to resolve gift tier variants", error);
    return json(EMPTY_RESPONSE);
  }
}
