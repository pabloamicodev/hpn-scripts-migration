import { z } from "zod";

const productGidSchema = z
  .string()
  .trim()
  .startsWith("gid://shopify/Product/");

const variantGidSchema = z
  .string()
  .trim()
  .startsWith("gid://shopify/ProductVariant/");

export const pa7CrossSellRuleSchema = z.object({
  id: z.literal("pa7-cross-sell"),
  type: z.literal("pa7_cross_sell"),
  enabled: z.boolean(),
  triggerProductId: productGidSchema,
  targetProductIds: z.array(productGidSchema).min(1),
  targetLineQuantityEquals: z.number().int().positive(),
  discountPercentage: z.number().positive().max(100),
  message: z.string().trim().min(1),
});

export const requiredVariantsFreeVariantsRuleSchema = z.object({
  id: z.literal("nad3-single-planta-samples"),
  type: z.literal("required_variants_free_variants"),
  enabled: z.boolean(),
  requiredVariantIds: z.array(variantGidSchema).min(1),
  freeVariantIds: z.array(variantGidSchema).min(1),
  freeQuantityPerLine: z.number().int().positive().nullable(),
  message: z.string().trim().min(1),
});

export const requiredProductWithFreeVariantsRuleSchema = z.object({
  id: z.literal("nad3-240-pouches"),
  type: z.literal("required_product_with_free_variants"),
  enabled: z.boolean(),
  triggerProductId: productGidSchema,
  requiredVariantIds: z.array(variantGidSchema).min(1),
  freeVariantIds: z.array(variantGidSchema).min(1),
  freeQuantityPerLine: z.literal(1),
  message: z.string().trim().min(1),
});

export const hpnPromoRuleSchema = z.discriminatedUnion("type", [
  pa7CrossSellRuleSchema,
  requiredVariantsFreeVariantsRuleSchema,
  requiredProductWithFreeVariantsRuleSchema,
]);

export const hpnPromoConfigSchema = z.object({
  version: z.literal(1),
  rules: z.array(hpnPromoRuleSchema).min(1),
  combinesWith: z.object({
    orderDiscounts: z.boolean(),
    productDiscounts: z.boolean(),
    shippingDiscounts: z.boolean(),
  }),
});

export type Pa7CrossSellRule = z.infer<typeof pa7CrossSellRuleSchema>;

export type RequiredVariantsFreeVariantsRule = z.infer<
  typeof requiredVariantsFreeVariantsRuleSchema
>;

export type RequiredProductWithFreeVariantsRule = z.infer<
  typeof requiredProductWithFreeVariantsRuleSchema
>;

export type HpnPromoRule =
  | Pa7CrossSellRule
  | RequiredVariantsFreeVariantsRule
  | RequiredProductWithFreeVariantsRule;

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
