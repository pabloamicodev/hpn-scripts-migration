import { useLoaderData } from "react-router";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { authenticate } from "~/shopify.server";
import { guardGraphQLConsole } from "~/lib/guards.server";
import { GraphqlConsole } from "~/components/GraphqlConsole";

export async function loader({ request }: LoaderFunctionArgs) {
  guardGraphQLConsole();
  await authenticate.admin(request);
  return { enabled: true };
}

export async function action({ request }: ActionFunctionArgs) {
  guardGraphQLConsole();

  const { admin } = await authenticate.admin(request);

  const body = await request.json() as { query: string; variables?: Record<string, unknown> };
  const { query, variables } = body;

  if (!query?.trim()) {
    return { errors: [{ message: "Query is required." }] };
  }

  try {
    const response = await admin.graphql(query, { variables: variables ?? {} });
    return response.json();
  } catch (err) {
    return {
      errors: [{ message: err instanceof Error ? err.message : "GraphQL request failed." }],
    };
  }
}

export default function GraphQLPage() {
  const { enabled } = useLoaderData<typeof loader>();

  if (!enabled) {
    return (
      <div style={{ padding: "2rem", color: "#6b7280" }}>
        GraphQL console is disabled.
      </div>
    );
  }

  return (
    <div>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.5rem" }}>
        GraphQL Console
      </h1>
      <p style={{ color: "#6b7280", fontSize: "0.875rem", marginBottom: "1.5rem" }}>
        Internal tool — authenticated Admin GraphQL proxy. Enable with{" "}
        <code>ENABLE_GRAPHQL_CONSOLE=true</code>.
      </p>
      <GraphqlConsole />
    </div>
  );
}
