import type { LoaderFunctionArgs } from "react-router";

import { searchProducts, type GraphQLProxyFn } from "~/lib/shopifyProducts.server";
import { authenticate } from "~/shopify.server";

function json(data: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...init?.headers,
    },
  });
}

function makeProxy(admin: any): GraphQLProxyFn {
  return async (query: string, variables?: Record<string, unknown>) => {
    const response = await admin.graphql(query, { variables });
    return response.json();
  };
}

export async function loader({ request }: LoaderFunctionArgs) {
  const { admin } = await authenticate.admin(request);
  const url = new URL(request.url);
  const query = url.searchParams.get("query")?.trim() ?? "";
  const first = Number.parseInt(url.searchParams.get("first") ?? "12", 10);

  if (query.length < 2) {
    return json({ products: [] });
  }

  try {
    const products = await searchProducts(makeProxy(admin), query, first);
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
