import { useMemo, useState } from "react";
import { useNavigate } from "react-router";

import type { HpnPromoRule } from "../lib/validations";
import { StatusBadge } from "./StatusBadge";

interface PromoRulesTableProps {
  rules: HpnPromoRule[];
  onPause: (ruleId: string) => void;
  onResume: (ruleId: string) => void;
  onDelete: (ruleId: string) => void;
}

const typeLabels: Record<HpnPromoRule["type"], string> = {
  pa7_cross_sell: "Cross-Sell",
  required_variants_free_variants: "Bundle Variants",
  required_product_with_free_variants: "Bundle Product + Variants",
  trigger_product_discounted_targets: "Trigger → Discounted Targets",
  loyalty_tier: "Loyalty Tier",
  subscription_bundle_group: "Subscription Bundle",
  one_time_purchase_discount: "One-Time Purchase Discount",
  swell_free_product: "Swell Free Product",
  swell_cart_fixed_amount: "Swell Fixed-Amount Reward",
  landing_quantity_tier_fixed_price: "Landing Page Quantity-Tier Price",
  landing_scoped_product_discount: "Landing Page Scoped Product Discount",
  landing_free_shipping: "Landing Page Free Shipping",
};

const pageSizeOptions = [5, 10, 25];

function getGidTail(gid: string) {
  return gid.split("/").pop() ?? gid;
}

type RuleActionIcon = "edit" | "pause" | "resume" | "test" | "delete";

