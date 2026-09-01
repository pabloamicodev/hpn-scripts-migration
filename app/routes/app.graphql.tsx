import { useLoaderData } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "~/shopify.server";
import { getDiscountTitle } from "~/lib/hpnPromoDefaults";
import { GraphqlConsole } from "~/components/GraphqlConsole";

export async function loader({ request }: LoaderFunctionArgs) {
  const enabled = process.env.ENABLE_GRAPHQL_CONSOLE === "true";
  if (!enabled) return { enabled, discountTitle: "" };

  const { session } = await authenticate.admin(request);
  return { enabled, discountTitle: getDiscountTitle(session.shop) };
}

export default function GraphQLPage() {
  const { enabled, discountTitle } = useLoaderData<typeof loader>();

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
      <GraphqlConsole discountTitle={discountTitle} />
    </div>
  );
}
