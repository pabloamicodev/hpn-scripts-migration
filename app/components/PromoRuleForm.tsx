import { useState } from "react";
import { useForm } from "react-hook-form";

import {
  hpnPromoRuleSchema,
  type HpnPromoRule,
} from "../lib/validations";

type PromoRuleType = HpnPromoRule["type"];

interface PromoRuleFormProps {
  defaultValues?: HpnPromoRule;
  onSubmit: (data: HpnPromoRule) => void;
  onCancel: () => void;
}

interface PromoRuleFormValues {
  id: string;
  type: PromoRuleType;
  enabled: boolean;
  message: string;
  triggerProductId?: string;
  targetProductIds?: string[];
  targetLineQuantityEquals?: number;
  discountPercentage?: number;
  requiredVariantIds?: string[];
  freeVariantIds?: string[];
  freeQuantityPerLine?: number | null;
}

const DEFAULT_RULES: Record<PromoRuleType, PromoRuleFormValues> = {
  pa7_cross_sell: {
    id: "pa7-cross-sell",
    type: "pa7_cross_sell",
    enabled: true,
    triggerProductId: "gid://shopify/Product/1313973239892",
    targetProductIds: [
      "gid://shopify/Product/1319321763924",
      "gid://shopify/Product/1313557741652",
    ],
    targetLineQuantityEquals: 1,
    discountPercentage: 10,
    message: "Congratulations! 10% Off (when purchased with PA7)",
  },

  required_variants_free_variants: {
    id: "nad3-single-planta-samples",
    type: "required_variants_free_variants",
    enabled: true,
    requiredVariantIds: [
      "gid://shopify/ProductVariant/21174522675284",
      "gid://shopify/ProductVariant/40608348438665",
      "gid://shopify/ProductVariant/40608348373129",
    ],
    freeVariantIds: [
      "gid://shopify/ProductVariant/40608348438665",
      "gid://shopify/ProductVariant/40608348373129",
    ],
    freeQuantityPerLine: null,
    message: "Free Planta Samples - NAD3 Subscription",
  },

  required_product_with_free_variants: {
    id: "nad3-240-pouches",
    type: "required_product_with_free_variants",
    enabled: true,
    triggerProductId: "gid://shopify/Product/6784435060873",
    requiredVariantIds: [
      "gid://shopify/ProductVariant/44633124995209",
      "gid://shopify/ProductVariant/44633124864137",
    ],
    freeVariantIds: [
      "gid://shopify/ProductVariant/44633124995209",
      "gid://shopify/ProductVariant/44633124864137",
    ],
    freeQuantityPerLine: 1,
    message: "Free 1-Week Pouches - NAD3 240 Bundle",
  },
};

function normalizeDefaultValues(defaultValues?: HpnPromoRule): PromoRuleFormValues {
  if (!defaultValues) {
    return DEFAULT_RULES.pa7_cross_sell;
  }

  return {
    ...defaultValues,
  };
}

function toMultilineValue(values?: string[]) {
  return values?.join("\n") ?? "";
}

function fromMultilineValue(value: string) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function buildRulePayload(values: PromoRuleFormValues): unknown {
  if (values.type === "pa7_cross_sell") {
    return {
      id: "pa7-cross-sell",
      type: "pa7_cross_sell",
      enabled: values.enabled,
      triggerProductId: values.triggerProductId,
      targetProductIds: values.targetProductIds ?? [],
      targetLineQuantityEquals: values.targetLineQuantityEquals,
      discountPercentage: values.discountPercentage,
      message: values.message,
    };
  }

  if (values.type === "required_variants_free_variants") {
    return {
      id: "nad3-single-planta-samples",
      type: "required_variants_free_variants",
      enabled: values.enabled,
      requiredVariantIds: values.requiredVariantIds ?? [],
      freeVariantIds: values.freeVariantIds ?? [],
      freeQuantityPerLine: values.freeQuantityPerLine ?? null,
      message: values.message,
    };
  }

  return {
    id: "nad3-240-pouches",
    type: "required_product_with_free_variants",
    enabled: values.enabled,
    triggerProductId: values.triggerProductId,
    requiredVariantIds: values.requiredVariantIds ?? [],
    freeVariantIds: values.freeVariantIds ?? [],
    freeQuantityPerLine: 1,
    message: values.message,
  };
}

