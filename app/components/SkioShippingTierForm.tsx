import { useState } from "react";
import {
  skioShippingTierSchema,
  type SkioShippingTier,
  type CycleOverride,
} from "~/lib/skioShippingTiers";
import { ProductPicker, type ProductPickerSelection } from "./ProductPicker";
import { DevErrorBanner } from "./DevErrorBanner";
import type { ActionError } from "~/lib/actionError.server";

interface SkioShippingTierFormProps {
  defaultValues?: SkioShippingTier;
  productTitlesById?: Record<string, string>;
  submissionError: ActionError | null;
  isSubmitting: boolean;
  onSubmit: (tier: SkioShippingTier) => void;
  onCancel: () => void;
}

function getGidTail(gid: string) {
  return gid.split("/").pop() ?? gid;
}

interface OverrideRowValue {
  enabled: boolean;
  amount: number;
}

function toRowValue(amount: number | null): OverrideRowValue {
  return { enabled: amount !== null, amount: amount ?? 0 };
}

function fromRowValue(row: OverrideRowValue): number | null {
  return row.enabled ? row.amount : null;
}

function OverrideRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: OverrideRowValue;
  onChange: (next: OverrideRowValue) => void;
}) {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <span style={{ minWidth: 90 }}>{label}</span>
      <label className="checkbox-row" style={{ margin: 0 }}>
        <input
          type="checkbox"
          checked={value.enabled}
          onChange={(e) => onChange({ ...value, enabled: e.target.checked })}
        />
        Override
      </label>
      {value.enabled ? (
        <>
          <span>$</span>
          <input
            type="number"
            min={0}
            step="0.01"
            value={value.amount}
            onChange={(e) => onChange({ ...value, amount: Number(e.target.value) })}
            style={{ width: 100 }}
          />
        </>
      ) : (
        <span className="muted">Leave at normal Shopify rate</span>
      )}
    </div>
  );
}

