import {
  useLoaderData,
  useFetcher,
  useNavigate,
  useSearchParams,
} from "react-router";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { authenticate } from "~/shopify.server";
import { loadActiveDiscount, saveConfig } from "~/lib/hpnPromoConfig.server";
import { findHpnFunctionId } from "~/lib/shopifyDiscounts.server";
import { makeGraphqlProxy } from "~/lib/graphqlProxy.server";
import {
  actionError,
  loaderError,
  shopifyUserErrors,
} from "~/lib/actionError.server";
import type { ActionError } from "~/lib/actionError.server";
import { DevErrorBanner } from "~/components/DevErrorBanner";
import { CartSimulator } from "~/components/CartSimulator";
import { defaultHpnPromoConfig } from "~/lib/hpnPromoDefaults";

export async function loader({ request }: LoaderFunctionArgs) {
  try {
    const { admin, session } = await authenticate.admin(request);
    const proxy = makeGraphqlProxy(admin);
    const [loaded, functionId] = await Promise.all([
      loadActiveDiscount(proxy, session.shop),
      findHpnFunctionId(proxy),
    ]);
    return {
      ...loaded,
      functionId,
      graphqlConsoleEnabled: process.env.ENABLE_GRAPHQL_CONSOLE === "true",
    };
  } catch (err) {
    return loaderError("Failed to load settings page", {
      operation: "loadSettings",
      cause: err,
      hint: "Check that the Shopify Admin API is accessible and the session is valid.",
    });
  }
}

export async function action({ request }: ActionFunctionArgs) {
  try {
    const { admin, session } = await authenticate.admin(request);
    const proxy = makeGraphqlProxy(admin);

    const formData = await request.formData();
    const intent = String(formData.get("intent") ?? "");

    const loaded = await loadActiveDiscount(proxy, session.shop);
    if (!loaded.discountId) {
      return actionError("No active discount to update", {
        operation: "updateSettings",
        details: ["The automatic app discount has not been created yet."],
        hint: "Go to Discount management and create the discount first.",
      });
    }

    if (intent === "update-combines-with") {
      const combinesWith = {
        orderDiscounts: formData.get("orderDiscounts") === "true",
        productDiscounts: formData.get("productDiscounts") === "true",
        shippingDiscounts: formData.get("shippingDiscounts") === "true",
      };

      const expectedRevision = String(formData.get("configRevision") ?? "");
      const result = await saveConfig(
        proxy,
        session.shop,
        loaded.discountId,
        loaded.config,
        expectedRevision,
        (config) => ({ ...config, combinesWith }),
      );

      if (result?.userErrors?.length) {
        return actionError("Shopify rejected the combination settings update", {
          operation: "updateCombinesWith",
          details: shopifyUserErrors(result.userErrors),
          hint: `Discount ID: ${loaded.discountId}`,
        });
      }
      return { ok: true };
    }

    return actionError("Unrecognized intent", {
      operation: "updateSettings",
      details: [`Received intent: "${intent}"`],
      hint: "Expected 'update-combines-with' — this is likely a UI bug.",
    });
  } catch (err) {
    return actionError("Unexpected server error in settings action", {
      operation: "updateSettings",
      cause: err,
      hint: "Check Vercel function logs for the full stack trace.",
    });
  }
}

export default function SettingsPage() {
  const {
    config,
    discountId,
    functionId,
    graphqlConsoleEnabled,
    configValid,
    configError,
    configRevision,
  } =
    useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const activeRuleId = searchParams.get("rule") ?? undefined;

  const combinesWith = config?.combinesWith ?? defaultHpnPromoConfig.combinesWith;
  const rules = config?.rules ?? defaultHpnPromoConfig.rules;
  const activeRules = rules.filter((rule) => rule.enabled).length;
  const pausedRules = rules.length - activeRules;

  const actionErr =
    fetcher.data && "error" in fetcher.data
      ? (fetcher.data.error as ActionError)
      : null;
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

      <main className="settings-layout">
        <section className="card card--raised settings-card settings-card--environment">
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

        <section className="card settings-card settings-card--combinations">
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
            ) : !configValid ? (
              <div className="alert alert--critical" role="alert">
                {configError} Mutations are blocked. Repair it from Discount management.
              </div>
            ) : (
              <fetcher.Form method="post">
                <input
                  type="hidden"
                  name="intent"
                  value="update-combines-with"
                />
                <input
                  type="hidden"
                  name="configRevision"
                  value={configRevision}
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

                <DevErrorBanner error={actionErr} />
                {actionOk && (
                  <div className="alert alert--success" aria-live="polite">
                    Settings saved.
                  </div>
                )}

                <div className="btn-row btn-row--spaced">
                  <button
                    type="submit"
                    disabled={fetcher.state !== "idle"}
                    className="btn btn--primary"
                  >
                    {fetcher.state !== "idle" ? "Saving…" : "Save settings"}
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

        <section className="card settings-card settings-card--health">
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

        {configValid ? (
          <CartSimulator
            config={config ?? defaultHpnPromoConfig}
            activeRuleId={activeRuleId}
          />
        ) : (
          <div className="alert alert--critical" role="alert">
            Cart simulation is disabled because the published configuration is invalid.
          </div>
        )}
      </main>
    </div>
  );
}
