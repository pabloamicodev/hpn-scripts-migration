import { useNavigate } from "react-router";
import type { SubscriptionCyclePricingPlan } from "~/lib/subscriptionCyclePricing";

interface SubscriptionCyclePricingTableProps {
  plans: SubscriptionCyclePricingPlan[];
  onDelete: (planId: string) => void;
}

function formatDiscount(discount: SubscriptionCyclePricingPlan["firstCycleDiscount"]) {
  if (discount.value === 0) return "Full price";
  return discount.type === "percentage"
    ? `${discount.value}% off`
    : `$${discount.value.toFixed(2)} off`;
}

function formatFrequency(plan: SubscriptionCyclePricingPlan) {
  const unit = plan.intervalUnit.toLowerCase();
  const every =
    plan.intervalCount === 1 ? `Every ${unit}` : `Every ${plan.intervalCount} ${unit}s`;
  return `${every} · ${plan.totalCycles} shipment${plan.totalCycles === 1 ? "" : "s"}`;
}

export function SubscriptionCyclePricingTable({
  plans,
  onDelete,
}: SubscriptionCyclePricingTableProps) {
  const navigate = useNavigate();

  if (plans.length === 0) {
    return (
      <section className="card empty-state">
        <h2>No subscription pricing plans yet</h2>
        <p>
          Create one to give a subscription a different price on its first
          shipment versus the rest (e.g. full price first, then $2 off from
          the 2nd shipment on).
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
            <th>Frequency</th>
            <th>1st shipment</th>
            <th>2nd shipment onward</th>
            <th>Products</th>
            <th aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {plans.map((plan) => (
            <tr key={plan.id}>
              <td>{plan.name}</td>
              <td>{formatFrequency(plan)}</td>
              <td>{formatDiscount(plan.firstCycleDiscount)}</td>
              <td>{formatDiscount(plan.recurringDiscount)}</td>
              <td>{plan.productIds.length}</td>
              <td>
                <div className="row-actions">
                  <button
                    type="button"
                    className="btn btn--small"
                    onClick={() => navigate(`/app/subscription-pricing/${encodeURIComponent(plan.id)}`)}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="btn btn--small btn--danger"
                    onClick={() => onDelete(plan.id)}
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
