import { useLoaderData } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "~/shopify.server";
import { GraphqlConsole } from "~/components/GraphqlConsole";

export async function loader({ request }: LoaderFunctionArgs) {
  await authenticate.admin(request);
  return { enabled: process.env.ENABLE_GRAPHQL_CONSOLE === "true" };
}

export default function GraphQLPage() {
  const { enabled } = useLoaderData<typeof loader>();

  if (!enabled) {
    return (
      <div className="alert alert--warning">
        GraphQL console is disabled.
      </div>
    );
  }

  return (
    <div className="app-page app-page--wide">
      <header className="page-header">
        <div>
          <h1 className="page-title">GraphQL console</h1>
          <p className="page-subtitle">
            Internal authenticated Admin GraphQL proxy. Enable with{" "}
            <code>ENABLE_GRAPHQL_CONSOLE=true</code>.
          </p>
        </div>
      </header>
      <GraphqlConsole />
    </div>
  );
}
