import type { GraphQLProxyFn } from "./shopifyProducts.server";

/**
 * Wraps the Shopify admin client into the GraphQLProxyFn interface
 * used throughout the server lib layer.
 *
 * The admin object comes from authenticate.admin(request) — never call
 * this outside a loader or action that has already authenticated.
 */
export function makeGraphqlProxy(admin: {
  graphql: (query: string, options?: { variables?: Record<string, unknown> }) => Promise<Response>;
}): GraphQLProxyFn {
  return async <TData = unknown>(
    query: string,
    variables?: Record<string, unknown>
  ) => {
    const response = await admin.graphql(query, { variables });
    return response.json() as Promise<{ data?: TData; errors?: { message: string }[] }>;
  };
}
