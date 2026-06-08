import { useLoaderData, useNavigate } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "~/shopify.server";
import { searchDiscounts } from "~/lib/shopifyDiscounts.server";
import { StatusBadge } from "~/components/StatusBadge";
import { DISCOUNT_TITLE } from "~/lib/hpnPromoConfig.server";

interface HpnPromoRule {
  enabled: boolean;
}

interface HpnPromoConfig {
  rules?: HpnPromoRule[];
}

export async function loader({ request }: LoaderFunctionArgs) {
  const { admin } = await authenticate.admin(request);

  const graphqlProxy = async (
    query: string,
    variables?: Record<string, unknown>
  ): Promise<{ data: any; errors?: any[] }> => {
    const response = await admin.graphql(query, { variables });
    const json = await response.json();

    return json as { data: any; errors?: any[] };
  };

  const discounts = await searchDiscounts(graphqlProxy, DISCOUNT_TITLE);

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
  };
}

export default function AppIndex() {
  const { discount, activeRulesCount, pausedRulesCount, lastUpdate } =
    useLoaderData<typeof loader>();

  const navigate = useNavigate();

  return (
    <div className="app-page app-page--wide">
      <header className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">
            Manage migrated HPN promotion rules and the automatic discount.
          </p>
        </div>
      </header>

      <div className="metric-grid">
        <section className="card metric-card metric-card--success">
          <p className="metric-label">Discount status</p>

          <StatusBadge status={discount ? "active" : "inactive"} />
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
          <p className="metric-value" style={{ fontSize: "16px" }}>
            {lastUpdate ? new Date(lastUpdate).toLocaleDateString() : "N/A"}
          </p>
        </section>
      </div>

      <section className="card">
        <div className="card__body">
          <h2 className="card__title" style={{ marginBottom: "12px" }}>
            Quick actions
          </h2>

          <div className="btn-row">
          {!discount ? (
            <button
              type="button"
              onClick={() => navigate("/app/discount")}
              className="btn btn--primary"
            >
              Create Discount
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => navigate("/app/promos")}
                className="btn btn--primary"
              >
                Manage Promos
              </button>

              <button
                type="button"
                onClick={() => navigate("/app/discount")}
                className="btn"
              >
                Discount Settings
              </button>
            </>
          )}

          <button
            type="button"
            onClick={() => navigate("/app/settings")}
            className="btn"
          >
            Settings
          </button>
          </div>
        </div>
      </section>
    </div>
  );
}
