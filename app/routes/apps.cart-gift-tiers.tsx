import type { LoaderFunctionArgs } from "react-router";

import { authenticate } from "~/shopify.server";
import { makeGraphqlProxy } from "~/lib/graphqlProxy.server";
import {
  getVariantById,
  type GraphQLProxyFn,
  type ProductVariantWithProductNode,
} from "~/lib/shopifyProducts.server";
import { loadActiveDiscount } from "~/lib/hpnPromoConfig.server";
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

// Every storefront page view hits this route, but the signed URL Shopify
// generates (shop/timestamp/signature) is different on every request, so
// HTTP Cache-Control alone almost never gets a hit. Resolving each gift
// variant's title/image/price is an Admin API call per variant per tier —
// without this, a store with several tiers could burst through its Admin
// API rate limit under real traffic. The config changes rarely (a merchant
// editing a promo rule), so a short server-side cache is a safe trade.
const RESPONSE_CACHE_TTL_MS = 60_000;
const responseCache = new Map<string, { expiresAt: number; body: unknown }>();

interface ProductMedia {
  description: string;
  images: Array<{ url: string; altText: string | null }>;
}

const GET_PRODUCTS_MEDIA_QUERY = `
  query GetProductsMedia($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on Product {
        id
        description
        images(first: 8) {
          nodes {
            url
            altText
          }
        }
      }
    }
  }
`;

interface GetProductsMediaData {
  nodes: Array<{
    id: string;
    description?: string;
    images?: { nodes: Array<{ url: string; altText: string | null }> };
  } | null>;
}

async function loadProductMedia(
  graphqlProxy: GraphQLProxyFn,
  productIds: string[],
): Promise<Map<string, ProductMedia>> {
  const media = new Map<string, ProductMedia>();
  if (productIds.length === 0) return media;

  const result = await graphqlProxy<GetProductsMediaData>(GET_PRODUCTS_MEDIA_QUERY, {
    ids: productIds,
  });
  if (result.errors?.length) return media;

  for (const node of result.data?.nodes ?? []) {
    if (!node) continue;
    media.set(node.id, {
      description: node.description ?? "",
      images: node.images?.nodes ?? [],
    });
  }
  return media;
}

function variantDisplayTitle(v: ProductVariantWithProductNode) {
  if (v.title === "Default Title" || v.product.title === v.title) return v.product.title;
  return `${v.product.title} — ${v.title}`;
}

export async function loader({ request }: LoaderFunctionArgs) {
  const { session, admin } = await authenticate.public.appProxy(request);

  if (!session || !admin) {
    // Shop isn't installed (or has no offline session) — widget goes idle.
    return json(EMPTY_RESPONSE);
  }

  const cached = responseCache.get(session.shop);
  if (cached && cached.expiresAt > Date.now()) {
    return json(cached.body);
  }

  const graphqlProxy = makeGraphqlProxy(admin);

  try {
    const loaded = await loadActiveDiscount(graphqlProxy, session.shop);
    const rule = loaded.config.rules.find((r): r is CartSubtotalFreeGiftRule => r.type === "cart_subtotal_free_gift" && r.enabled);

    if (!rule) {
      return json(EMPTY_RESPONSE);
    }

    const tiers = await Promise.all(
      rule.tiers.map(async (tier) => {
        const resolved = await Promise.all(tier.giftVariantIds.map((id) => getVariantById(graphqlProxy, id)));
        const available = resolved.filter(
          (v): v is NonNullable<typeof v> => v !== null && v.availableForSale !== false,
        );

        // Group by product — a gift is usually one product with several
        // size/flavor variants to choose from, occasionally several
        // distinct products a merchant listed as alternatives.
        const byProductId = new Map<string, ProductVariantWithProductNode[]>();
        for (const v of available) {
          const list = byProductId.get(v.product.id) ?? [];
          list.push(v);
          byProductId.set(v.product.id, list);
        }

        const media = await loadProductMedia(graphqlProxy, Array.from(byProductId.keys()));

        const products = Array.from(byProductId.entries()).map(([productId, variants]) => {
          const productMedia = media.get(productId);
          const fallbackImage = variants[0]?.image?.url ?? variants[0]?.product.featuredImage?.url ?? null;
          const images = productMedia?.images?.length
            ? productMedia.images
            : fallbackImage
              ? [{ url: fallbackImage, altText: variants[0].product.title }]
              : [];

          return {
            id: productId,
            title: variants[0].product.title,
            description: productMedia?.description ?? "",
            images,
            variants: variants.map((v) => ({
              id: v.legacyResourceId ?? v.id.split("/").pop() ?? v.id,
              title: variantDisplayTitle(v),
              options: v.selectedOptions ?? [],
              image: v.image?.url ?? null,
              price: v.price,
            })),
          };
        });

        return {
          id: tier.id,
          minimumSubtotal: tier.minimumSubtotal,
          maxFreeUnits: tier.maxFreeUnits,
          discountPercentage: tier.discountPercentage,
          products,
        };
      }),
    );

    const body = {
      stackingMode: rule.stackingMode,
      message: rule.message,
      tiers: tiers.filter((tier) => tier.products.length > 0),
    };
    responseCache.set(session.shop, {
      expiresAt: Date.now() + RESPONSE_CACHE_TTL_MS,
      body,
    });
    return json(body);
  } catch (error) {
    console.error("[apps/cart-gift-tiers] failed to resolve gift tier variants", error);
    return json(EMPTY_RESPONSE);
  }
}
