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
import { HPN_PRODUCTS, HPN_PROMO_MESSAGES, HPN_VARIANTS } from "../lib/hpnPromoConstants";
import type { ActionError } from "../lib/actionError.server";
import { DevErrorBanner } from "./DevErrorBanner";

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
  submissionError?: ActionError | null;
  onSubmit: (data: HpnPromoRule) => void;
  onCancel: () => void;
}

interface DiscountTarget {
  productId: string;
  discountPercentage: number;
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
  targets?: DiscountTarget[];
}

const DEFAULT_RULES: Record<PromoRuleType, PromoRuleFormValues> = {
  trigger_product_discounted_targets: {
    id: "trigger-discounted-targets",
    type: "trigger_product_discounted_targets",
    enabled: true,
    triggerProductId: "",
    targets: [],
    message: "",
  },

  pa7_cross_sell: {
    id: "pa7-cross-sell",
    type: "pa7_cross_sell",
    enabled: true,
    triggerProductId: HPN_PRODUCTS.PA7_PRODUCT_ID,
    targetProductIds: [
      HPN_PRODUCTS.C2_PRODUCT_ID,
      HPN_PRODUCTS.T5_PRODUCT_ID,
    ],
    targetLineQuantityEquals: 1,
    discountPercentage: 10,
    message: HPN_PROMO_MESSAGES.PA7_CROSS_SELL,
  },

  required_variants_free_variants: {
    id: "nad3-single-planta-samples",
    type: "required_variants_free_variants",
    enabled: true,
    requiredVariantIds: [
      HPN_VARIANTS.NAD3_SINGLE_VARIANT_ID,
      HPN_VARIANTS.PLANTA_SAMPLE_VARIANT_ID_1,
      HPN_VARIANTS.PLANTA_SAMPLE_VARIANT_ID_2,
    ],
    freeVariantIds: [
      HPN_VARIANTS.PLANTA_SAMPLE_VARIANT_ID_1,
      HPN_VARIANTS.PLANTA_SAMPLE_VARIANT_ID_2,
    ],
    freeQuantityPerLine: 1,
    message: HPN_PROMO_MESSAGES.PLANTA_SAMPLES,
  },

  required_product_with_free_variants: {
    id: "nad3-240-pouches",
    type: "required_product_with_free_variants",
    enabled: true,
    triggerProductId: HPN_PRODUCTS.NAD3_240_PRODUCT_ID,
    requiredVariantIds: [
      HPN_VARIANTS.S9_1WK_POUCH_VARIANT_ID,
      HPN_VARIANTS.N4_1WK_POUCH_VARIANT_ID,
    ],
    freeVariantIds: [
      HPN_VARIANTS.S9_1WK_POUCH_VARIANT_ID,
      HPN_VARIANTS.N4_1WK_POUCH_VARIANT_ID,
    ],
    freeQuantityPerLine: 1,
    message: HPN_PROMO_MESSAGES.FREE_POUCHES,
  },
};

function normalizeDefaultValues(defaultValues?: HpnPromoRule): PromoRuleFormValues {
  if (!defaultValues) {
    return makeDefaultRule("pa7_cross_sell");
  }

  return {
    ...defaultValues,
  };
}

function makeRuleId(type: PromoRuleType) {
  const suffix = Date.now().toString(36);

  if (type === "pa7_cross_sell") return `pa7-cross-sell-${suffix}`;
  if (type === "required_variants_free_variants") return `required-variants-free-variants-${suffix}`;
  if (type === "required_product_with_free_variants") return `required-product-free-variants-${suffix}`;
  return `trigger-discounted-targets-${suffix}`;
}

function makeDefaultRule(type: PromoRuleType): PromoRuleFormValues {
  return {
    ...DEFAULT_RULES[type],
    id: makeRuleId(type),
  };
}

function getGidTail(gid: string) {
  return gid.split("/").pop() ?? gid;
}

