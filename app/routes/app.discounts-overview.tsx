import { useLoaderData } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "~/shopify.server";
import { listAllDiscounts } from "~/lib/shopifyDiscounts.server";
import { makeGraphqlProxy } from "~/lib/graphqlProxy.server";
import { loaderError } from "~/lib/actionError.server";

export async function loader({ request }: LoaderFunctionArgs) {
  try {
    const { admin } = await authenticate.admin(request);
    const proxy = makeGraphqlProxy(admin);
    const { discounts, truncated } = await listAllDiscounts(proxy);
    return { discounts, truncated };
  } catch (err) {
    return loaderError("Failed to load discounts overview", {
      operation: "listAllDiscounts",
      cause: err,
      hint: "Check that the Shopify Admin API is accessible and the discountNodes query is returning results.",
    });
  }
}

const TYPE_LABELS: Record<string, string> = {
  DiscountAutomaticApp: "App (HPN)",
  DiscountAutomaticBasic: "Basic",
  DiscountAutomaticBxgy: "Buy X Get Y",
  DiscountAutomaticFreeShipping: "Free Shipping",
};

const STATUS_ORDER: Record<string, number> = {
  ACTIVE: 0,
  SCHEDULED: 1,
  EXPIRED: 2,
};

function statusBadgeClass(status: string) {
  switch (status) {
    case "ACTIVE":
      return "status-badge status-badge--active";
    case "EXPIRED":
      return "status-badge status-badge--error";
    case "SCHEDULED":
      return "status-badge status-badge--paused";
    default:
      return "status-badge status-badge--inactive";
  }
}

function shortId(gid: string) {
  const parts = gid.split("/");
  return parts[parts.length - 1] ?? gid;
}

export default function DiscountsOverviewPage() {
  const { discounts, truncated } = useLoaderData<typeof loader>();

  const sorted = [...discounts].sort((a, b) => {
    const aOrd = STATUS_ORDER[a.status] ?? 9;
    const bOrd = STATUS_ORDER[b.status] ?? 9;
    if (aOrd !== bOrd) return aOrd - bOrd;
    return a.title.localeCompare(b.title);
  });

  const activeCount = discounts.filter((d) => d.status === "ACTIVE").length;
  const hpnCount = discounts.filter((d) => d.type === "DiscountAutomaticApp").length;

  return (
    <div className="app-page app-page--wide">
      <header className="page-header">
        <div>
          <h1 className="page-title">Discounts overview</h1>
          <p className="page-subtitle">
            All automatic discounts in this store — sin correr queries manuales.
          </p>
        </div>
      </header>

      {truncated && (
        <div className="alert alert--warning">
          This store has more than 100 automatic discounts. Only the first 100 are shown.
          Run a manual GraphQL query with pagination to see the rest.
        </div>
      )}

      <div className="metric-grid">
        <section className="card metric-card metric-card--info">
          <p className="metric-label">Total shown</p>
          <p className="metric-value">{discounts.length}{truncated ? "+" : ""}</p>
        </section>

        <section className="card metric-card metric-card--success">
          <p className="metric-label">Active</p>
          <p className="metric-value">{activeCount}</p>
        </section>

        <section className="card metric-card">
          <p className="metric-label">HPN App discounts</p>
          <p className="metric-value">{hpnCount}</p>
        </section>

        <section className="card metric-card metric-card--warning">
          <p className="metric-label">Inactive / expired</p>
          <p className="metric-value">{discounts.length - activeCount}</p>
        </section>
      </div>

      <div className="resource-card">
        <div className="resource-header">
          <div>
            <h2 className="resource-title">All automatic discounts</h2>
            <p className="resource-meta">
              {discounts.length} discount{discounts.length !== 1 ? "s" : ""} shown
              {truncated ? " (store has more — page limit reached)" : ""}
            </p>
          </div>
        </div>

        <div className="table-wrap">
          {sorted.length === 0 ? (
            <div className="empty-state">
              <h2>No discounts found</h2>
              <p>No automatic discounts exist in this store.</p>
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Started</th>
                  <th>HPN config</th>
                  <th>ID</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((discount) => (
                  <tr
                    key={discount.id}
                    className={
                      discount.status !== "ACTIVE"
                        ? "data-table__row--muted"
                        : undefined
                    }
                  >
                    <td data-label="Title">
                      <span className="cell-strong">{discount.title}</span>
                    </td>

                    <td data-label="Type">
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 5,
                          fontSize: 12,
                          fontWeight: 600,
                          padding: "2px 8px",
                          borderRadius: 999,
                          background:
                            discount.type === "DiscountAutomaticApp"
                              ? "var(--info-bg)"
                              : "var(--surface-subdued)",
                          color:
                            discount.type === "DiscountAutomaticApp"
                              ? "var(--info-text)"
                              : "var(--text-subdued)",
                          border:
                            discount.type === "DiscountAutomaticApp"
                              ? "1px solid #b8d4ff"
                              : "1px solid var(--border)",
                        }}
                      >
                        {TYPE_LABELS[discount.type] ?? discount.type}
                      </span>
                    </td>

                    <td data-label="Status">
                      <span className={statusBadgeClass(discount.status)}>
                        {discount.status}
                      </span>
                    </td>

                    <td data-label="Started" className="cell-muted cell-nowrap">
                      {discount.startsAt
                        ? new Date(discount.startsAt).toLocaleDateString("es-AR", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })
                        : "—"}
                    </td>

                    <td data-label="HPN config">
                      {discount.configMetafield ? (
                        <span className="status-badge status-badge--active">
                          Configured
                        </span>
                      ) : (
                        <span className="status-badge status-badge--inactive">
                          —
                        </span>
                      )}
                    </td>

                    <td data-label="ID">
                      <code
                        className="mono"
                        title={discount.discountId}
                        style={{ fontSize: 12 }}
                      >
                        {shortId(discount.discountId)}
                      </code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
