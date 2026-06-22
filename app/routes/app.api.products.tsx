import type { LoaderFunctionArgs } from "react-router";

import {
  getProductById,
  getVariantById,
  listProducts,
  searchProducts,
  type GraphQLProxyFn,
} from "~/lib/shopifyProducts.server";
import { authenticate } from "~/shopify.server";
import { makeGraphqlProxy } from "~/lib/graphqlProxy.server";

function json(data: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...init?.headers,
    },
  });
}

function getImage(product: {
  featuredImage?: { url: string; altText?: string | null } | null;
}) {
  return product.featuredImage ?? null;
}

async function lookupSelections(graphqlProxy: GraphQLProxyFn, ids: string[]) {
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
  const selections = [];

  for (const id of uniqueIds) {
    if (id.startsWith("gid://shopify/ProductVariant/")) {
      const variant = await getVariantById(graphqlProxy, id);

      if (!variant) continue;

      const image = variant.image ?? getImage(variant.product);

      selections.push({
        id,
        productId: variant.product.id,
        productTitle: variant.product.title,
        productHandle: variant.product.handle,
        vendor: variant.product.vendor,
        variantId: variant.id,
        variantTitle: variant.title,
        sku: variant.sku,
        price: variant.price,
        imageUrl: image?.url,
        imageAlt: image?.altText,
      });
      continue;
    }

    if (id.startsWith("gid://shopify/Product/")) {
      const product = await getProductById(graphqlProxy, id);

      if (!product) continue;

      const image = getImage(product);

      selections.push({
        id,
        productId: product.id,
        productTitle: product.title,
        productHandle: product.handle,
        vendor: product.vendor,
        imageUrl: image?.url,
        imageAlt: image?.altText,
      });
    }
  }

  return selections;
}

const MAX_FIRST = 50;
const MAX_QUERY_LENGTH = 200;
const VALID_GID_PREFIXES = [
  "gid://shopify/Product/",
  "gid://shopify/ProductVariant/",
] as const;

function isValidShopifyGid(id: string): boolean {
  return VALID_GID_PREFIXES.some((prefix) => id.startsWith(prefix));
}

export async function loader({ request }: LoaderFunctionArgs) {
  const { admin } = await authenticate.admin(request);
  const url = new URL(request.url);

  const rawIds = url.searchParams.get("ids")?.split(",").map((id) => id.trim()) ?? [];
  const ids = rawIds.filter(isValidShopifyGid);

  const query = (url.searchParams.get("query")?.trim() ?? "").slice(0, MAX_QUERY_LENGTH);
  const rawFirst = Number.parseInt(url.searchParams.get("first") ?? "12", 10);
  const first = Math.min(Number.isNaN(rawFirst) ? 12 : rawFirst, MAX_FIRST);

  if (ids.length > 0) {
    try {
      const selections = await lookupSelections(makeGraphqlProxy(admin), ids);
      return json({ selections });
    } catch (error) {
      return json(
        {
          selections: [],
          error:
            error instanceof Error ? error.message : "Product lookup failed.",
        },
        { status: 500 },
      );
    }
  }

  try {
    const products =
      query.length > 0
        ? await searchProducts(makeGraphqlProxy(admin), query, first)
        : await listProducts(makeGraphqlProxy(admin), first);

    return json({ products });
  } catch (error) {
    return json(
      {
        products: [],
        error:
          error instanceof Error ? error.message : "Product search failed.",
      },
      { status: 500 },
    );
  }
}
