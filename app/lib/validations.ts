import { z } from "zod";

const productGidSchema = z
  .string()
  .trim()
  .startsWith("gid://shopify/Product/");

const variantGidSchema = z
  .string()
  .trim()
  .startsWith("gid://shopify/ProductVariant/");

const ruleIdSchema = z
  .string()
  .trim()
  .min(1)
  .regex(/^[a-z0-9][a-z0-9-]*$/, "Use lowercase letters, numbers, and hyphens.");

// ---------------------------------------------------------------------------
// Global conditions — optional on every rule type
// ---------------------------------------------------------------------------

export const ruleConditionsSchema = z
  .object({
    minimumCartSubtotal: z.number().positive().optional(),
    requiredCartAttributeKey: z.string().min(1).optional(),
    requiredCartAttributeValue: z.string().optional(),
    requiresSubscriptionInCart: z.boolean().optional(),
  })
  .optional();

export type RuleConditions = z.infer<typeof ruleConditionsSchema>;

// ---------------------------------------------------------------------------
// Rule schemas
// ---------------------------------------------------------------------------

export const pa7CrossSellRuleSchema = z.object({
  id: ruleIdSchema,
  type: z.literal("pa7_cross_sell"),
  enabled: z.boolean(),
  triggerProductId: productGidSchema,
  targetProductIds: z.array(productGidSchema).min(1),
  targetLineQuantityEquals: z.number().int().positive(),
  discountPercentage: z.number().positive().max(100),
  message: z.string().trim().min(1),
  conditions: ruleConditionsSchema,
});

export const requiredVariantsFreeVariantsRuleSchema = z.object({
  id: ruleIdSchema,
  type: z.literal("required_variants_free_variants"),
  enabled: z.boolean(),
  requiredVariantIds: z.array(variantGidSchema).min(1),
  freeVariantIds: z.array(variantGidSchema).min(1),
  // Legacy configs used null to mean unlimited; normalize to 1.
  freeQuantityPerLine: z.preprocess(
    (value) => (value === null || value === undefined ? 1 : value),
    z.number().int().positive(),
  ),
  discountPercentage: z.number().positive().max(100).default(100),
  message: z.string().trim().min(1),
  conditions: ruleConditionsSchema,
});

export const requiredProductWithFreeVariantsRuleSchema = z.object({
  id: ruleIdSchema,
  type: z.literal("required_product_with_free_variants"),
  enabled: z.boolean(),
  triggerProductId: productGidSchema,
  requiredVariantIds: z.array(variantGidSchema).min(1),
  freeVariantIds: z.array(variantGidSchema).min(1),
  freeQuantityPerLine: z.number().int().positive(),
  discountPercentage: z.number().positive().max(100).default(100),
  message: z.string().trim().min(1),
  conditions: ruleConditionsSchema,
});

const discountTargetSchema = z.object({
  productId: productGidSchema,
  discountPercentage: z.number().positive().max(100),
});

export const triggerProductDiscountedTargetsRuleSchema = z.object({
  id: ruleIdSchema,
  type: z.literal("trigger_product_discounted_targets"),
  enabled: z.boolean(),
  triggerProductId: productGidSchema,
  targets: z.array(discountTargetSchema).min(1),
  message: z.string().trim().min(1),
  conditions: ruleConditionsSchema,
});

// ---------------------------------------------------------------------------
// Subscription bundle group (e.g. One Sol Bundle-Two)
// ---------------------------------------------------------------------------

export const subscriptionBundleGroupRuleSchema = z.object({
  id: ruleIdSchema,
  type: z.literal("subscription_bundle_group"),
  enabled: z.boolean(),
  targetProductIds: z.array(productGidSchema).min(1),
  discountPercentage: z.number().positive().max(100),
  // Cart-wide cap: only this many units across ALL matching lines get discounted.
  maxUnitsTotal: z.number().int().positive(),
  // Optional: require a specific line-level custom attribute (e.g. __bundle_type = two).
  requiredLineAttributeKey: z.string().min(1).optional(),
  requiredLineAttributeValue: z.string().optional(),
  message: z.string().trim().min(1),
  conditions: ruleConditionsSchema,
});

