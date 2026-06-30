import { useLoaderData, useNavigate } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "~/shopify.server";
import { findHpnFunctionId, searchDiscounts } from "~/lib/shopifyDiscounts.server";
import { makeGraphqlProxy } from "~/lib/graphqlProxy.server";
import { loaderError } from "~/lib/actionError.server";
import { getDiscountTitle } from "~/lib/hpnPromoDefaults";
import { StatusBadge } from "~/components/StatusBadge";

interface HpnPromoRule {
  enabled: boolean;
}

interface HpnPromoConfig {
  rules?: HpnPromoRule[];
}

export async function loader({ request }: LoaderFunctionArgs) {
  try {
  const { admin, session } = await authenticate.admin(request);
  const graphqlProxy = makeGraphqlProxy(admin);

  const [discounts, functionId] = await Promise.all([
    searchDiscounts(graphqlProxy, getDiscountTitle(session.shop)),
    findHpnFunctionId(graphqlProxy, session.shop),
  ]);

  const activeDiscount =
    discounts.find((discount) => discount.status === "ACTIVE") ?? null;

  let activeRulesCount = 0;
  let pausedRulesCount = 0;

  if (activeDiscount?.configMetafield) {
    try {
      const config = JSON.parse(activeDiscount.configMetafield) as HpnPromoConfig;
      const rules = config.rules ?? [];

      activeRulesCount = rules.filter((rule) => rule.enabled).length;
      pausedRulesCount = rules.filter((rule) => !rule.enabled).length;
    } catch (error) {
      console.error("Failed to parse discount configuration metafield", error);
    }
  }

  return {
    discount: activeDiscount,
    activeRulesCount,
    pausedRulesCount,
    lastUpdate: activeDiscount?.startsAt ?? null,
    functionId,
    defaultTitle: getDiscountTitle(session.shop),
  };
  } catch (err) {
    return loaderError("Failed to load dashboard", {
      operation: "loadDashboard",
      cause: err,
      hint: "Check that the Shopify Admin API is accessible and the session is valid.",
    });
  }
}

export default function AppIndex() {
  const { discount, activeRulesCount, pausedRulesCount, lastUpdate, functionId, defaultTitle } =
    useLoaderData<typeof loader>();

  const navigate = useNavigate();
  const totalRules = activeRulesCount + pausedRulesCount;

  return (
    <div className="app-page app-page--wide">
      <header className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">
            Manage migrated HPN promotion rules and the automatic discount.
          </p>
        </div>

        <div className="toolbar">
          <button
            type="button"
            onClick={() => navigate("/app/promos")}
            className="btn btn--primary"
            disabled={!discount}
          >
            Manage promos
          </button>
          <button
            type="button"
            onClick={() => navigate("/app/settings")}
            className="btn"
          >
            Settings
          </button>
        </div>
      </header>

      <div className="metric-grid">
        <section className="card metric-card metric-card--success">
          <p className="metric-label">Discount status</p>

          <StatusBadge status={getDashboardStatus(discount?.status ?? null)} />
        </section>

        <section className="card metric-card metric-card--info">
          <p className="metric-label">Active rules</p>
          <p className="metric-value">{activeRulesCount}</p>
        </section>

        <section className="card metric-card metric-card--warning">
          <p className="metric-label">Paused rules</p>
          <p className="metric-value">{pausedRulesCount}</p>
        </section>

        <section className="card metric-card">
          <p className="metric-label">Last config update</p>
          <p className="metric-value metric-value--compact">
            {lastUpdate ? new Date(lastUpdate).toLocaleDateString() : "N/A"}
          </p>
        </section>
      </div>

      <div className="split-layout">
        <section className="card card--raised">
          <div className="card__header">
            <div>
              <h2 className="card__title">Migration status</h2>
              <p className="card__subtitle">
                Current state of the Shopify Function discount.
              </p>
            </div>
            <StatusBadge status={getDashboardStatus(discount?.status ?? null)} />
          </div>

          <div className="card__body">
            <ul className="callout-list">
              <li>
                <span>Function deployed</span>
                <strong>{functionId ? "Yes" : "No"}</strong>
              </li>
              <li>
                <span>Automatic discount</span>
                <strong>{discount ? discount.status : "Not created"}</strong>
              </li>
              <li>
                <span>Rules published</span>
                <strong>{totalRules}</strong>
              </li>
              <li>
                <span>Legacy script parity checked</span>
                <strong>{activeRulesCount > 0 ? "Ready to test" : "Needs rules"}</strong>
              </li>
            </ul>
          </div>
        </section>

        <aside className="section-grid">
          <section className="card">
            <div className="card__header">
              <div>
                <h2 className="card__title">Quick actions</h2>
                <p className="card__subtitle">
                  Common operational paths for this app.
                </p>
              </div>
            </div>

            <div className="card__body">
              <div className="btn-stack">
                {!discount ? (
                  <button
                    type="button"
                    onClick={() => navigate("/app/discount")}
                    className="btn btn--primary btn--full"
                  >
                    Create discount
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => navigate("/app/promos")}
                      className="btn btn--primary btn--full"
                    >
                      Manage promos
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate("/app/discount")}
                      className="btn btn--full"
                    >
                      Discount management
                    </button>
                  </>
                )}

                <button
                  type="button"
                  onClick={() => navigate("/app/settings")}
                  className="btn btn--full"
                >
                  Simulator and settings
                </button>
              </div>
            </div>
          </section>

          <section className="card">
            <div className="card__header">
              <div>
                <h2 className="card__title">Current discount</h2>
                <p className="card__subtitle">
                  Shopify Admin source of truth.
                </p>
              </div>
            </div>

            <div className="card__body">
              <ul className="detail-list">
                <li>
                  <span className="detail-list__label">Title</span>
                  <span className="detail-list__value">
                    {discount?.title ?? defaultTitle}
                  </span>
                </li>
                <li>
                  <span className="detail-list__label">Started</span>
                  <span className="detail-list__value">
                    {lastUpdate
                      ? new Date(lastUpdate).toLocaleString()
                      : "Not created"}
                  </span>
                </li>
                <li>
                  <span className="detail-list__label">Function ID</span>
                  <span className="detail-list__value mono">
                    {functionId ?? "Not detected"}
                  </span>
                </li>
              </ul>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

function getDashboardStatus(
  status: string | null,
): "active" | "inactive" | "paused" | "error" {
  if (status === "ACTIVE") return "active";
  if (status === "SCHEDULED") return "paused";
  if (status === "EXPIRED") return "inactive";
  return "inactive";
}
