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

interface LoyaltyTierEntry {
  minOrders: number;
  discountPercentage: number;
}

interface QuantityTierPrice {
  quantity: number;
  targetPricePerUnit: number;
}

interface RuleConditionsFormValues {
  minimumCartSubtotal?: number;
  requiredCartAttributeKey?: string;
  requiredCartAttributeValue?: string;
  requiresSubscriptionInCart?: boolean;
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
  tiers?: LoyaltyTierEntry[];
  quantityTiers?: QuantityTierPrice[];
  maxUnitsTotal?: number;
  requiredLineAttributeKey?: string;
  requiredLineAttributeValue?: string;
  requiresSubscriptionOption?: "any" | "true" | "false";
  targetVariantIds?: string[];
  requiredAnchorVariantIds?: string[];
  conditions?: RuleConditionsFormValues;
}

const DEFAULT_RULES: Record<PromoRuleType, PromoRuleFormValues> = {
  loyalty_tier: {
    id: "loyalty-discount",
    type: "loyalty_tier",
    enabled: true,
    targetProductIds: [],
    tiers: [
      { minOrders: 1, discountPercentage: 5 },
      { minOrders: 5, discountPercentage: 15 },
      { minOrders: 10, discountPercentage: 25 },
    ],
    message: "Loyalty discount!",
  },

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
    discountPercentage: 100,
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
    discountPercentage: 100,
    message: HPN_PROMO_MESSAGES.FREE_POUCHES,
  },

  subscription_bundle_group: {
    id: "subscription-bundle",
    type: "subscription_bundle_group",
    enabled: true,
    targetProductIds: [],
    discountPercentage: 10,
    maxUnitsTotal: 2,
    requiredLineAttributeKey: "",
    requiredLineAttributeValue: "",
    message: "",
    conditions: { requiresSubscriptionInCart: true },
  },

  one_time_purchase_discount: {
    id: "one-time-purchase-discount",
    type: "one_time_purchase_discount",
    enabled: true,
    targetVariantIds: [],
    discountPercentage: 25,
    message: "",
  },

  swell_free_product: {
    id: "swell-free-product",
    type: "swell_free_product",
    enabled: true,
    message: "Rewards",
  },

  swell_cart_fixed_amount: {
    id: "swell-cart-fixed-amount",
    type: "swell_cart_fixed_amount",
    enabled: true,
    message: "Rewards",
  },

  landing_quantity_tier_fixed_price: {
    id: "landing-quantity-tier-fixed-price",
    type: "landing_quantity_tier_fixed_price",
    enabled: true,
    targetVariantIds: [],
    requiredLineAttributeKey: "__landing_source",
    requiredLineAttributeValue: "",
    requiresSubscriptionOption: "any",
    quantityTiers: [],
    message: "",
  },

  landing_scoped_product_discount: {
    id: "landing-scoped-product-discount",
    type: "landing_scoped_product_discount",
    enabled: true,
    targetProductIds: [],
    requiredLineAttributeKey: "__landing_source",
    requiredLineAttributeValue: "",
    discountPercentage: 100,
    message: "",
  },

  landing_free_shipping: {
    id: "landing-free-shipping",
    type: "landing_free_shipping",
    enabled: true,
    requiredLineAttributeKey: "__landing_source",
    requiredLineAttributeValue: "",
    message: "",
  },
};