// ---------------------------------------------------------------------------
// One-time purchase discount (e.g. One Sol Acai/Unicorn Milkshake 25% off)
// ---------------------------------------------------------------------------

export const oneTimePurchaseDiscountRuleSchema = z.object({
  id: ruleIdSchema,
  type: z.literal("one_time_purchase_discount"),
  enabled: z.boolean(),
  targetVariantIds: z.array(variantGidSchema).min(1),
  discountPercentage: z.number().positive().max(100),
  message: z.string().trim().min(1),
  conditions: ruleConditionsSchema,
});

// ---------------------------------------------------------------------------
// Swell loyalty rewards (gettrusupps) — triggered by hidden line properties,
// no product IDs required.
// ---------------------------------------------------------------------------

export const swellFreeProductRuleSchema = z.object({
  id: ruleIdSchema,
  type: z.literal("swell_free_product"),
  enabled: z.boolean(),
  message: z.string().trim().min(1),
  conditions: ruleConditionsSchema,
});

export const swellCartFixedAmountRuleSchema = z.object({
  id: ruleIdSchema,
  type: z.literal("swell_cart_fixed_amount"),
  enabled: z.boolean(),
  message: z.string().trim().min(1),
  conditions: ruleConditionsSchema,
});

// ---------------------------------------------------------------------------
// Landing page quantity-tier fixed price (e.g. gettrusupps TRU landing) —
// scoped to a line item property set only by that landing's add-to-cart
// form, so the same variant added from a PDP is unaffected.
// ---------------------------------------------------------------------------

export const quantityTierPriceSchema = z.object({
  quantity: z.number().int().positive(),
  targetPricePerUnit: z.number().positive(),
});

export const landingQuantityTierFixedPriceRuleSchema = z.object({
  id: ruleIdSchema,
  type: z.literal("landing_quantity_tier_fixed_price"),
  enabled: z.boolean(),
  targetVariantIds: z.array(variantGidSchema).min(1),
  requiredLineAttributeKey: z.string().min(1),
  requiredLineAttributeValue: z.string().min(1),
  // undefined = matches any line; true = subscription lines only; false = one-time-purchase lines only.
  requiresSubscription: z.boolean().optional(),
  tiers: z.array(quantityTierPriceSchema).min(1),
  message: z.string().trim().min(1),
  conditions: ruleConditionsSchema,
});

// ---------------------------------------------------------------------------
// Landing page scoped product discount (e.g. free gift products bundled with
// a landing-only offer) — same line-item-property scoping as the tier rule
// above, but matches by PRODUCT id and applies a flat percentage.
// ---------------------------------------------------------------------------

export const landingScopedProductDiscountRuleSchema = z.object({
  id: ruleIdSchema,
  type: z.literal("landing_scoped_product_discount"),
  enabled: z.boolean(),
  targetProductIds: z.array(productGidSchema).min(1),
  requiredLineAttributeKey: z.string().min(1),
  requiredLineAttributeValue: z.string().min(1),
  discountPercentage: z.number().positive().max(100).default(100),
  message: z.string().trim().min(1),
  conditions: ruleConditionsSchema,
});

// ---------------------------------------------------------------------------
// Landing page free shipping — evaluated by a separate delivery-options
// Function target. Free shipping applies to the whole order whenever any
// cart line carries the configured line item property.
// ---------------------------------------------------------------------------

export const landingFreeShippingRuleSchema = z.object({
  id: ruleIdSchema,
  type: z.literal("landing_free_shipping"),
  enabled: z.boolean(),
  requiredLineAttributeKey: z.string().min(1),
  requiredLineAttributeValue: z.string().min(1),
  message: z.string().trim().min(1),
  conditions: ruleConditionsSchema,
});

// ---------------------------------------------------------------------------
// Loyalty tier
// ---------------------------------------------------------------------------

export const loyaltyTierEntrySchema = z.object({
  minOrders: z.number().int().min(0),
  discountPercentage: z.number().positive().max(100),
});

