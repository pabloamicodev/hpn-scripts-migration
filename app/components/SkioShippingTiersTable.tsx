import { useNavigate } from "react-router";
import type { SkioShippingTier } from "~/lib/skioShippingTiers";

interface SkioShippingTiersTableProps {
  tiers: SkioShippingTier[];
  onDelete: (tierId: string) => void;
}

function formatOverride(amount: number | null) {
  if (amount === null) return "Normal rate";
  return amount === 0 ? "Free" : `$${amount.toFixed(2)}`;
}

function formatCycles(tier: SkioShippingTier) {
  const explicit = [...tier.cycleOverrides]
    .sort((a, b) => a.cycle - b.cycle)
    .map((c) => `Cycle ${c.cycle}: ${formatOverride(c.override.amount)}`);
  return [...explicit, `Other: ${formatOverride(tier.defaultOverride.amount)}`].join(" · ");
}

function formatSubtotalRange(tier: SkioShippingTier) {
  const max = tier.maxSubtotal === null ? "+" : `–$${tier.maxSubtotal.toFixed(0)}`;
  return `$${tier.minSubtotal.toFixed(0)}${max}`;
}

export function SkioShippingTiersTable({ tiers, onDelete }: SkioShippingTiersTableProps) {
  const navigate = useNavigate();

  if (tiers.length === 0) {
    return (
      <section className="card empty-state">
        <h2>No Skio shipping tiers yet</h2>
        <p>
          Create one to set a specific shipping fee on a specific renewal
          cycle for Skio-managed subscriptions (e.g. free on the 1st shipment,
          $1.99 from the 2nd onward).
        </p>
      </section>
    );
  }

  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Duration</th>
            <th>Subtotal</th>
            <th>Products</th>
            <th>Cycles</th>
            <th aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {tiers.map((tier) => (
            <tr key={tier.id}>
              <td>{tier.name}</td>
              <td>{tier.subscriptionDurationMonths} mo</td>
              <td>{formatSubtotalRange(tier)}</td>
              <td>{tier.productVariantIds ? `${tier.productVariantIds.length} variant(s)` : "Any"}</td>
              <td>{formatCycles(tier)}</td>
              <td>
                <div className="row-actions">
                  <button
                    type="button"
                    className="btn btn--small"
                    onClick={() => navigate(`/app/skio-shipping-tiers/${encodeURIComponent(tier.id)}`)}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="btn btn--small btn--danger"
                    onClick={() => onDelete(tier.id)}
                  >
                    Delete
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
