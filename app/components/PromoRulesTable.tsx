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
};

function getGidTail(gid: string) {
  return gid.split("/").pop() ?? gid;
}

export function PromoRulesTable({
  rules,
  onPause,
  onResume,
  onDelete,
}: PromoRulesTableProps) {
  const navigate = useNavigate();

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
          Create Rule
        </button>
      </section>
    );
  }

  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Status</th>
            <th>Trigger</th>
            <th>Targets</th>
            <th>Discount</th>
            <th>Message</th>
            <th>Actions</th>
          </tr>
        </thead>

        <tbody>
          {rules.map((rule) => {
            const displayName = getRuleDisplayName(rule);
            const triggerSummary = getTriggerSummary(rule);

            return (
              <tr
                key={rule.id}
                style={{
                  opacity: rule.enabled ? 1 : 0.55,
                }}
              >
                <td className="cell-strong" style={{ whiteSpace: "nowrap" }}>
                  {displayName}
                </td>

                <td>
                  {typeLabels[rule.type] ?? "Unknown"}
                </td>

                <td>
                  <StatusBadge status={rule.enabled ? "active" : "paused"} />
                </td>

                <td
                  title={triggerSummary}
                  className="cell-muted truncate"
                >
                  {triggerSummary}
                </td>

                <td className="cell-muted" style={{ whiteSpace: "nowrap" }}>
                  {getTargetsCount(rule)} items
                </td>

                <td className="cell-strong" style={{ whiteSpace: "nowrap" }}>
                  {getDiscountSummary(rule)}
                </td>

                <td
                  title={rule.message}
                  className="cell-muted truncate"
                >
                  {rule.message}
                </td>

                <td style={{ whiteSpace: "nowrap" }}>
                  <button
                    type="button"
                    onClick={() => navigate(`/app/promos/${rule.id}`)}
                    className="btn btn--small"
                    aria-label={`Edit ${displayName}`}
                  >
                    Edit
                  </button>

                  {rule.enabled ? (
                    <button
                      type="button"
                      onClick={() => onPause(rule.id)}
                      className="btn btn--small btn--warning"
                      aria-label={`Pause ${displayName}`}
                      style={{ marginLeft: "4px" }}
                    >
                      Pause
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onResume(rule.id)}
                      className="btn btn--small btn--success"
                      aria-label={`Resume ${displayName}`}
                      style={{ marginLeft: "4px" }}
                    >
                      Resume
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => navigate(`/app/promos/${rule.id}/test`)}
                    className="btn btn--small"
                    aria-label={`Test ${displayName}`}
                    style={{ marginLeft: "4px" }}
                  >
                    Test
                  </button>

                  <button
                    type="button"
                    onClick={() => onDelete(rule.id)}
                    className="btn btn--small btn--danger"
                    aria-label={`Delete ${displayName}`}
                    style={{ marginLeft: "4px" }}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
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
      return "Unknown rule";
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

    default:
      return "Unknown trigger";
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

    default:
      return 0;
  }
}

function getDiscountSummary(rule: HpnPromoRule): string {
  switch (rule.type) {
    case "pa7_cross_sell":
      return `${rule.discountPercentage}% Off`;

    case "required_variants_free_variants":
      return rule.freeQuantityPerLine
        ? `Free up to ${rule.freeQuantityPerLine} unit`
        : "Free";

    case "required_product_with_free_variants":
      return `Free up to ${rule.freeQuantityPerLine ?? 1} unit`;

    default:
      return "Unknown discount";
  }
}