function buildRulePayload(values: PromoRuleFormValues): unknown {
  if (values.type === "pa7_cross_sell") {
    return {
      id: values.id,
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
      id: values.id,
      type: "required_variants_free_variants",
      enabled: values.enabled,
      requiredVariantIds: values.requiredVariantIds ?? [],
      freeVariantIds: values.freeVariantIds ?? [],
      freeQuantityPerLine: values.freeQuantityPerLine ?? 1,
      discountPercentage: values.discountPercentage ?? 100,
      message: values.message,
    };
  }

  if (values.type === "required_product_with_free_variants") {
    return {
      id: values.id,
      type: "required_product_with_free_variants",
      enabled: values.enabled,
      triggerProductId: values.triggerProductId,
      requiredVariantIds: values.requiredVariantIds ?? [],
      freeVariantIds: values.freeVariantIds ?? [],
      freeQuantityPerLine: values.freeQuantityPerLine ?? 1,
      discountPercentage: values.discountPercentage ?? 100,
      message: values.message,
    };
  }

  return {
    id: values.id,
    type: "trigger_product_discounted_targets",
    enabled: values.enabled,
    triggerProductId: values.triggerProductId,
    targets: values.targets ?? [],
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
    | "discountedTriggerProduct"
    | "discountedTarget"
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
  const targets = watch("targets");
  const selectedIds = useMemo(() => {
    return Array.from(
      new Set(
        [
          triggerProductId,
          ...(targetProductIds ?? []),
          ...(requiredVariantIds ?? []),
          ...(freeVariantIds ?? []),
          ...(targets ?? []).map((t) => t.productId),
        ].filter((id): id is string => Boolean(id)),
      ),
    );
  }, [freeVariantIds, requiredVariantIds, targetProductIds, triggerProductId, targets]);
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
    reset(defaultValues ? DEFAULT_RULES[nextType] : makeDefaultRule(nextType));
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
      productPickerMode === "bundleTriggerProduct" ||
      productPickerMode === "discountedTriggerProduct"
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

    if (productPickerMode === "discountedTarget") {
      const currentTargets = targets ?? [];
      if (!currentTargets.some((t) => t.productId === selection.productId)) {
        setSelectionMetaById((current) => ({
          ...current,
          [selection.productId]: selectedProductMeta,
        }));
        setValue(
          "targets",
          [...currentTargets, { productId: selection.productId, discountPercentage: 10 }],
          { shouldDirty: true, shouldValidate: false },
        );
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

      {schemaError && (
        <section className="alert alert--critical" role="alert">
          <strong>Validation Error</strong>
          <pre className="alert__pre">{schemaError}</pre>
        </section>
      )}

      <DevErrorBanner error={submissionError} />

      <section className="form-section">
      <h2 className="form-section__title">Rule details</h2>

      <div className="form-group">
        <label
          htmlFor="id"
          className="form-label"
        >
          Rule ID
        </label>

        <input
          type="text"
          id="id"
          disabled={Boolean(defaultValues)}
          {...register("id")}
          placeholder="pa7-cross-sell"
        />
      </div>

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
          <option value="trigger_product_discounted_targets">
            Trigger Product → Discounted Targets (per-product %)
          </option>

          <option value="pa7_cross_sell">
            Trigger Product → Same % off targets (exact qty)
          </option>

          <option value="required_variants_free_variants">
            Required Variants → Discounted Variants
          </option>

          <option value="required_product_with_free_variants">
            Required Product + Variants → Discounted Variants
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
              htmlFor="variantFreeQuantityPerLine"
              className="form-label"
            >
              Free Quantity Per Line
            </label>

            <input
              type="number"
              id="variantFreeQuantityPerLine"
              min={1}
              {...register("freeQuantityPerLine", {
                valueAsNumber: true,
              })}
              className="number-field"
            />
          </div>

          <div className="form-group">
            <label
              htmlFor="variantDiscountPercentage"
              className="form-label"
            >
              Discount Percentage
            </label>

            <input
              type="number"
              id="variantDiscountPercentage"
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

          <div className="form-group">
            <label
              htmlFor="bundleFreeQuantityPerLine"
              className="form-label"
            >
              Free Quantity Per Line
            </label>

            <input
              type="number"
              id="bundleFreeQuantityPerLine"
              min={1}
              {...register("freeQuantityPerLine", {
                valueAsNumber: true,
              })}
              className="number-field"
            />
          </div>

          <div className="form-group">
            <label
              htmlFor="bundleDiscountPercentage"
              className="form-label"
            >
              Discount Percentage
            </label>

            <input
              type="number"
              id="bundleDiscountPercentage"
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

      {ruleType === "trigger_product_discounted_targets" && (
        <section className="form-section">
          <h2 className="form-section__title">Trigger + discounted targets</h2>

          <div className="form-group">
            <span className="form-label">Trigger product</span>

            <ProductIdSelector
              productId={triggerProductId}
              meta={triggerProductId ? selectionMetaById[triggerProductId] : undefined}
              emptyText="When this product is in the cart, targets get discounted."
              onPick={() => setProductPickerMode("discountedTriggerProduct")}
              onClear={() =>
                setValue("triggerProductId", "", { shouldDirty: true, shouldValidate: false })
              }
            />
          </div>

          <div className="form-group">
            <span className="form-label">Discounted targets</span>
            <p className="field-hint">
              Each target product gets its own discount %. Add as many as you need.
            </p>

            <button
              type="button"
              onClick={() => setProductPickerMode("discountedTarget")}
              className="product-picker-trigger"
            >
              <span className="product-picker-trigger__icon">+</span>
              <span>
                <strong>Add target product</strong>
                <span>Choose a product and set its discount percentage.</span>
              </span>
            </button>

            {(targets ?? []).length > 0 && (
              <div className="product-id-list">
                {(targets ?? []).map((target, idx) => (
                  <div key={target.productId} className="product-id-chip">
                    <SelectionSummary
                      id={target.productId}
                      itemLabel="Product"
                      meta={selectionMetaById[target.productId]}
                    />

                    <div className="target-discount-row">
                      <label className="form-label">Discount %</label>
                      <input
                        type="number"
                        min={1}
                        max={100}
                        value={target.discountPercentage}
                        onChange={(e) => {
                          const next = (targets ?? []).map((t, i) =>
                            i === idx
                              ? { ...t, discountPercentage: Number(e.target.value) }
                              : t,
                          );
                          setValue("targets", next, { shouldDirty: true });
                        }}
                        className="number-field"
                      />

                      <button
                        type="button"
                        onClick={() => {
                          setValue(
                            "targets",
                            (targets ?? []).filter((_, i) => i !== idx),
                            { shouldDirty: true },
                          );
                        }}
                        className="btn btn--small btn--danger"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
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
