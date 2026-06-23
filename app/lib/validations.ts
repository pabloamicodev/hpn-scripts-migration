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

export type HpnPromoRule =
  | Pa7CrossSellRule
  | RequiredVariantsFreeVariantsRule
  | RequiredProductWithFreeVariantsRule
  | TriggerProductDiscountedTargetsRule
  | LoyaltyTierRule;

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