function formatZodError(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "issues" in error &&
    Array.isArray(error.issues)
  ) {
    return error.issues
      .map((issue) => {
        const path = Array.isArray(issue.path)
          ? issue.path.join(".")
          : "field";

        return `${path}: ${issue.message}`;
      })
      .join("\n");
  }

  return "Invalid promo rule configuration.";
}

export function PromoRuleForm({
  defaultValues,
  onSubmit,
  onCancel,
}: PromoRuleFormProps) {
  const [schemaError, setSchemaError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    reset,
    setValue,
    formState: { isSubmitting },
  } = useForm<PromoRuleFormValues>({
    defaultValues: normalizeDefaultValues(defaultValues),
  });

  const ruleType = watch("type");
  const targetProductIds = watch("targetProductIds");
  const requiredVariantIds = watch("requiredVariantIds");
  const freeVariantIds = watch("freeVariantIds");
  const freeQuantityPerLine = watch("freeQuantityPerLine");

  function handleRuleTypeChange(nextType: PromoRuleType) {
    reset(DEFAULT_RULES[nextType]);
    setSchemaError(null);
  }

  function handleValidSubmit(values: PromoRuleFormValues) {
    setSchemaError(null);

    const payload = buildRulePayload(values);
    const parsedRule = hpnPromoRuleSchema.safeParse(payload);

    if (!parsedRule.success) {
      setSchemaError(formatZodError(parsedRule.error));
      return;
    }

    onSubmit(parsedRule.data);
  }

  return (
    <form
      onSubmit={handleSubmit(handleValidSubmit)}
      className="promo-rule-form"
    >
      <header className="page-header">
        <div>
          <h1 className="page-title">
            {defaultValues ? "Edit promo rule" : "Create promo rule"}
          </h1>
          <p className="page-subtitle">
            Define trigger products, eligible variants, and customer-facing
            discount messaging.
          </p>
        </div>
      </header>

      {schemaError && (
        <section className="alert alert--critical">
          <strong>Validation error</strong>

          <pre style={{ whiteSpace: "pre-wrap", margin: "8px 0 0" }}>
            {schemaError}
          </pre>
        </section>
      )}

      <section className="form-section">
      <h2 className="form-section__title">Rule details</h2>

      <div className="form-group">
        <label
          htmlFor="type"
          className="form-label"
        >
          Rule Type
        </label>

        <select
          id="type"
          value={ruleType}
          disabled={Boolean(defaultValues)}
          onChange={(event) =>
            handleRuleTypeChange(event.target.value as PromoRuleType)
          }
        >
          <option value="pa7_cross_sell">
            PA7 Cross-Sell - 10% off target products
          </option>

          <option value="required_variants_free_variants">
            Required Variants → Free Variants
          </option>

          <option value="required_product_with_free_variants">
            Required Product + Variants → Free Variants
          </option>
        </select>
      </div>

      <div className="form-group">
        <label className="checkbox-row">
          <input type="checkbox" {...register("enabled")} />
          <span>Enabled</span>
        </label>
      </div>

      <div className="form-group">
        <label
          htmlFor="message"
          className="form-label"
        >
          Discount Message
        </label>

        <input
          type="text"
          id="message"
          {...register("message")}
          placeholder="e.g. Congratulations! 10% Off"
        />
      </div>
      </section>

      {ruleType === "pa7_cross_sell" && (
        <section className="form-section">
          <h2 className="form-section__title">Cross-sell configuration</h2>
          <div className="form-group">
            <label
              htmlFor="triggerProductId"
              className="form-label"
            >
              Trigger Product GID
            </label>

            <input
              type="text"
              id="triggerProductId"
              {...register("triggerProductId")}
              placeholder="gid://shopify/Product/..."
            />
          </div>

          <div className="form-group">
            <label
              htmlFor="targetProductIds"
              className="form-label"
            >
              Target Product GIDs one per line
            </label>

            <textarea
              id="targetProductIds"
              value={toMultilineValue(targetProductIds)}
              onChange={(event) =>
                setValue(
                  "targetProductIds",
                  fromMultilineValue(event.target.value),
                  {
                    shouldDirty: true,
                    shouldValidate: false,
                  },
                )
              }
              rows={3}
              placeholder="gid://shopify/Product/..."
            />
          </div>

          <div className="form-group">
            <label
              htmlFor="targetLineQuantityEquals"
              className="form-label"
            >
              Target Line Quantity Must Equal
            </label>

            <input
              type="number"
              id="targetLineQuantityEquals"
              min={1}
              {...register("targetLineQuantityEquals", {
                valueAsNumber: true,
              })}
              className="number-field"
            />
          </div>

          <div className="form-group">
            <label
              htmlFor="discountPercentage"
              className="form-label"
            >
              Discount Percentage
            </label>

            <input
              type="number"
              id="discountPercentage"
              min={1}
              max={100}
              {...register("discountPercentage", {
                valueAsNumber: true,
              })}
              className="number-field"
            />
          </div>
        </section>
      )}

      {ruleType === "required_variants_free_variants" && (
        <section className="form-section">
          <h2 className="form-section__title">Variant bundle configuration</h2>
          <div className="form-group">
            <label
              htmlFor="requiredVariantIds"
              className="form-label"
            >
              Required Variant GIDs one per line
            </label>

            <textarea
              id="requiredVariantIds"
              value={toMultilineValue(requiredVariantIds)}
              onChange={(event) =>
                setValue(
                  "requiredVariantIds",
                  fromMultilineValue(event.target.value),
                  {
                    shouldDirty: true,
                    shouldValidate: false,
                  },
                )
              }
              rows={3}
              placeholder="gid://shopify/ProductVariant/..."
            />
          </div>

          <div className="form-group">
            <label
              htmlFor="freeVariantIds"
              className="form-label"
            >
              Free Variant GIDs one per line
            </label>

            <textarea
              id="freeVariantIds"
              value={toMultilineValue(freeVariantIds)}
              onChange={(event) =>
                setValue(
                  "freeVariantIds",
                  fromMultilineValue(event.target.value),
                  {
                    shouldDirty: true,
                    shouldValidate: false,
                  },
                )
              }
              rows={3}
              placeholder="gid://shopify/ProductVariant/..."
            />
          </div>

          <div className="form-group">
            <label
              htmlFor="freeQuantityPerLine"
              className="form-label"
            >
              Free Quantity Per Line leave empty for all
            </label>

            <input
              type="number"
              id="freeQuantityPerLine"
              min={1}
              value={freeQuantityPerLine ?? ""}
              onChange={(event) => {
                const nextValue = event.target.value.trim();

                setValue(
                  "freeQuantityPerLine",
                  nextValue ? Number.parseInt(nextValue, 10) : null,
                  {
                    shouldDirty: true,
                    shouldValidate: false,
                  },
                );
              }}
              placeholder="All"
              className="number-field"
            />
          </div>
        </section>
      )}

      {ruleType === "required_product_with_free_variants" && (
        <section className="form-section">
          <h2 className="form-section__title">Product bundle configuration</h2>
          <div className="form-group">
            <label
              htmlFor="requiredProductTriggerId"
              className="form-label"
            >
              Trigger Product GID
            </label>

            <input
              type="text"
              id="requiredProductTriggerId"
              {...register("triggerProductId")}
              placeholder="gid://shopify/Product/..."
            />
          </div>

          <div className="form-group">
            <label
              htmlFor="requiredProductVariantIds"
              className="form-label"
            >
              Required Variant GIDs one per line
            </label>

            <textarea
              id="requiredProductVariantIds"
              value={toMultilineValue(requiredVariantIds)}
              onChange={(event) =>
                setValue(
                  "requiredVariantIds",
                  fromMultilineValue(event.target.value),
                  {
                    shouldDirty: true,
                    shouldValidate: false,
                  },
                )
              }
              rows={3}
              placeholder="gid://shopify/ProductVariant/..."
            />
          </div>

          <div className="form-group">
            <label
              htmlFor="requiredProductFreeVariantIds"
              className="form-label"
            >
              Free Variant GIDs one per line
            </label>

            <textarea
              id="requiredProductFreeVariantIds"
              value={toMultilineValue(freeVariantIds)}
              onChange={(event) =>
                setValue(
                  "freeVariantIds",
                  fromMultilineValue(event.target.value),
                  {
                    shouldDirty: true,
                    shouldValidate: false,
                  },
                )
              }
              rows={3}
              placeholder="gid://shopify/ProductVariant/..."
            />
          </div>

          <div className="alert alert--info">
            <strong>Free quantity per line:</strong> 1
          </div>
        </section>
      )}

      <div className="btn-row">
        <button
          type="submit"
          disabled={isSubmitting}
          className="btn btn--primary"
        >
          {isSubmitting ? "Saving..." : "Save Rule"}
        </button>

        <button
          type="button"
          onClick={onCancel}
          className="btn"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
