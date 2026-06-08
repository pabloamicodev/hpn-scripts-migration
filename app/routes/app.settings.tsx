import {
  useLoaderData,
  useFetcher,
  useNavigate,
  useSearchParams,
} from "react-router";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { authenticate } from "~/shopify.server";
import { loadActiveDiscount, type GraphQLProxy } from "~/lib/hpnPromoConfig.server";
import { findHpnFunctionId, updateAutomaticDiscount } from "~/lib/shopifyDiscounts.server";
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
  const [loaded, functionId] = await Promise.all([
    loadActiveDiscount(proxy),
    findHpnFunctionId(proxy),
  ]);
  return {
    ...loaded,
    functionId,
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
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const activeRuleId = searchParams.get("rule") ?? undefined;

  const combinesWith = config?.combinesWith ?? defaultHpnPromoConfig.combinesWith;
  const rules = config?.rules ?? defaultHpnPromoConfig.rules;
  const activeRules = rules.filter((rule) => rule.enabled).length;
  const pausedRules = rules.length - activeRules;

  const actionError =
    fetcher.data && "error" in fetcher.data ? fetcher.data.error : null;
  const actionOk =
    fetcher.data && "ok" in fetcher.data ? fetcher.data.ok : false;

  return (
    <div className="app-page app-page--wide">
      <header className="page-header">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-subtitle">
            Review app environment status and discount combination behavior.
          </p>
        </div>

        <div className="toolbar">
          <button
            type="button"
            onClick={() => navigate("/app/promos")}
            className="btn"
          >
            Promo rules
          </button>
          {graphqlConsoleEnabled && (
            <button
              type="button"
              onClick={() => navigate("/app/graphql")}
              className="btn"
            >
              GraphQL console
            </button>
          )}
        </div>
      </header>

      <div className="settings-layout">
        <aside className="section-grid">
          <section className="card card--raised">
            <div className="card__header">
              <div>
                <h2 className="card__title">Environment</h2>
                <p className="card__subtitle">
                  Deployment and admin-tool status.
                </p>
              </div>
            </div>

            <div className="card__body">
              <ul className="detail-list">
                <li>
                  <span className="detail-list__label">Function ID</span>
                  <span className="detail-list__value mono">
                    {functionId ? (
                      functionId
                    ) : (
                      <span className="status-badge status-badge--error">
                        Not set
                      </span>
                    )}
                  </span>
                </li>
                <li>
                  <span className="detail-list__label">GraphQL console</span>
                  <span className="detail-list__value">
                    {graphqlConsoleEnabled ? "Enabled" : "Disabled"}
                  </span>
                </li>
                <li>
                  <span className="detail-list__label">Automatic discount</span>
                  <span className="detail-list__value">
                    {discountId ? "Connected" : "Not created"}
                  </span>
                </li>
              </ul>
            </div>
          </section>

          <section className="card">
            <div className="card__header">
              <div>
                <h2 className="card__title">Rule health</h2>
                <p className="card__subtitle">
                  Current configuration summary.
                </p>
              </div>
            </div>

            <div className="card__body">
              <div className="summary-grid">
                <div className="summary-tile">
                  <p className="summary-tile__label">Rules</p>
                  <p className="summary-tile__value">{rules.length}</p>
                </div>
                <div className="summary-tile">
                  <p className="summary-tile__label">Active</p>
                  <p className="summary-tile__value">{activeRules}</p>
                </div>
                <div className="summary-tile">
                  <p className="summary-tile__label">Paused</p>
                  <p className="summary-tile__value">{pausedRules}</p>
                </div>
              </div>
            </div>
          </section>
        </aside>

        <main className="section-grid">
          <section className="card">
            <div className="card__header">
              <div>
                <h2 className="card__title">Discount combinations</h2>
                <p className="card__subtitle">
                  Control whether this automatic app discount can stack with
                  other Shopify discounts.
                </p>
              </div>
            </div>

            <div className="card__body">
              {!discountId ? (
                <div className="alert alert--warning">
                  No active discount to configure. Create the discount before
                  saving combination settings.
                </div>
              ) : (
                <fetcher.Form method="post">
                  <input
                    type="hidden"
                    name="intent"
                    value="update-combines-with"
                  />

                  <div className="section-grid">
                    {(
                      [
                        "orderDiscounts",
                        "productDiscounts",
                        "shippingDiscounts",
                      ] as const
                    ).map((key) => (
                      <label key={key} className="checkbox-row">
                        <input
                          type="hidden"
                          name={key}
                          value={String(!!combinesWith[key])}
                        />
                        <input
                          type="checkbox"
                          defaultChecked={!!combinesWith[key]}
                          onChange={(e) => {
                            const hidden = e.currentTarget
                              .previousElementSibling as HTMLInputElement;
                            hidden.value = String(e.currentTarget.checked);
                          }}
                        />
                        {key === "orderDiscounts" &&
                          "Combines with order discounts"}
                        {key === "productDiscounts" &&
                          "Combines with product discounts"}
                        {key === "shippingDiscounts" &&
                          "Combines with shipping discounts"}
                      </label>
                    ))}
                  </div>

                  {actionError && (
                    <div className="alert alert--critical">
                      {actionError}
                    </div>
                  )}
                  {actionOk && (
                    <div className="alert alert--success">Saved.</div>
                  )}

                  <div className="btn-row" style={{ marginTop: "14px" }}>
                    <button
                      type="submit"
                      disabled={fetcher.state !== "idle"}
                      className="btn btn--primary"
                    >
                      {fetcher.state !== "idle" ? "Saving..." : "Save settings"}
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate("/app/discount")}
                      className="btn"
                    >
                      Discount management
                    </button>
                  </div>
                </fetcher.Form>
              )}
            </div>
          </section>

          <CartSimulator
            config={config ?? defaultHpnPromoConfig}
            activeRuleId={activeRuleId}
          />
        </main>
      </div>
    </div>
  );
}
