import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";

import {
  hpnPromoRuleSchema,
  type HpnPromoRule,
} from "../lib/validations";
import {
  ProductPicker,
  type ProductPickerSelection,
} from "./ProductPicker";

type PromoRuleType = HpnPromoRule["type"];

interface SelectedProductMeta {
  id?: string;
  productId: string;
  productTitle: string;
  productHandle: string;
  vendor?: string | null;
  variantId?: string;
  variantTitle?: string;
  sku?: string | null;
  price?: string;
  imageUrl?: string;
  imageAlt?: string | null;
}

interface PromoRuleFormProps {
  defaultValues?: HpnPromoRule;
  submissionError?: string | null;
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

function getGidTail(gid: string) {
  return gid.split("/").pop() ?? gid;
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
  submissionError,
  onSubmit,
  onCancel,
}: PromoRuleFormProps) {
  const [schemaError, setSchemaError] = useState<string | null>(null);
  const [productPickerMode, setProductPickerMode] = useState<
    | "crossSellTriggerProduct"
    | "crossSellTargetProduct"
    | "requiredVariant"
    | "freeVariant"
    | "bundleTriggerProduct"
    | "bundleRequiredVariant"
    | "bundleFreeVariant"
    | null
  >(null);
  const [selectionMetaById, setSelectionMetaById] = useState<
    Record<string, SelectedProductMeta>
  >({});

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
  const triggerProductId = watch("triggerProductId");
  const targetProductIds = watch("targetProductIds");
  const requiredVariantIds = watch("requiredVariantIds");
  const freeVariantIds = watch("freeVariantIds");
  const freeQuantityPerLine = watch("freeQuantityPerLine");
  const selectedIds = useMemo(() => {
    return Array.from(
      new Set(
        [
          triggerProductId,
          ...(targetProductIds ?? []),
          ...(requiredVariantIds ?? []),
          ...(freeVariantIds ?? []),
        ].filter((id): id is string => Boolean(id)),
      ),
    );
  }, [freeVariantIds, requiredVariantIds, targetProductIds, triggerProductId]);
  const selectedIdsKey = selectedIds.join("|");

  useEffect(() => {
    const idsToLoad = selectedIds.filter((id) => !selectionMetaById[id]);

    if (idsToLoad.length === 0) return;

    const controller = new AbortController();

    async function loadSelectionMeta() {
      try {
        const response = await fetch(
          `/app/api/products?ids=${encodeURIComponent(idsToLoad.join(","))}`,
          { signal: controller.signal },
        );
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data?.error || "Product lookup failed.");
        }

        const nextMeta = (data.selections ?? []).reduce(
          (
            acc: Record<string, SelectedProductMeta>,
            selection: SelectedProductMeta,
          ) => {
            if (selection.id) {
              acc[selection.id] = selection;
            }

            return acc;
          },
          {},
        );

        if (Object.keys(nextMeta).length > 0) {
          setSelectionMetaById((current) => ({
            ...current,
            ...nextMeta,
          }));
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }

    loadSelectionMeta();

    return () => {
      controller.abort();
    };
  }, [selectedIdsKey, selectionMetaById, selectedIds]);

  function handleRuleTypeChange(nextType: PromoRuleType) {
    reset(DEFAULT_RULES[nextType]);
    setSelectionMetaById({});
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

  function handlePickerSelect(selection: ProductPickerSelection) {
    const selectedProductMeta: SelectedProductMeta = {
      productId: selection.productId,
      productTitle: selection.productTitle,
      productHandle: selection.productHandle,
      vendor: selection.vendor,
      variantId: selection.variantId,
      variantTitle: selection.variantTitle,
      sku: selection.sku,
      price: selection.price,
      imageUrl: selection.imageUrl,
      imageAlt: selection.imageAlt,
    };

    if (
      productPickerMode === "crossSellTriggerProduct" ||
      productPickerMode === "bundleTriggerProduct"
    ) {
      setSelectionMetaById((current) => ({
        ...current,
        [selection.productId]: selectedProductMeta,
      }));
      setValue("triggerProductId", selection.productId, {
        shouldDirty: true,
        shouldValidate: false,
      });
    }

    if (productPickerMode === "crossSellTargetProduct") {
      const currentIds = targetProductIds ?? [];

      if (!currentIds.includes(selection.productId)) {
        setSelectionMetaById((current) => ({
          ...current,
          [selection.productId]: selectedProductMeta,
        }));
        setValue("targetProductIds", [...currentIds, selection.productId], {
          shouldDirty: true,
          shouldValidate: false,
        });
      }
    }

    if (
      productPickerMode === "requiredVariant" ||
      productPickerMode === "bundleRequiredVariant"
    ) {
      const currentIds = requiredVariantIds ?? [];

      if (!currentIds.includes(selection.variantId)) {
        setSelectionMetaById((current) => ({
          ...current,
          [selection.variantId]: selectedProductMeta,
        }));
        setValue("requiredVariantIds", [...currentIds, selection.variantId], {
          shouldDirty: true,
          shouldValidate: false,
        });
      }
    }

    if (
      productPickerMode === "freeVariant" ||
      productPickerMode === "bundleFreeVariant"
    ) {
      const currentIds = freeVariantIds ?? [];

      if (!currentIds.includes(selection.variantId)) {
        setSelectionMetaById((current) => ({
          ...current,
          [selection.variantId]: selectedProductMeta,
        }));
        setValue("freeVariantIds", [...currentIds, selection.variantId], {
          shouldDirty: true,
          shouldValidate: false,
        });
      }
    }

    setProductPickerMode(null);
  }

  function removeListValue(
    fieldName: "targetProductIds" | "requiredVariantIds" | "freeVariantIds",
    value: string,
  ) {
    const values = watch(fieldName) ?? [];

    setValue(fieldName, values.filter((id) => id !== value), {
      shouldDirty: true,
      shouldValidate: false,
    });
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

      {(schemaError || submissionError) && (
        <section className="alert alert--critical" role="alert">
          <strong>{schemaError ? "Validation Error" : "Save Failed"}</strong>

          <pre className="alert__pre">
            {schemaError ?? submissionError}
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
            <span className="form-label">Trigger product</span>

            <ProductIdSelector
              productId={triggerProductId}
              meta={
                triggerProductId
                  ? selectionMetaById[triggerProductId]
                  : undefined
              }
              emptyText="Choose the product that unlocks the cross-sell."
              onPick={() => setProductPickerMode("crossSellTriggerProduct")}
              onClear={() =>
                setValue("triggerProductId", "", {
                  shouldDirty: true,
                  shouldValidate: false,
                })
              }
            />
          </div>

          <div className="form-group">
            <span className="form-label">Target products</span>

            <ProductIdListSelector
              productIds={targetProductIds ?? []}
              metaById={selectionMetaById}
              emptyText="Choose one or more products that receive the discount."
              itemLabel="Product"
              onPick={() => setProductPickerMode("crossSellTargetProduct")}
              onRemove={(productId) =>
                removeListValue("targetProductIds", productId)
              }
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
            <span className="form-label">Required variants</span>

            <ProductIdListSelector
              productIds={requiredVariantIds ?? []}
              metaById={selectionMetaById}
              emptyText="Choose the variants that must be in the cart."
              itemLabel="Variant"
              addLabel="Add required variant"
              onPick={() => setProductPickerMode("requiredVariant")}
              onRemove={(variantId) =>
                removeListValue("requiredVariantIds", variantId)
              }
            />
          </div>

          <div className="form-group">
            <span className="form-label">Free variants</span>

            <ProductIdListSelector
              productIds={freeVariantIds ?? []}
              metaById={selectionMetaById}
              emptyText="Choose the variants that should become free."
              itemLabel="Variant"
              addLabel="Add free variant"
              onPick={() => setProductPickerMode("freeVariant")}
              onRemove={(variantId) =>
                removeListValue("freeVariantIds", variantId)
              }
            />
          </div>

          <div className="form-group">
            <label
              htmlFor="freeQuantityPerLine"
              className="form-label"
            >
              Free Quantity Per Line
            </label>
            <p className="field-hint">Leave empty to discount all eligible units.</p>

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
              placeholder="All…"
              className="number-field"
            />
          </div>
        </section>
      )}

      {ruleType === "required_product_with_free_variants" && (
        <section className="form-section">
          <h2 className="form-section__title">Product bundle configuration</h2>
          <div className="form-group">
            <span className="form-label">Trigger product</span>

            <ProductIdSelector
              productId={triggerProductId}
              meta={
                triggerProductId
                  ? selectionMetaById[triggerProductId]
                  : undefined
              }
              emptyText="Choose the product that unlocks the bundle."
              onPick={() => setProductPickerMode("bundleTriggerProduct")}
              onClear={() =>
                setValue("triggerProductId", "", {
                  shouldDirty: true,
                  shouldValidate: false,
                })
              }
            />
          </div>

          <div className="form-group">
            <span className="form-label">Required variants</span>

            <ProductIdListSelector
              productIds={requiredVariantIds ?? []}
              metaById={selectionMetaById}
              emptyText="Choose the variants that must be in the cart."
              itemLabel="Variant"
              addLabel="Add required variant"
              onPick={() => setProductPickerMode("bundleRequiredVariant")}
              onRemove={(variantId) =>
                removeListValue("requiredVariantIds", variantId)
              }
            />
          </div>

          <div className="form-group">
            <span className="form-label">Free variants</span>

            <ProductIdListSelector
              productIds={freeVariantIds ?? []}
              metaById={selectionMetaById}
              emptyText="Choose the variants that should become free."
              itemLabel="Variant"
              addLabel="Add free variant"
              onPick={() => setProductPickerMode("bundleFreeVariant")}
              onRemove={(variantId) =>
                removeListValue("freeVariantIds", variantId)
              }
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
          {isSubmitting ? "Saving…" : "Save Rule"}
        </button>

        <button
          type="button"
          onClick={onCancel}
          className="btn"
        >
          Cancel
        </button>
      </div>

      {productPickerMode && (
        <ProductPicker
          onSelect={handlePickerSelect}
          onClose={() => setProductPickerMode(null)}
        />
      )}
    </form>
  );
}

function ProductIdSelector({
  productId,
  meta,
  emptyText,
  onPick,
  onClear,
}: {
  productId?: string;
  meta?: SelectedProductMeta;
  emptyText: string;
  onPick: () => void;
  onClear: () => void;
}) {
  return (
    <div className="product-id-selector">
      {productId ? (
        <div className="product-id-card">
          <SelectionSummary
            id={productId}
            itemLabel="Product"
            meta={meta}
          />

          <div className="btn-row btn-row--end">
            <button type="button" onClick={onPick} className="btn btn--small">
              Change
            </button>
            <button
              type="button"
              onClick={onClear}
              className="btn btn--small btn--danger"
            >
              Clear
            </button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={onPick} className="product-picker-trigger">
          <span className="product-picker-trigger__icon">+</span>
          <span>
            <strong>Select product</strong>
            <span>{emptyText}</span>
          </span>
        </button>
      )}
    </div>
  );
}

function ProductIdListSelector({
  productIds,
  metaById,
  emptyText,
  itemLabel = "Product",
  addLabel = "Add target product",
  onPick,
  onRemove,
}: {
  productIds: string[];
  metaById?: Record<string, SelectedProductMeta>;
  emptyText: string;
  itemLabel?: string;
  addLabel?: string;
  onPick: () => void;
  onRemove: (productId: string) => void;
}) {
  return (
    <div className="product-id-selector">
      <button type="button" onClick={onPick} className="product-picker-trigger">
        <span className="product-picker-trigger__icon">+</span>
        <span>
          <strong>{addLabel}</strong>
          <span>{emptyText}</span>
        </span>
      </button>

      {productIds.length > 0 && (
        <div className="product-id-list">
          {productIds.map((productId) => (
            <div key={productId} className="product-id-chip">
              <SelectionSummary
                id={productId}
                itemLabel={itemLabel}
                meta={metaById?.[productId]}
              />

              <button
                type="button"
                onClick={() => onRemove(productId)}
                className="btn btn--small btn--danger"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SelectionSummary({
  id,
  itemLabel,
  meta,
}: {
  id: string;
  itemLabel: string;
  meta?: SelectedProductMeta;
}) {
  const title = meta?.productTitle ?? `${itemLabel} ${getGidTail(id)}`;
  const variantTitle = meta?.variantTitle;
  const imageAlt = meta?.imageAlt || meta?.productTitle || title;

  return (
    <div className="selection-summary">
      <div className="selection-summary__media">
        {meta?.imageUrl ? (
          <img src={meta.imageUrl} alt={imageAlt} loading="lazy" />
        ) : (
          <span>{title.slice(0, 2).toUpperCase()}</span>
        )}
      </div>

      <div className="selection-summary__body">
        <strong>{title}</strong>
        <div className="selection-summary__badges">
          <span>{itemLabel} ID {getGidTail(id)}</span>
          {meta?.productId && id !== meta.productId && (
            <span>Product ID {getGidTail(meta.productId)}</span>
          )}
          {variantTitle && <span>Variant {variantTitle}</span>}
          {meta?.variantId && <span>Variant ID {getGidTail(meta.variantId)}</span>}
          {meta?.sku && <span>SKU {meta.sku}</span>}
        </div>
        <span className="mono">{id}</span>
      </div>
    </div>
  );
}
