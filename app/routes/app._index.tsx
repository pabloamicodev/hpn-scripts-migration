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
    <div>
      <h1
        style={{
          fontSize: "1.5rem",
          fontWeight: 700,
          marginBottom: "1.5rem",
        }}
      >
        HPN Scripts Migration — Dashboard
      </h1>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "1rem",
          marginBottom: "2rem",
        }}
      >
        <div
          style={{
            padding: "1.25rem",
            backgroundColor: "#f0fdf4",
            border: "1px solid #bbf7d0",
            borderRadius: "0.5rem",
          }}
        >
          <h3
            style={{
              fontSize: "0.8rem",
              color: "#166534",
              fontWeight: 600,
              marginBottom: "0.5rem",
            }}
          >
            Discount Status
          </h3>

          <StatusBadge status={discount ? "active" : "inactive"} />
        </div>

        <div
          style={{
            padding: "1.25rem",
            backgroundColor: "#eff6ff",
            border: "1px solid #bfdbfe",
            borderRadius: "0.5rem",
          }}
        >
          <h3
            style={{
              fontSize: "0.8rem",
              color: "#1e40af",
              fontWeight: 600,
              marginBottom: "0.5rem",
            }}
          >
            Active Rules
          </h3>

          <p
            style={{
              fontSize: "2rem",
              fontWeight: 700,
              color: "#1e3a5f",
            }}
          >
            {activeRulesCount}
          </p>
        </div>

        <div
          style={{
            padding: "1.25rem",
            backgroundColor: "#fef3c7",
            border: "1px solid #fde68a",
            borderRadius: "0.5rem",
          }}
        >
          <h3
            style={{
              fontSize: "0.8rem",
              color: "#92400e",
              fontWeight: 600,
              marginBottom: "0.5rem",
            }}
          >
            Paused Rules
          </h3>

          <p
            style={{
              fontSize: "2rem",
              fontWeight: 700,
              color: "#78350f",
            }}
          >
            {pausedRulesCount}
          </p>
        </div>

        <div
          style={{
            padding: "1.25rem",
            backgroundColor: "#f9fafb",
            border: "1px solid #e5e7eb",
            borderRadius: "0.5rem",
          }}
        >
          <h3
            style={{
              fontSize: "0.8rem",
              color: "#374151",
              fontWeight: 600,
              marginBottom: "0.5rem",
            }}
          >
            Last Config Update
          </h3>

          <p
            style={{
              fontSize: "1rem",
              fontWeight: 600,
              color: "#111827",
            }}
          >
            {lastUpdate ? new Date(lastUpdate).toLocaleDateString() : "N/A"}
          </p>
        </div>
      </div>

      <div
        style={{
          padding: "1.5rem",
          backgroundColor: "#f9fafb",
          border: "1px solid #e5e7eb",
          borderRadius: "0.5rem",
        }}
      >
        <h2
          style={{
            fontSize: "1.1rem",
            fontWeight: 600,
            marginBottom: "1rem",
          }}
        >
          Quick Actions
        </h2>

        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          {!discount ? (
            <button
              type="button"
              onClick={() => navigate("/app/discount")}
              style={{
                padding: "0.625rem 1.25rem",
                backgroundColor: "#0f172a",
                color: "#fff",
                border: "none",
                borderRadius: "0.375rem",
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              Create Discount
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => navigate("/app/promos")}
                style={{
                  padding: "0.625rem 1.25rem",
                  backgroundColor: "#0f172a",
                  color: "#fff",
                  border: "none",
                  borderRadius: "0.375rem",
                  cursor: "pointer",
                  fontWeight: 600,
                }}
              >
                Manage Promos
              </button>

              <button
                type="button"
                onClick={() => navigate("/app/discount")}
                style={{
                  padding: "0.625rem 1.25rem",
                  backgroundColor: "#f3f4f6",
                  color: "#374151",
                  border: "1px solid #d1d5db",
                  borderRadius: "0.375rem",
                  cursor: "pointer",
                  fontWeight: 600,
                }}
              >
                Discount Settings
              </button>
            </>
          )}

          <button
            type="button"
            onClick={() => navigate("/app/settings")}
            style={{
              padding: "0.625rem 1.25rem",
              backgroundColor: "#f3f4f6",
              color: "#374151",
              border: "1px solid #d1d5db",
              borderRadius: "0.375rem",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            Settings
          </button>
        </div>
      </div>
    </div>
  );
}
