export {
  authenticate,
  unauthenticated,
  login,
  registerWebhooks,
  shopifySessionStorage,
  addDocumentResponseHeaders,
} from "../shopify.server";

import { authenticate } from "../shopify.server";

export async function executeGraphQLProxy(
  request: Request,
  query: string,
  variables: Record<string, unknown> = {}
): Promise<{ data: unknown; errors?: unknown[] }> {
  const { admin } = await authenticate.admin(request);

  const response = await admin.graphql(query, { variables });
  const json = (await response.json()) as { data: unknown; errors?: unknown[] };

  if (json.errors) {
    return { data: json.data, errors: json.errors };
  }
  return { data: json.data };
}

export function isGraphQLConsoleEnabled(): boolean {
  return process.env.ENABLE_GRAPHQL_CONSOLE === "true";
}