function normalizeDefaultValues(defaultValues?: HpnPromoRule): PromoRuleFormValues {
  if (!defaultValues) {
    return makeDefaultRule("pa7_cross_sell");
  }

  if (defaultValues.type === "landing_quantity_tier_fixed_price") {
    const { tiers, requiresSubscription, ...rest } = defaultValues;
    return {
      ...rest,
      quantityTiers: tiers,
      requiresSubscriptionOption:
        requiresSubscription === true ? "true" : requiresSubscription === false ? "false" : "any",
    };
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
  if (type === "trigger_product_discounted_targets") return `trigger-discounted-targets-${suffix}`;
  if (type === "subscription_bundle_group") return `subscription-bundle-${suffix}`;
  if (type === "one_time_purchase_discount") return `one-time-purchase-discount-${suffix}`;
  if (type === "swell_free_product") return `swell-free-product-${suffix}`;
  if (type === "swell_cart_fixed_amount") return `swell-cart-fixed-amount-${suffix}`;
  if (type === "landing_quantity_tier_fixed_price") return `landing-quantity-tier-${suffix}`;
  if (type === "landing_scoped_product_discount") return `landing-scoped-product-${suffix}`;
  if (type === "landing_free_shipping") return `landing-free-shipping-${suffix}`;
  return `loyalty-tier-${suffix}`;
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

function buildConditions(
  c: RuleConditionsFormValues | undefined,
): Record<string, unknown> | undefined {
  if (!c) return undefined;
  const out: Record<string, unknown> = {};
  if (c.minimumCartSubtotal) out.minimumCartSubtotal = c.minimumCartSubtotal;
  if (c.requiredCartAttributeKey) {
    out.requiredCartAttributeKey = c.requiredCartAttributeKey;
    if (c.requiredCartAttributeValue != null) {
      out.requiredCartAttributeValue = c.requiredCartAttributeValue;
    }
  }
  if (c.requiresSubscriptionInCart) out.requiresSubscriptionInCart = true;
  return Object.keys(out).length ? out : undefined;
}

function buildRulePayload(values: PromoRuleFormValues): unknown {
  const conditions = buildConditions(values.conditions);

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
      conditions,
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
      conditions,
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
      conditions,
    };
  }

  if (values.type === "trigger_product_discounted_targets") {
    return {
      id: values.id,
      type: "trigger_product_discounted_targets",
      enabled: values.enabled,
      triggerProductId: values.triggerProductId,
      targets: values.targets ?? [],
      message: values.message,
      conditions,
    };
  }

  if (values.type === "swell_free_product") {
    return {
      id: values.id,
      type: "swell_free_product",
      enabled: values.enabled,
      message: values.message,
      conditions,
    };
  }

  if (values.type === "swell_cart_fixed_amount") {
    return {
      id: values.id,
      type: "swell_cart_fixed_amount",
      enabled: values.enabled,
      message: values.message,
      conditions,
    };
  }

  if (values.type === "subscription_bundle_group") {
    return {
      id: values.id,
      type: "subscription_bundle_group",
      enabled: values.enabled,
      targetProductIds: values.targetProductIds ?? [],
      discountPercentage: values.discountPercentage ?? 10,
      maxUnitsTotal: values.maxUnitsTotal ?? 2,
      requiredLineAttributeKey: values.requiredLineAttributeKey || undefined,
      requiredLineAttributeValue: values.requiredLineAttributeValue || undefined,
      message: values.message,
      conditions,
    };
  }

  if (values.type === "one_time_purchase_discount") {
    return {
      id: values.id,
      type: "one_time_purchase_discount",
      enabled: values.enabled,
      targetVariantIds: values.targetVariantIds ?? [],
      discountPercentage: values.discountPercentage ?? 25,
      message: values.message,
      conditions,
    };
  }

  if (values.type === "landing_quantity_tier_fixed_price") {
    return {
      id: values.id,
      type: "landing_quantity_tier_fixed_price",
      enabled: values.enabled,
      targetVariantIds: values.targetVariantIds ?? [],
      requiredLineAttributeKey: values.requiredLineAttributeKey ?? "",
      requiredLineAttributeValue: values.requiredLineAttributeValue ?? "",
      requiresSubscription:
        values.requiresSubscriptionOption === "true"
          ? true
          : values.requiresSubscriptionOption === "false"
            ? false
            : undefined,
      tiers: values.quantityTiers ?? [],
      message: values.message,
      conditions,
    };
  }

  if (values.type === "landing_scoped_product_discount") {
    return {
      id: values.id,
      type: "landing_scoped_product_discount",
      enabled: values.enabled,
      targetProductIds: values.targetProductIds ?? [],
      requiredLineAttributeKey: values.requiredLineAttributeKey ?? "",
      requiredLineAttributeValue: values.requiredLineAttributeValue ?? "",
      requiredAnchorVariantIds:
        values.requiredAnchorVariantIds && values.requiredAnchorVariantIds.length > 0
          ? values.requiredAnchorVariantIds
          : undefined,
      discountPercentage: values.discountPercentage ?? 100,
      message: values.message,
      conditions,
    };
  }

  if (values.type === "landing_free_shipping") {
    return {
      id: values.id,
      type: "landing_free_shipping",
      enabled: values.enabled,
      requiredLineAttributeKey: values.requiredLineAttributeKey ?? "",
      requiredLineAttributeValue: values.requiredLineAttributeValue ?? "",
      message: values.message,
      conditions,
    };
  }

  return {
    id: values.id,
    type: "loyalty_tier",
    enabled: values.enabled,
    targetProductIds: values.targetProductIds ?? [],
    tiers: values.tiers ?? [],
    message: values.message,
    conditions,
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
    | "oneTimeVariant"
    | "landingTierVariant"
    | "landingScopedProduct"
    | "landingScopedAnchorVariant"
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
  const targetVariantIds = watch("targetVariantIds");
  const requiredAnchorVariantIds = watch("requiredAnchorVariantIds");
  const targets = watch("targets");
  const tiers = watch("tiers");
  const quantityTiers = watch("quantityTiers");
  const selectedIds = useMemo(() => {
    return Array.from(
      new Set(
        [
          triggerProductId,
          ...(targetProductIds ?? []),
          ...(requiredVariantIds ?? []),
          ...(freeVariantIds ?? []),
          ...(targetVariantIds ?? []),
          ...(requiredAnchorVariantIds ?? []),
          ...(targets ?? []).map((t) => t.productId),
        ].filter((id): id is string => Boolean(id)),
      ),
    );
  }, [
    freeVariantIds,
    requiredVariantIds,
    targetProductIds,
    targetVariantIds,
    requiredAnchorVariantIds,
    triggerProductId,
    targets,
  ]);
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

    if (
      productPickerMode === "crossSellTargetProduct" ||
      productPickerMode === "landingScopedProduct"
    ) {
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

    if (
      productPickerMode === "oneTimeVariant" ||
      productPickerMode === "landingTierVariant"
    ) {
      const currentIds = targetVariantIds ?? [];

      if (!currentIds.includes(selection.variantId)) {
        setSelectionMetaById((current) => ({
          ...current,
          [selection.variantId]: selectedProductMeta,
        }));
        setValue("targetVariantIds", [...currentIds, selection.variantId], {
          shouldDirty: true,
          shouldValidate: false,
        });
      }
    }

    if (productPickerMode === "landingScopedAnchorVariant") {
      const currentIds = requiredAnchorVariantIds ?? [];

      if (!currentIds.includes(selection.variantId)) {
        setSelectionMetaById((current) => ({
          ...current,
          [selection.variantId]: selectedProductMeta,
        }));
        setValue("requiredAnchorVariantIds", [...currentIds, selection.variantId], {
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
    fieldName:
      | "targetProductIds"
      | "requiredVariantIds"
      | "freeVariantIds"
      | "targetVariantIds"
      | "requiredAnchorVariantIds",
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

          <option value="loyalty_tier">
            Loyalty Tier — discount by customer order count
          </option>

          <option value="one_time_purchase_discount">
            One-Time Purchase Discount (% off, non-subscription only)
          </option>

          <option value="landing_quantity_tier_fixed_price">
            Landing Page → Quantity-Tier Fixed Price
          </option>

          <option value="landing_scoped_product_discount">
            Landing Page → Scoped Product Discount (e.g. free gift)
          </option>

          <option value="landing_free_shipping">
            Landing Page → Free Shipping
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

      {ruleType === "loyalty_tier" && (
        <section className="form-section">
          <h2 className="form-section__title">Loyalty tiers</h2>

          <div className="form-group">
            <span className="form-label">Target products</span>
            <p className="field-hint">
              Products to discount based on the customer's loyalty tier.
            </p>

            <ProductIdListSelector
              productIds={targetProductIds ?? []}
              metaById={selectionMetaById}
              emptyText="Choose products that receive the loyalty discount."
              itemLabel="Product"
              addLabel="Add target product"
              onPick={() => setProductPickerMode("crossSellTargetProduct")}
              onRemove={(id) => removeListValue("targetProductIds", id)}
            />
          </div>

          <div className="form-group">
            <span className="form-label">Discount tiers</span>
            <p className="field-hint">
              The highest matching tier is applied. Customer must be logged in
              — guests are skipped.
            </p>

            {(tiers ?? []).length > 0 && (
              <div className="product-id-list">
                {(tiers ?? []).map((tier, idx) => (
                  <div key={idx} className="product-id-chip">
                    <div className="target-discount-row">
                      <label className="form-label">Min orders</label>
                      <input
                        type="number"
                        min={0}
                        value={tier.minOrders}
                        onChange={(e) => {
                          const next = (tiers ?? []).map((t, i) =>
                            i === idx
                              ? { ...t, minOrders: Number(e.target.value) }
                              : t,
                          );
                          setValue("tiers", next, { shouldDirty: true });
                        }}
                        className="number-field"
                      />
                      <label className="form-label">Discount %</label>
                      <input
                        type="number"
                        min={1}
                        max={100}
                        value={tier.discountPercentage}
                        onChange={(e) => {
                          const next = (tiers ?? []).map((t, i) =>
                            i === idx
                              ? { ...t, discountPercentage: Number(e.target.value) }
                              : t,
                          );
                          setValue("tiers", next, { shouldDirty: true });
                        }}
                        className="number-field"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setValue(
                            "tiers",
                            (tiers ?? []).filter((_, i) => i !== idx),
                            { shouldDirty: true },
                          )
                        }
                        className="btn btn--small btn--danger"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={() =>
                setValue(
                  "tiers",
                  [...(tiers ?? []), { minOrders: 0, discountPercentage: 10 }],
                  { shouldDirty: true },
                )
              }
              className="btn btn--small"
            >
              + Add tier
            </button>
          </div>
        </section>
      )}

      {ruleType === "one_time_purchase_discount" && (
        <section className="form-section">
          <h2 className="form-section__title">One-time purchase discount configuration</h2>

          <div className="form-group">
            <span className="form-label">Target variants</span>
            <p className="field-hint">
              Each variant discounts independently — no other variant needs to
              be in the cart, and the whole line quantity gets the discount.
              Subscription lines for these variants are skipped.
            </p>

            <ProductIdListSelector
              productIds={targetVariantIds ?? []}
              metaById={selectionMetaById}
              emptyText="Choose the variants eligible for the one-time discount."
              itemLabel="Variant"
              addLabel="Add eligible variant"
              onPick={() => setProductPickerMode("oneTimeVariant")}
              onRemove={(variantId) => removeListValue("targetVariantIds", variantId)}
            />
          </div>

          <div className="form-group">
            <label
              htmlFor="oneTimeDiscountPercentage"
              className="form-label"
            >
              Discount Percentage
            </label>

            <input
              type="number"
              id="oneTimeDiscountPercentage"
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

      {ruleType === "landing_quantity_tier_fixed_price" && (
        <section className="form-section">
          <h2 className="form-section__title">Landing page quantity-tier pricing</h2>
          <p className="field-hint">
            Only applies to cart lines carrying the required line item
            property below — the same variant added from its own PDP is
            unaffected.
          </p>

          <div className="form-group">
            <span className="form-label">Target variants</span>
            <ProductIdListSelector
              productIds={targetVariantIds ?? []}
              metaById={selectionMetaById}
              emptyText="Choose the variants sold on this landing page."
              itemLabel="Variant"
              addLabel="Add variant"
              onPick={() => setProductPickerMode("landingTierVariant")}
              onRemove={(variantId) => removeListValue("targetVariantIds", variantId)}
            />
          </div>

          <div className="form-group">
            <span className="form-label">Required line item property</span>
            <div className="target-discount-row">
              <input
                type="text"
                placeholder="key (e.g. __landing_source)"
                {...register("requiredLineAttributeKey")}
              />
              <input
                type="text"
                placeholder="value (e.g. protein-complete-lp)"
                {...register("requiredLineAttributeValue")}
              />
            </div>
            <p className="field-hint">
              The landing page's add-to-cart form must set this exact
              property on every line it adds.
            </p>
          </div>

          <div className="form-group">
            <label htmlFor="requiresSubscriptionOption" className="form-label">
              Applies to
            </label>
            <select
              id="requiresSubscriptionOption"
              {...register("requiresSubscriptionOption")}
            >
              <option value="any">Any (subscription or one-time)</option>
              <option value="true">Subscription lines only</option>
              <option value="false">One-time purchase lines only</option>
            </select>
          </div>

          <div className="form-group">
            <span className="form-label">Quantity tiers (fixed price per unit)</span>
            <p className="field-hint">
              The combined quantity across all matching lines must exactly
              match a tier's quantity — no partial matches.
            </p>

            {(quantityTiers ?? []).length > 0 && (
              <div className="product-id-list">
                {(quantityTiers ?? []).map((tier, idx) => (
                  <div key={idx} className="product-id-chip">
                    <div className="target-discount-row">
                      <label className="form-label">Quantity</label>
                      <input
                        type="number"
                        min={1}
                        value={tier.quantity}
                        onChange={(e) => {
                          const next = (quantityTiers ?? []).map((t, i) =>
                            i === idx
                              ? { ...t, quantity: Number(e.target.value) }
                              : t,
                          );
                          setValue("quantityTiers", next, { shouldDirty: true });
                        }}
                        className="number-field"
                      />
                      <label className="form-label">Price per unit ($)</label>
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        value={tier.targetPricePerUnit}
                        onChange={(e) => {
                          const next = (quantityTiers ?? []).map((t, i) =>
                            i === idx
                              ? { ...t, targetPricePerUnit: Number(e.target.value) }
                              : t,
                          );
                          setValue("quantityTiers", next, { shouldDirty: true });
                        }}
                        className="number-field"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setValue(
                            "quantityTiers",
                            (quantityTiers ?? []).filter((_, i) => i !== idx),
                            { shouldDirty: true },
                          )
                        }
                        className="btn btn--small btn--danger"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={() =>
                setValue(
                  "quantityTiers",
                  [...(quantityTiers ?? []), { quantity: 1, targetPricePerUnit: 0 }],
                  { shouldDirty: true },
                )
              }
              className="btn btn--small"
            >
              + Add tier
            </button>
          </div>
        </section>
      )}

      {ruleType === "landing_scoped_product_discount" && (
        <section className="form-section">
          <h2 className="form-section__title">Landing page scoped product discount</h2>
          <p className="field-hint">
            Discounts these products only on lines carrying the required line
            item property below — e.g. a free gift bundled with a specific
            landing page.
          </p>

          <div className="form-group">
            <span className="form-label">Target products</span>
            <ProductIdListSelector
              productIds={targetProductIds ?? []}
              metaById={selectionMetaById}
              emptyText="Choose the products to discount on this landing."
              itemLabel="Product"
              addLabel="Add product"
              onPick={() => setProductPickerMode("landingScopedProduct")}
              onRemove={(id) => removeListValue("targetProductIds", id)}
            />
          </div>

          <div className="form-group">
            <span className="form-label">Required line item property</span>
            <div className="target-discount-row">
              <input
                type="text"
                placeholder="key (e.g. __landing_source)"
                {...register("requiredLineAttributeKey")}
              />
              <input
                type="text"
                placeholder="value (e.g. protein-complete-lp)"
                {...register("requiredLineAttributeValue")}
              />
            </div>
          </div>

          <div className="form-group">
            <span className="form-label">Required anchor variants (optional)</span>
            <p className="field-hint">
              If set, this discount only applies while at least one tagged
              line for one of these variants is still in the cart — e.g. the
              protein purchase this gift is bundled with. Removing the anchor
              from the cart reverts the gift to full price instead of leaving
              it free forever.
            </p>
            <ProductIdListSelector
              productIds={requiredAnchorVariantIds ?? []}
              metaById={selectionMetaById}
              emptyText="Choose the variant(s) this gift is bundled with."
              itemLabel="Variant"
              addLabel="Add anchor variant"
              onPick={() => setProductPickerMode("landingScopedAnchorVariant")}
              onRemove={(variantId) => removeListValue("requiredAnchorVariantIds", variantId)}
            />
          </div>

          <div className="form-group">
            <label
              htmlFor="landingScopedDiscountPercentage"
              className="form-label"
            >
              Discount Percentage
            </label>

            <input
              type="number"
              id="landingScopedDiscountPercentage"
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

      {ruleType === "landing_free_shipping" && (
        <section className="form-section">
          <h2 className="form-section__title">Landing page free shipping</h2>
          <p className="field-hint">
            Free shipping for the whole order whenever any cart line carries
            the required line item property below.
          </p>

          <div className="form-group">
            <span className="form-label">Required line item property</span>
            <div className="target-discount-row">
              <input
                type="text"
                placeholder="key (e.g. __landing_source)"
                {...register("requiredLineAttributeKey")}
              />
              <input
                type="text"
                placeholder="value (e.g. protein-complete-lp)"
                {...register("requiredLineAttributeValue")}
              />
            </div>
          </div>
        </section>
      )}

      <section className="form-section">
        <h2 className="form-section__title">Additional conditions (optional)</h2>
        <p className="field-hint">
          These conditions are evaluated before applying the rule. Leave blank
          to apply unconditionally.
        </p>

        <div className="form-group">
          <label htmlFor="cond-subtotal" className="form-label">
            Minimum cart subtotal ($)
          </label>
          <input
            type="number"
            id="cond-subtotal"
            min={0}
            step={0.01}
            placeholder="e.g. 50.00"
            {...register("conditions.minimumCartSubtotal", { valueAsNumber: true })}
            className="number-field"
          />
        </div>

        <div className="form-group">
          <span className="form-label">Required cart attribute</span>
          <div className="target-discount-row">
            <input
              type="text"
              placeholder="key (e.g. source)"
              {...register("conditions.requiredCartAttributeKey")}
            />
            <input
              type="text"
              placeholder="value (e.g. landing-page-x)"
              {...register("conditions.requiredCartAttributeValue")}
            />
          </div>
          <p className="field-hint">
            Set from a landing page via the Storefront API:{" "}
            <code>cart.updateAttributes([&#123; key, value &#125;])</code>.
            Only <code>source</code> is currently wired into the discount
            function — other keys are saved but never evaluated until a
            developer adds them to the function&apos;s query.
          </p>
        </div>

        <div className="form-group">
          <label className="checkbox-row">
            <input
              type="checkbox"
              {...register("conditions.requiresSubscriptionInCart")}
            />
            <span>Requires at least one subscription item in cart</span>
          </label>
        </div>
      </section>

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