export const loyaltyTierRuleSchema = z.object({
  id: ruleIdSchema,
  type: z.literal("loyalty_tier"),
  enabled: z.boolean(),
  targetProductIds: z.array(productGidSchema).min(1),
  tiers: z.array(loyaltyTierEntrySchema).min(1),
  message: z.string().trim().min(1),
  conditions: ruleConditionsSchema,
});

// ---------------------------------------------------------------------------
// Union
// ---------------------------------------------------------------------------

export const hpnPromoRuleSchema = z.discriminatedUnion("type", [
  pa7CrossSellRuleSchema,
  requiredVariantsFreeVariantsRuleSchema,
  requiredProductWithFreeVariantsRuleSchema,
  triggerProductDiscountedTargetsRuleSchema,
  loyaltyTierRuleSchema,
  subscriptionBundleGroupRuleSchema,
  oneTimePurchaseDiscountRuleSchema,
  swellFreeProductRuleSchema,
  swellCartFixedAmountRuleSchema,
  landingQuantityTierFixedPriceRuleSchema,
  landingScopedProductDiscountRuleSchema,
  landingFreeShippingRuleSchema,
]);

export const hpnPromoConfigSchema = z.object({
  version: z.literal(1),
  rules: z.array(hpnPromoRuleSchema).min(0),
  combinesWith: z.object({
    orderDiscounts: z.boolean(),
    productDiscounts: z.boolean(),
    shippingDiscounts: z.boolean(),
  }),
});

// ---------------------------------------------------------------------------
// Derived types
// ---------------------------------------------------------------------------

export type Pa7CrossSellRule = z.infer<typeof pa7CrossSellRuleSchema>;
export type RequiredVariantsFreeVariantsRule = z.infer<typeof requiredVariantsFreeVariantsRuleSchema>;
export type RequiredProductWithFreeVariantsRule = z.infer<typeof requiredProductWithFreeVariantsRuleSchema>;
export type TriggerProductDiscountedTargetsRule = z.infer<typeof triggerProductDiscountedTargetsRuleSchema>;
export type LoyaltyTierRule = z.infer<typeof loyaltyTierRuleSchema>;
export type LoyaltyTierEntry = z.infer<typeof loyaltyTierEntrySchema>;
export type DiscountTarget = z.infer<typeof discountTargetSchema>;
export type SubscriptionBundleGroupRule = z.infer<typeof subscriptionBundleGroupRuleSchema>;
export type OneTimePurchaseDiscountRule = z.infer<typeof oneTimePurchaseDiscountRuleSchema>;
export type SwellFreeProductRule = z.infer<typeof swellFreeProductRuleSchema>;
export type SwellCartFixedAmountRule = z.infer<typeof swellCartFixedAmountRuleSchema>;
export type QuantityTierPrice = z.infer<typeof quantityTierPriceSchema>;
export type LandingQuantityTierFixedPriceRule = z.infer<typeof landingQuantityTierFixedPriceRuleSchema>;
export type LandingScopedProductDiscountRule = z.infer<typeof landingScopedProductDiscountRuleSchema>;
export type LandingFreeShippingRule = z.infer<typeof landingFreeShippingRuleSchema>;

export type HpnPromoRule =
  | Pa7CrossSellRule
  | RequiredVariantsFreeVariantsRule
  | RequiredProductWithFreeVariantsRule
  | TriggerProductDiscountedTargetsRule
  | LoyaltyTierRule
  | SubscriptionBundleGroupRule
  | OneTimePurchaseDiscountRule
  | SwellFreeProductRule
  | SwellCartFixedAmountRule
  | LandingQuantityTierFixedPriceRule
  | LandingScopedProductDiscountRule
  | LandingFreeShippingRule;

export type HpnPromoRuleId = HpnPromoRule["id"];
export type HpnPromoRuleType = HpnPromoRule["type"];

export interface HpnPromoConfig {
  version: 1;
  rules: HpnPromoRule[];
  combinesWith: {
    orderDiscounts: boolean;
    productDiscounts: boolean;
    shippingDiscounts: boolean;
  };
}
