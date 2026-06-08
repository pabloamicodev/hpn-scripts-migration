import { useLoaderData, useFetcher } from "react-router";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { authenticate } from "~/shopify.server";
import { loadActiveDiscount, DISCOUNT_TITLE, FUNCTION_ID_ENV, type GraphQLProxy } from "~/lib/hpnPromoConfig.server";
import { updateAutomaticDiscount } from "~/lib/shopifyDiscounts.server";
import { CartSimulator } from "~/components/CartSimulator";
import { defaultHpnPromoConfig } from "~/lib/hpnPromoDefaults";

function makeProxy(admin: any): GraphQLProxy {
  return async (q: string, v?: Record<string, unknown>) => {
    const res = await admin.graphql(q, { variables: v });
    return res.json();
  };
}

export async function loader({ request }: LoaderFunctionArgs) {
  const { admin } = await authenticate.admin(request);
  const proxy = makeProxy(admin);
  const loaded = await loadActiveDiscount(proxy);
  return {
    ...loaded,
    functionId: process.env[FUNCTION_ID_ENV] ?? null,
    graphqlConsoleEnabled: process.env.ENABLE_GRAPHQL_CONSOLE === "true",
  };
}

export async function action({ request }: ActionFunctionArgs) {
  const { admin } = await authenticate.admin(request);
  const proxy = makeProxy(admin);

  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");

  const loaded = await loadActiveDiscount(proxy);
  if (!loaded.discountId) {
    return { error: "No active discount to update." };
  }

  if (intent === "update-combines-with") {
    const combinesWith = {
      orderDiscounts: formData.get("orderDiscounts") === "true",
      productDiscounts: formData.get("productDiscounts") === "true",
      shippingDiscounts: formData.get("shippingDiscounts") === "true",
    };

    const result = await updateAutomaticDiscount(proxy, loaded.discountId, {
      combinesWith,
      config: { ...loaded.config, combinesWith },
    });

    if (result?.userErrors?.length) {
      return { error: result.userErrors.map((e: any) => e.message).join(", ") };
    }
    return { ok: true };
  }

  return { error: "Unknown intent." };
}

export default function SettingsPage() {
  const { config, discountId, functionId, graphqlConsoleEnabled } =
    useLoaderData<typeof loader>();
  const fetcher = useFetcher();

  const combinesWith = config?.combinesWith ?? defaultHpnPromoConfig.combinesWith;

  const actionError =
    fetcher.data && "error" in fetcher.data ? fetcher.data.error : null;
  const actionOk =
    fetcher.data && "ok" in fetcher.data ? fetcher.data.ok : false;

  return (
    <div className="app-page app-page--narrow">
      <header className="page-header">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-subtitle">
            Review app environment status and discount combination behavior.
          </p>
        </div>
      </header>

      <section className="card">
        <div className="card__body">
        <h2 className="card__title" style={{ marginBottom: "14px" }}>
          Environment
        </h2>
        <dl className="definition-list">
          <dt>Function ID</dt>
          <dd>
            {functionId ? (
              <code>{functionId}</code>
            ) : (
              <span className="status-badge status-badge--error">
                Not set
              </span>
            )}
          </dd>

          <dt>GraphQL Console</dt>
          <dd>
            <code>{graphqlConsoleEnabled ? "Enabled" : "Disabled"}</code>
          </dd>
        </dl>
        </div>
      </section>

      <section className="card">
        <div className="card__body">
        <h2 className="card__title" style={{ marginBottom: "14px" }}>
          Combines with
        </h2>
        {!discountId ? (
          <p className="muted" style={{ margin: 0 }}>
            No active discount to configure.
          </p>
        ) : (
          <fetcher.Form method="post">
            <input type="hidden" name="intent" value="update-combines-with" />

            {(["orderDiscounts", "productDiscounts", "shippingDiscounts"] as const).map(
              (key) => (
                <label
                  key={key}
                  className="checkbox-row"
                >
                  <input
                    type="hidden"
                    name={key}
                    value={String(!!combinesWith[key])}
                  />
                  <input
                    type="checkbox"
                    defaultChecked={!!combinesWith[key]}
                    onChange={(e) => {
                      const hidden = e.currentTarget.previousElementSibling as HTMLInputElement;
                      hidden.value = String(e.currentTarget.checked);
                    }}
                  />
                  {key === "orderDiscounts" && "Combines with Order Discounts"}
                  {key === "productDiscounts" && "Combines with Product Discounts"}
                  {key === "shippingDiscounts" && "Combines with Shipping Discounts"}
                </label>
              )
            )}

            {actionError && (
              <p className="alert alert--critical" style={{ marginTop: "12px" }}>
                {actionError}
              </p>
            )}
            {actionOk && (
              <p className="alert alert--success" style={{ marginTop: "12px" }}>
                Saved.
              </p>
            )}

            <button
              type="submit"
              disabled={fetcher.state !== "idle"}
              className="btn btn--primary"
              style={{ marginTop: "12px" }}
            >
              {fetcher.state !== "idle" ? "Saving..." : "Save"}
            </button>
          </fetcher.Form>
        )}
        </div>
      </section>

      <section>
        <CartSimulator config={config ?? defaultHpnPromoConfig} />
      </section>
    </div>
  );
}
