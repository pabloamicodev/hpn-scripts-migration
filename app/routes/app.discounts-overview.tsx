import { useLoaderData, Link } from "react-router";
import type { CSSProperties } from "react";
import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "~/shopify.server";
import { listAllDiscounts } from "~/lib/shopifyDiscounts.server";
import { makeGraphqlProxy } from "~/lib/graphqlProxy.server";
import { loaderError } from "~/lib/actionError.server";

const PAGE_SIZE = 50;

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const cursor = url.searchParams.get("after") ?? undefined;
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));

  try {
    const { admin } = await authenticate.admin(request);
    const proxy = makeGraphqlProxy(admin);
    const { discounts, truncated, endCursor } = await listAllDiscounts(proxy, cursor);
    return { discounts, truncated, endCursor, page, hasPrev: page > 1 };
  } catch (err) {
    return loaderError("Failed to load discounts overview", {
      operation: "listAllDiscounts",
      cause: err,
      hint: "Check that the Shopify Admin API is accessible and the discountNodes query is returning results.",
    });
  }
}

type DiscountCategory = "auto-hpn" | "auto" | "code";

const TYPE_META: Record<string, { label: string; category: DiscountCategory }> = {
  DiscountAutomaticApp:          { label: "HPN App",      category: "auto-hpn" },
  DiscountAutomaticBasic:        { label: "Auto · Basic", category: "auto" },
  DiscountAutomaticBxgy:         { label: "Auto · BxGY",  category: "auto" },
  DiscountAutomaticFreeShipping: { label: "Auto · Ship",  category: "auto" },
  DiscountCodeBasic:             { label: "Code · Basic", category: "code" },
  DiscountCodeBxgy:              { label: "Code · BxGY",  category: "code" },
  DiscountCodeFreeShipping:      { label: "Code · Ship",  category: "code" },
  DiscountCodeApp:               { label: "Code · App",   category: "code" },
};

const CATEGORY_STYLE: Record<DiscountCategory, CSSProperties> = {
  "auto-hpn": {
    background: "var(--info-bg)",
    color: "var(--info-text)",
    border: "1px solid #b8d4ff",
  },
  auto: {
    background: "#e8f5e9",
    color: "#2e7d32",
    border: "1px solid #a5d6a7",
  },
  code: {
    background: "#fff3e0",
    color: "#e65100",
    border: "1px solid #ffcc80",
  },
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
  const { discounts, truncated, endCursor, page, hasPrev } = useLoaderData<typeof loader>();

  const sorted = [...discounts].sort((a, b) => {
    const aOrd = STATUS_ORDER[a.status] ?? 9;
    const bOrd = STATUS_ORDER[b.status] ?? 9;
    if (aOrd !== bOrd) return aOrd - bOrd;
    return a.title.localeCompare(b.title);
  });

  const activeCount = discounts.filter((d) => d.status === "ACTIVE").length;
  const hpnCount = discounts.filter((d) => d.type === "DiscountAutomaticApp").length;
  const rowOffset = (page - 1) * PAGE_SIZE;
  const nextPageParams = endCursor
    ? `?after=${encodeURIComponent(endCursor)}&page=${page + 1}`
    : null;

  return (
    <div className="app-page app-page--wide">
      <header className="page-header">
        <div>
          <h1 className="page-title">Discounts overview</h1>
          <p className="page-subtitle">
            All discounts in this store — no manual queries needed.
          </p>
        </div>
      </header>

      {(hasPrev || truncated) && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 16 }}>
          {hasPrev && (
            <Link to="?" className="btn btn--secondary" style={{ fontSize: 13 }}>
              ← First page
            </Link>
          )}
          {truncated && nextPageParams && (
            <Link to={nextPageParams} className="btn btn--secondary" style={{ fontSize: 13 }}>
              Next 50 →
            </Link>
          )}
          {truncated && (
            <span style={{ fontSize: 12, color: "var(--text-subdued)" }}>
              More discounts available in the store.
            </span>
          )}
        </div>
      )}

      <div className="metric-grid">
        <section className="card metric-card metric-card--info">
          <p className="metric-label">Shown this page</p>
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
            <h2 className="resource-title">All discounts — page {page}</h2>
            <p className="resource-meta">
              Showing #{rowOffset + 1}–#{rowOffset + discounts.length}
              {truncated ? " · more available, use pagination" : ""}
            </p>
          </div>
        </div>

        <div className="table-wrap">
          {sorted.length === 0 ? (
            <div className="empty-state">
              <h2>No discounts found</h2>
              <p>No discounts exist in this store.</p>
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: 48 }}>#</th>
                  <th>Title</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Started</th>
                  <th>HPN config</th>
                  <th>ID</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((discount, index) => (
                  <tr
                    key={discount.id}
                    className={
                      discount.status !== "ACTIVE"
                        ? "data-table__row--muted"
                        : undefined
                    }
                  >
                    <td data-label="#" className="cell-muted" style={{ fontSize: 12 }}>
                      {rowOffset + index + 1}
                    </td>

                    <td data-label="Title">
                      <span className="cell-strong">{discount.title}</span>
                    </td>

                    <td data-label="Type">
                      {(() => {
                        const meta = TYPE_META[discount.type];
                        const style: CSSProperties = {
                          display: "inline-flex",
                          alignItems: "center",
                          fontSize: 12,
                          fontWeight: 600,
                          padding: "2px 8px",
                          borderRadius: 999,
                          ...(meta ? CATEGORY_STYLE[meta.category] : {
                            background: "var(--surface-subdued)",
                            color: "var(--text-subdued)",
                            border: "1px solid var(--border)",
                          }),
                        };
                        return <span style={style}>{meta?.label ?? discount.type}</span>;
                      })()}
                    </td>

                    <td data-label="Status">
                      <span className={statusBadgeClass(discount.status)}>
                        {discount.status}
                      </span>
                    </td>

                    <td data-label="Started" className="cell-muted cell-nowrap">
                      {discount.startsAt
                        ? new Date(discount.startsAt).toLocaleDateString("en-US", {
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
