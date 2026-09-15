import { useState } from "react";
import {
  subscriptionCyclePricingPlanInputSchema,
  type SellingPlanInterval,
  type SubscriptionCyclePricingPlan,
  type SubscriptionCyclePricingPlanInput,
} from "~/lib/subscriptionCyclePricing";
import { ProductPicker, type ProductPickerSelection } from "./ProductPicker";
import { DevErrorBanner } from "./DevErrorBanner";
import type { ActionError } from "~/lib/actionError.server";

interface SubscriptionCyclePricingFormProps {
  defaultValues?: SubscriptionCyclePricingPlan;
  submissionError: ActionError | null;
  isSubmitting: boolean;
  onSubmit: (input: SubscriptionCyclePricingPlanInput) => void;
  onCancel: () => void;
}

const INTERVAL_OPTIONS: { value: SellingPlanInterval; label: string }[] = [
  { value: "DAY", label: "Day(s)" },
  { value: "WEEK", label: "Week(s)" },
  { value: "MONTH", label: "Month(s)" },
  { value: "YEAR", label: "Year(s)" },
];

function getGidTail(gid: string) {
  return gid.split("/").pop() ?? gid;
}

export function SubscriptionCyclePricingForm({
  defaultValues,
  submissionError,
  isSubmitting,
  onSubmit,
  onCancel,
}: SubscriptionCyclePricingFormProps) {
  const [name, setName] = useState(defaultValues?.name ?? "");
  const [intervalUnit, setIntervalUnit] = useState<SellingPlanInterval>(
    defaultValues?.intervalUnit ?? "MONTH",
  );
  const [intervalCount, setIntervalCount] = useState(
    defaultValues?.intervalCount ?? 1,
  );
  const [totalCycles, setTotalCycles] = useState(
    defaultValues?.totalCycles ?? 3,
  );
  const [firstCycleType, setFirstCycleType] = useState(
    defaultValues?.firstCycleDiscount.type ?? "percentage",
  );
  const [firstCycleValue, setFirstCycleValue] = useState(
    defaultValues?.firstCycleDiscount.value ?? 0,
  );
  const [recurringType, setRecurringType] = useState(
    defaultValues?.recurringDiscount.type ?? "fixed_amount",
  );
  const [recurringValue, setRecurringValue] = useState(
    defaultValues?.recurringDiscount.value ?? 2,
  );
  const [productIds, setProductIds] = useState<string[]>(
    defaultValues?.productIds ?? [],
  );
  const [productTitlesById, setProductTitlesById] = useState<Record<string, string>>(
    defaultValues?.productTitlesById ?? {},
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  const [schemaError, setSchemaError] = useState<string | null>(null);

  function handlePickerSelect(selection: ProductPickerSelection) {
    setProductIds((current) =>
      current.includes(selection.productId)
        ? current
        : [...current, selection.productId],
    );
    setProductTitlesById((current) => ({
      ...current,
      [selection.productId]: selection.productTitle,
    }));
    setPickerOpen(false);
  }

  function removeProduct(productId: string) {
    setProductIds((current) => current.filter((id) => id !== productId));
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSchemaError(null);

    const candidate: SubscriptionCyclePricingPlanInput = {
      name,
      intervalUnit,
      intervalCount: Number(intervalCount),
      totalCycles: Number(totalCycles),
      firstCycleDiscount: { type: firstCycleType, value: Number(firstCycleValue) },
      recurringDiscount: { type: recurringType, value: Number(recurringValue) },
      productIds,
    };

    const parsed = subscriptionCyclePricingPlanInputSchema.safeParse(candidate);
    if (!parsed.success) {
      setSchemaError(
        parsed.error.issues
          .map((issue) => `${issue.path.join(".") || "field"}: ${issue.message}`)
          .join("\n"),
      );
      return;
    }

    onSubmit(parsed.data);
  }

  return (
    <form onSubmit={handleSubmit} className="promo-rule-form">
      <header className="page-header">
        <div>
          <h1 className="page-title">
            {defaultValues ? "Edit subscription pricing plan" : "New subscription pricing plan"}
          </h1>
          <p className="page-subtitle">
            Configure a Selling Plan whose price changes after the first
            shipment — e.g. full price on delivery 1, then a discount from
            delivery 2 onward. This is a native Shopify Selling Plan, not a
            cart discount rule: it applies to every order placed on the
            products below, and pricing is frozen onto the subscription
            contract at signup — editing an existing plan here only affects
            future signups, not contracts already in progress.
          </p>
        </div>
      </header>

      {schemaError && (
        <section className="alert alert--critical" role="alert">
          <strong>Validation Error</strong>
          <pre className="alert__pre">{schemaError}</pre>
        </section>
      )}

      <DevErrorBanner error={submissionError} />

      <section className="form-section">
        <h2 className="form-section__title">Plan details</h2>

        <div className="form-group">
          <label htmlFor="name" className="form-label">
            Name
          </label>
          <input
            id="name"
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. 3-month subscription"
            required
          />
          <p className="field-hint">
            Shown to customers as the plan option at checkout.
          </p>
        </div>

        <div className="form-group">
          <span className="form-label">Delivery frequency</span>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span>Every</span>
            <input
              type="number"
              min={1}
              value={intervalCount}
              onChange={(event) => setIntervalCount(Number(event.target.value))}
              style={{ width: 80 }}
              required
            />
            <select
              value={intervalUnit}
              onChange={(event) =>
                setIntervalUnit(event.target.value as SellingPlanInterval)
              }
            >
              {INTERVAL_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="form-group">
          <label htmlFor="totalCycles" className="form-label">
            Total number of shipments
          </label>
          <input
            id="totalCycles"
            type="number"
            min={1}
            value={totalCycles}
            onChange={(event) => setTotalCycles(Number(event.target.value))}
            style={{ width: 80 }}
            required
          />
          <p className="field-hint">
            e.g. 3 for a 3-month plan billed monthly. The subscription ends
            after this many shipments.
          </p>
        </div>
      </section>

      <section className="form-section">
        <h2 className="form-section__title">1st shipment price</h2>
        <div className="form-group">
          <span className="form-label">Discount</span>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <select
              value={firstCycleType}
              onChange={(event) =>
                setFirstCycleType(event.target.value as "percentage" | "fixed_amount")
              }
            >
              <option value="percentage">% off</option>
              <option value="fixed_amount">$ off (per unit)</option>
            </select>
            <input
              type="number"
              min={0}
              step="0.01"
              value={firstCycleValue}
              onChange={(event) => setFirstCycleValue(Number(event.target.value))}
              style={{ width: 100 }}
            />
          </div>
          <p className="field-hint">
            Leave at 0 for full price on the first shipment.
          </p>
        </div>
      </section>

      <section className="form-section">
        <h2 className="form-section__title">2nd shipment onward</h2>
        <div className="form-group">
          <span className="form-label">Discount</span>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <select
              value={recurringType}
              onChange={(event) =>
                setRecurringType(event.target.value as "percentage" | "fixed_amount")
              }
            >
              <option value="percentage">% off</option>
              <option value="fixed_amount">$ off (per unit)</option>
            </select>
            <input
              type="number"
              min={0}
              step="0.01"
              value={recurringValue}
              onChange={(event) => setRecurringValue(Number(event.target.value))}
              style={{ width: 100 }}
            />
          </div>
          <p className="field-hint">
            Applies to every shipment from the 2nd through the last (shipment{" "}
            {totalCycles || "N"}).
          </p>
        </div>
      </section>

      <section className="form-section">
        <h2 className="form-section__title">Products</h2>
        <div className="form-group">
          <span className="form-label">Attached products</span>
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="product-picker-trigger"
          >
            <span className="product-picker-trigger__icon">+</span>
            <span>
              <strong>Add product</strong>
              <span>This plan will be offered on the products you add here.</span>
            </span>
          </button>

          {productIds.length > 0 && (
            <div className="product-id-list">
              {productIds.map((productId) => (
                <div key={productId} className="product-id-chip">
                  <span>{productTitlesById[productId] ?? getGidTail(productId)}</span>
                  <button
                    type="button"
                    onClick={() => removeProduct(productId)}
                    aria-label={`Remove ${productTitlesById[productId] ?? productId}`}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <div className="btn-row">
        <button type="submit" disabled={isSubmitting} className="btn btn--primary">
          {isSubmitting ? "Saving…" : "Save Plan"}
        </button>

        <button type="button" onClick={onCancel} className="btn">
          Cancel
        </button>
      </div>

      {pickerOpen && (
        <ProductPicker
          selectionMode="product"
          onSelect={handlePickerSelect}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </form>
  );
}