function ActionIcon({ icon }: { icon: RuleActionIcon }) {
  const commonProps = {
    width: 16,
    height: 16,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  if (icon === "edit") {
    return (
      <svg {...commonProps}>
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
      </svg>
    );
  }

  if (icon === "pause") {
    return (
      <svg {...commonProps}>
        <path d="M8 5v14" />
        <path d="M16 5v14" />
      </svg>
    );
  }

  if (icon === "resume") {
    return (
      <svg {...commonProps}>
        <path d="M8 5v14l11-7Z" />
      </svg>
    );
  }

  if (icon === "test") {
    return (
      <svg {...commonProps}>
        <path d="M10 2v6.5L5 18a3 3 0 0 0 2.6 4h8.8A3 3 0 0 0 19 18l-5-9.5V2" />
        <path d="M8 2h8" />
        <path d="M7 15h10" />
      </svg>
    );
  }

  return (
    <svg {...commonProps}>
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v5" />
      <path d="M14 11v5" />
    </svg>
  );
}

export function PromoRulesTable({
  rules,
  onPause,
  onResume,
  onDelete,
}: PromoRulesTableProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "paused">(
    "all",
  );
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);

  const activeCount = rules.filter((rule) => rule.enabled).length;
  const pausedCount = rules.length - activeCount;

  const filteredRules = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return rules.filter((rule) => {
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && rule.enabled) ||
        (statusFilter === "paused" && !rule.enabled);

      if (!matchesStatus) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      return getRuleSearchText(rule).includes(normalizedQuery);
    });
  }, [query, rules, statusFilter]);

  const pageCount = Math.max(1, Math.ceil(filteredRules.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageStart = (currentPage - 1) * pageSize;
  const visibleRules = filteredRules.slice(pageStart, pageStart + pageSize);

  function updateQuery(nextQuery: string) {
    setQuery(nextQuery);
    setPage(1);
  }

  function updateStatusFilter(nextStatus: "all" | "active" | "paused") {
    setStatusFilter(nextStatus);
    setPage(1);
  }

  if (rules.length === 0) {
    return (
      <section className="card empty-state">
        <h2>No promo rules found</h2>
        <p>Create your first promo rule to start migrating legacy discounts.</p>
        <button
          type="button"
          onClick={() => navigate("/app/promos/new")}
          className="btn btn--primary"
        >
          Create rule
        </button>
      </section>
    );
  }

  return (
    <section className="resource-card">
      <div className="resource-header">
        <div>
          <h2 className="resource-title">Promotion rules</h2>
          <p className="resource-meta">
            {rules.length} total · {activeCount} active · {pausedCount} paused
          </p>
        </div>

        <button
          type="button"
          onClick={() => navigate("/app/promos/new")}
          className="btn btn--primary"
        >
          Add rule
        </button>
      </div>

      <div className="resource-toolbar">
        <div className="search-field" role="search">
          <label className="visually-hidden" htmlFor="promo-rule-search">
            Search promo rules
          </label>
          <input
            id="promo-rule-search"
            type="search"
            value={query}
            onChange={(event) => updateQuery(event.target.value)}
            placeholder="Search by name, product ID, type, or message…"
          />
        </div>

        <div className="segmented-control" aria-label="Filter by rule status">
          {(["all", "active", "paused"] as const).map((status) => (
            <button
              key={status}
              type="button"
              aria-pressed={statusFilter === status}
              onClick={() => updateStatusFilter(status)}
            >
              {status === "all" ? "All" : status === "active" ? "Active" : "Paused"}
            </button>
          ))}
        </div>

        <label className="pagination__label">
          Rows
          <select
            value={pageSize}
            onChange={(event) => {
              setPageSize(Number(event.target.value));
              setPage(1);
            }}
            className="pagination__select"
          >
            {pageSizeOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="table-wrap">
        <table className="data-table">
          <caption className="visually-hidden">
            Promotion rules with status, trigger, target, discount, message, and actions.
          </caption>
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Type</th>
              <th scope="col">Status</th>
              <th scope="col">Trigger</th>
              <th scope="col">Targets</th>
              <th scope="col">Discount</th>
              <th scope="col">Message</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>

          <tbody>
            {visibleRules.map((rule) => {
              const displayName = getRuleDisplayName(rule);
              const triggerSummary = getTriggerSummary(rule);

              return (
                <tr
                  key={rule.id}
                  className={rule.enabled ? undefined : "data-table__row--muted"}
                >
                  <td className="cell-strong cell-nowrap" data-label="Name">
                    {displayName}
                  </td>
                  <td data-label="Type">{typeLabels[rule.type] ?? "Unknown"}</td>
                  <td data-label="Status">
                    <StatusBadge status={rule.enabled ? "active" : "paused"} />
                  </td>
                  <td title={triggerSummary} className="cell-muted truncate" data-label="Trigger">
                    {triggerSummary}
                  </td>
                  <td className="cell-muted cell-nowrap" data-label="Targets">
                    {getTargetsCount(rule)} items
                  </td>
                  <td className="cell-strong cell-nowrap" data-label="Discount">
                    {getDiscountSummary(rule)}
                  </td>
                  <td title={rule.message} className="cell-muted truncate" data-label="Message">
                    {rule.message}
                  </td>
                  <td data-label="Actions">
                    <div className="row-actions">
                      <button
                        type="button"
                        onClick={() => navigate(`/app/promos/${rule.id}`)}
                        className="btn btn--icon"
                        aria-label={`Edit ${displayName}`}
                        data-tooltip="Edit"
                      >
                        <ActionIcon icon="edit" />
                      </button>

                      {rule.enabled ? (
                        <button
                          type="button"
                          onClick={() => onPause(rule.id)}
                          className="btn btn--icon btn--warning"
                          aria-label={`Pause ${displayName}`}
                          data-tooltip="Pause"
                        >
                          <ActionIcon icon="pause" />
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onResume(rule.id)}
                          className="btn btn--icon btn--success"
                          aria-label={`Resume ${displayName}`}
                          data-tooltip="Resume"
                        >
                          <ActionIcon icon="resume" />
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => navigate(`/app/settings?rule=${rule.id}`)}
                        className="btn btn--icon"
                        aria-label={`Test ${displayName}`}
                        data-tooltip="Test"
                      >
                        <ActionIcon icon="test" />
                      </button>

                      <button
                        type="button"
                        onClick={() => onDelete(rule.id)}
                        className="btn btn--icon btn--danger"
                        aria-label={`Delete ${displayName}`}
                        data-tooltip="Delete"
                      >
                        <ActionIcon icon="delete" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}

            {visibleRules.length === 0 && (
              <tr>
                <td
                  colSpan={8}
                  className="muted table-empty"
                >
                  No rules match the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="resource-footer">
        <span className="pagination__label">
          Showing {filteredRules.length === 0 ? 0 : pageStart + 1}-
          {Math.min(pageStart + pageSize, filteredRules.length)} of{" "}
          {filteredRules.length}
        </span>

        <div className="pagination">
          <button
            type="button"
            className="btn btn--small"
            disabled={currentPage <= 1}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          >
            Previous
          </button>
          <span className="pagination__label">
            Page {currentPage} of {pageCount}
          </span>
          <button
            type="button"
            className="btn btn--small"
            disabled={currentPage >= pageCount}
            onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
          >
            Next
          </button>
        </div>
      </div>
    </section>
  );
}

function getRuleSearchText(rule: HpnPromoRule): string {
  return [
    getRuleDisplayName(rule),
    typeLabels[rule.type],
    getTriggerSummary(rule),
    getDiscountSummary(rule),
    getRuleIdentifiers(rule),
    rule.message,
    rule.id,
    rule.enabled ? "active" : "paused",
  ]
    .join(" ")
    .toLowerCase();
}

function getRuleIdentifiers(rule: HpnPromoRule): string {
  switch (rule.type) {
    case "pa7_cross_sell":
      return [rule.triggerProductId, ...rule.targetProductIds]
        .map(getGidTail)
        .join(" ");
    case "required_variants_free_variants":
      return [...rule.requiredVariantIds, ...rule.freeVariantIds]
        .map(getGidTail)
        .join(" ");
    case "required_product_with_free_variants":
      return [
        rule.triggerProductId,
        ...rule.requiredVariantIds,
        ...rule.freeVariantIds,
      ]
        .map(getGidTail)
        .join(" ");
    case "trigger_product_discounted_targets":
      return [rule.triggerProductId, ...rule.targets.map((t) => t.productId)]
        .map(getGidTail)
        .join(" ");
    case "loyalty_tier":
      return rule.targetProductIds.map(getGidTail).join(" ");
    case "subscription_bundle_group":
      return rule.targetProductIds.map(getGidTail).join(" ");
    case "one_time_purchase_discount":
      return rule.targetVariantIds.map(getGidTail).join(" ");
    case "swell_free_product":
    case "swell_cart_fixed_amount":
      return "";
    case "landing_quantity_tier_fixed_price":
      return rule.targetVariantIds.map(getGidTail).join(" ");
    case "landing_scoped_product_discount":
      return rule.targetProductIds.map(getGidTail).join(" ");
    case "landing_free_shipping":
      return "";
  }
}

function getRuleDisplayName(rule: HpnPromoRule): string {
  switch (rule.id) {
    case "pa7-cross-sell":
      return "PA7 Cross-Sell";
    case "nad3-single-planta-samples":
      return "NAD3 Single + Planta Samples";
    case "nad3-240-pouches":
      return "NAD3 240 + Pouches";
    default:
      return rule.id
        .split("-")
        .filter(Boolean)
        .map((part) => part[0]?.toUpperCase() + part.slice(1))
        .join(" ");
  }
}

function getTriggerSummary(rule: HpnPromoRule): string {
  switch (rule.type) {
    case "pa7_cross_sell":
      return `Product: ${getGidTail(rule.triggerProductId)}`;
    case "required_variants_free_variants":
      return `Requires ${rule.requiredVariantIds.length} variants`;
    case "required_product_with_free_variants":
      return `Product: ${getGidTail(rule.triggerProductId)} + ${
        rule.requiredVariantIds.length
      } variants`;
    case "trigger_product_discounted_targets":
      return `Product: ${getGidTail(rule.triggerProductId)}`;
    case "loyalty_tier":
      return `${rule.targetProductIds.length} target product(s)`;
    case "subscription_bundle_group":
      return `${rule.targetProductIds.length} product(s), max ${rule.maxUnitsTotal} units`;
    case "one_time_purchase_discount":
      return `${rule.targetVariantIds.length} variant(s), one-time purchase only`;
    case "swell_free_product":
      return "Line property: _swell_discount_type = product";
    case "swell_cart_fixed_amount":
      return "Line property: _swell_discount_type = cart_fixed_amount";
    case "landing_quantity_tier_fixed_price":
      return `Line property: ${rule.requiredLineAttributeKey} = ${rule.requiredLineAttributeValue}`;
    case "landing_scoped_product_discount":
      return `Line property: ${rule.requiredLineAttributeKey} = ${rule.requiredLineAttributeValue}`;
    case "landing_free_shipping":
      return `Line property: ${rule.requiredLineAttributeKey} = ${rule.requiredLineAttributeValue}`;
  }
}

function getTargetsCount(rule: HpnPromoRule): number {
  switch (rule.type) {
    case "pa7_cross_sell":
      return rule.targetProductIds.length;
    case "required_variants_free_variants":
      return rule.freeVariantIds.length;
    case "required_product_with_free_variants":
      return rule.freeVariantIds.length;
    case "trigger_product_discounted_targets":
      return rule.targets.length;
    case "loyalty_tier":
      return rule.targetProductIds.length;
    case "subscription_bundle_group":
      return rule.targetProductIds.length;
    case "one_time_purchase_discount":
      return rule.targetVariantIds.length;
    case "swell_free_product":
    case "swell_cart_fixed_amount":
      return 0;
    case "landing_quantity_tier_fixed_price":
      return rule.targetVariantIds.length;
    case "landing_scoped_product_discount":
      return rule.targetProductIds.length;
    case "landing_free_shipping":
      return 0;
  }
}

function getDiscountSummary(rule: HpnPromoRule): string {
  switch (rule.type) {
    case "pa7_cross_sell":
      return `${rule.discountPercentage}% Off`;
    case "required_variants_free_variants":
      return `${rule.discountPercentage}% off, ${rule.freeQuantityPerLine} unit/variant`;
    case "required_product_with_free_variants":
      return `${rule.discountPercentage}% off, up to ${rule.freeQuantityPerLine} unit`;
    case "trigger_product_discounted_targets":
      return `${rule.targets.length} target(s), per-product %`;
    case "loyalty_tier":
      return `${rule.tiers.length} tier(s)`;
    case "subscription_bundle_group":
      return `${rule.discountPercentage}% off, max ${rule.maxUnitsTotal} units`;
    case "one_time_purchase_discount":
      return `${rule.discountPercentage}% off`;
    case "swell_free_product":
      return "1 unit free";
    case "swell_cart_fixed_amount":
      return "Proportional fixed-amount";
    case "landing_quantity_tier_fixed_price":
      return `${rule.tiers.length} tier(s), fixed price/unit`;
    case "landing_scoped_product_discount":
      return `${rule.discountPercentage}% off`;
    case "landing_free_shipping":
      return "Free shipping";
  }
}