export function SkioShippingTierForm({
  defaultValues,
  productTitlesById = {},
  submissionError,
  isSubmitting,
  onSubmit,
  onCancel,
}: SkioShippingTierFormProps) {
  const [id, setId] = useState(defaultValues?.id ?? "");
  const [name, setName] = useState(defaultValues?.name ?? "");
  const [subscriptionDurationMonths, setSubscriptionDurationMonths] = useState(
    defaultValues?.subscriptionDurationMonths ?? 1,
  );
  const [minSubtotal, setMinSubtotal] = useState(defaultValues?.minSubtotal ?? 0);
  const [hasMaxSubtotal, setHasMaxSubtotal] = useState(defaultValues?.maxSubtotal !== null);
  const [maxSubtotal, setMaxSubtotal] = useState(defaultValues?.maxSubtotal ?? 100);
  const [productVariantIds, setProductVariantIds] = useState<string[]>(
    defaultValues?.productVariantIds ?? [],
  );
  const [variantTitles, setVariantTitles] = useState<Record<string, string>>(productTitlesById);
  const [restrictToProducts, setRestrictToProducts] = useState(
    (defaultValues?.productVariantIds?.length ?? 0) > 0,
  );
  const [pickerOpen, setPickerOpen] = useState(false);

  const [cycleRows, setCycleRows] = useState<Array<{ cycle: number; row: OverrideRowValue }>>(
    (defaultValues?.cycleOverrides ?? [{ cycle: 1, override: { amount: null } }]).map((c: CycleOverride) => ({
      cycle: c.cycle,
      row: toRowValue(c.override.amount),
    })),
  );
  const [defaultRow, setDefaultRow] = useState<OverrideRowValue>(
    toRowValue(defaultValues?.defaultOverride.amount ?? 1.99),
  );

  const [schemaError, setSchemaError] = useState<string | null>(null);

  function addCycleRow() {
    const nextCycle = Math.max(0, ...cycleRows.map((r) => r.cycle)) + 1;
    setCycleRows((current) => [...current, { cycle: nextCycle, row: { enabled: true, amount: 0 } }]);
  }

  function removeCycleRow(index: number) {
    setCycleRows((current) => current.filter((_, i) => i !== index));
  }

  function updateCycleRow(index: number, patch: Partial<{ cycle: number; row: OverrideRowValue }>) {
    setCycleRows((current) => current.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  function handlePickerSelect(selection: ProductPickerSelection) {
    setProductVariantIds((current) =>
      current.includes(selection.variantId) ? current : [...current, selection.variantId],
    );
    setVariantTitles((current) => ({
      ...current,
      [selection.variantId]: `${selection.productTitle} — ${selection.variantTitle}`,
    }));
    setPickerOpen(false);
  }

  function removeVariant(variantId: string) {
    setProductVariantIds((current) => current.filter((id) => id !== variantId));
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSchemaError(null);

    const candidate: SkioShippingTier = {
      id,
      name,
      subscriptionDurationMonths: Number(subscriptionDurationMonths),
      minSubtotal: Number(minSubtotal),
      maxSubtotal: hasMaxSubtotal ? Number(maxSubtotal) : null,
      productVariantIds: restrictToProducts ? productVariantIds : null,
      cycleOverrides: cycleRows.map(({ cycle, row }) => ({ cycle, override: { amount: fromRowValue(row) } })),
      defaultOverride: { amount: fromRowValue(defaultRow) },
    };

    const parsed = skioShippingTierSchema.safeParse(candidate);
    if (!parsed.success) {
      setSchemaError(
        parsed.error.issues.map((issue) => `${issue.path.join(".") || "field"}: ${issue.message}`).join("\n"),
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
            {defaultValues ? "Edit Skio shipping tier" : "New Skio shipping tier"}
          </h1>
          <p className="page-subtitle">
            Sets the shipping fee Skio charges on specific renewal cycles for
            subscriptions matching this tier — via Skio&apos;s own API
            (setDeliveryPriceOverride), since Shopify&apos;s own discount
            Functions can&apos;t produce a graduated per-cycle shipping fee on
            subscription renewals.
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
        <h2 className="form-section__title">Tier details</h2>

        <div className="form-group">
          <label htmlFor="tier-id" className="form-label">
            Tier ID
          </label>
          <input
            id="tier-id"
            type="text"
            value={id}
            onChange={(e) => setId(e.target.value)}
            placeholder="e.g. two-month-under-50"
            disabled={Boolean(defaultValues)}
            required
          />
          <p className="field-hint">Lowercase letters, numbers, and hyphens. Can&apos;t be changed after creating the tier.</p>
        </div>

        <div className="form-group">
          <label htmlFor="tier-name" className="form-label">
            Name
          </label>
          <input
            id="tier-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. 2-month plan, under $50"
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="tier-duration" className="form-label">
            Plan duration (months)
          </label>
          <input
            id="tier-duration"
            type="number"
            min={1}
            value={subscriptionDurationMonths}
            onChange={(e) => setSubscriptionDurationMonths(Number(e.target.value))}
            style={{ width: 100 }}
            required
          />
          <p className="field-hint">
            Matched against Skio&apos;s billing interval, rounded to the nearest month.
          </p>
        </div>

        <div className="form-group">
          <span className="form-label">Subtotal range</span>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span>From $</span>
            <input
              type="number"
              min={0}
              step="0.01"
              value={minSubtotal}
              onChange={(e) => setMinSubtotal(Number(e.target.value))}
              style={{ width: 100 }}
            />
            <label className="checkbox-row" style={{ margin: 0 }}>
              <input
                type="checkbox"
                checked={hasMaxSubtotal}
                onChange={(e) => setHasMaxSubtotal(e.target.checked)}
              />
              Up to $
            </label>
            {hasMaxSubtotal && (
              <input
                type="number"
                min={0}
                step="0.01"
                value={maxSubtotal}
                onChange={(e) => setMaxSubtotal(Number(e.target.value))}
                style={{ width: 100 }}
              />
            )}
          </div>
          <p className="field-hint">Min is inclusive, max is exclusive. Leave "Up to" unchecked for no upper bound.</p>
        </div>
      </section>

      <section className="form-section">
        <h2 className="form-section__title">Products</h2>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={restrictToProducts}
            onChange={(e) => setRestrictToProducts(e.target.checked)}
          />
          Restrict this tier to specific products
        </label>

        {restrictToProducts && (
          <div className="form-group">
            <button type="button" onClick={() => setPickerOpen(true)} className="product-picker-trigger">
              <span className="product-picker-trigger__icon">+</span>
              <span>
                <strong>Add product variant</strong>
                <span>This tier only applies when the subscription includes one of these.</span>
              </span>
            </button>

            {productVariantIds.length > 0 && (
              <div className="product-id-list">
                {productVariantIds.map((variantId) => (
                  <div key={variantId} className="product-id-chip">
                    <span>{variantTitles[variantId] ?? getGidTail(variantId)}</span>
                    <button
                      type="button"
                      onClick={() => removeVariant(variantId)}
                      aria-label={`Remove ${variantTitles[variantId] ?? variantId}`}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      <section className="form-section">
        <h2 className="form-section__title">Shipping per cycle</h2>
        <p className="field-hint">
          Explicit overrides for specific cycle numbers (1 = the first shipment). Any cycle not listed below uses the default.
        </p>

        {cycleRows.map((entry, index) => (
          <div key={index} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
            <span>Cycle</span>
            <input
              type="number"
              min={1}
              value={entry.cycle}
              onChange={(e) => updateCycleRow(index, { cycle: Number(e.target.value) })}
              style={{ width: 70 }}
            />
            <OverrideRow
              label=""
              value={entry.row}
              onChange={(row) => updateCycleRow(index, { row })}
            />
            <button type="button" className="btn btn--small" onClick={() => removeCycleRow(index)}>
              Remove
            </button>
          </div>
        ))}

        <button type="button" className="btn btn--small" onClick={addCycleRow}>
          + Add cycle override
        </button>

        <div className="form-group" style={{ marginTop: 16 }}>
          <OverrideRow label="Default (other cycles)" value={defaultRow} onChange={setDefaultRow} />
        </div>
      </section>

      <div className="btn-row">
        <button type="submit" disabled={isSubmitting} className="btn btn--primary">
          {isSubmitting ? "Saving…" : "Save Tier"}
        </button>
        <button type="button" onClick={onCancel} className="btn">
          Cancel
        </button>
      </div>

      {pickerOpen && (
        <ProductPicker selectionMode="variant" onSelect={handlePickerSelect} onClose={() => setPickerOpen(false)} />
      )}
    </form>
  );
}
