import { z } from "zod";

// ---------------------------------------------------------------------------
// Skio shipping-per-cycle tiers.
//
// Skio (not us, not native Shopify Selling Plans) owns the subscription
// contracts for these products — see subscriptionCyclePricing.ts for why we
// can't touch them via Shopify's Admin API (write_own_subscription_contracts
// is scoped to contracts OUR app created). And per Shopify's own Discount
// Function docs, a checkout-time shipping discount function can't do
// per-cycle amounts either: "Any shipping discount applied to the origin
// order defaults to a 100% shipping discount on recurring orders, regardless
// of the original discount value" — so a graduated fee like $1.99 on cycles
// 2-3 is impossible through our own Function too. The only way to set a
// specific shipping fee on a specific renewal cycle is Skio's own API
// (setDeliveryPriceOverride, confirmed live to write precisely to the
// subscription's `deliveryPrice` field), acting on the subscription line
// before Skio bills it.
//
// A tier matches a Skio subscription by plan duration (months, converted
// from Skio's DAY-based BillingPolicy.intervalCount), subtotal range, and
// optionally specific product variants (Shopify GIDs — Skio's own
// ProductVariant.platformId is confirmed to store that exact GID, so no
// translation is needed). Once a tier matches, its cycleOverrides list gives
// the shipping override for specific cycle numbers (1-indexed); any cycle
// not explicitly listed falls back to defaultOverride.
// ---------------------------------------------------------------------------

export const productGidSchema = z
  .string()
  .trim()
  .startsWith("gid://shopify/ProductVariant/");

export const shippingOverrideSchema = z.object({
  // null = don't touch shipping for this cycle; let it charge Shopify's
  // normal calculated rate for the customer's address/cart.
  amount: z.number().min(0).nullable(),
});
export type ShippingOverride = z.infer<typeof shippingOverrideSchema>;

export const cycleOverrideSchema = z.object({
  cycle: z.number().int().positive(),
  override: shippingOverrideSchema,
});
export type CycleOverride = z.infer<typeof cycleOverrideSchema>;

export const skioShippingTierSchema = z
  .object({
    id: z
      .string()
      .trim()
      .min(1)
      .regex(/^[a-z0-9][a-z0-9-]*$/, "Use lowercase letters, numbers, and hyphens."),
    name: z.string().trim().min(1),
    // Which Skio subscription plans this tier applies to.
    subscriptionDurationMonths: z.number().int().positive(),
    minSubtotal: z.number().min(0).default(0),
    // null = no upper bound.
    maxSubtotal: z.number().min(0).nullable().default(null),
    // null/omitted = matches any product. When set, at least one of the
    // subscription's active lines must reference one of these variants.
    productVariantIds: z.array(productGidSchema).nullable().default(null),
    // Explicit overrides for specific cycle numbers (1-indexed). Any cycle
    // not listed here uses defaultOverride instead.
    cycleOverrides: z
      .array(cycleOverrideSchema)
      .default([])
      .refine((entries) => new Set(entries.map((e) => e.cycle)).size === entries.length, {
        message: "Each cycle number can only be listed once per tier.",
      }),
    defaultOverride: shippingOverrideSchema,
  })
  .refine((tier) => tier.maxSubtotal === null || tier.maxSubtotal > tier.minSubtotal, {
    message: "maxSubtotal must be greater than minSubtotal (or left empty for no upper bound).",
    path: ["maxSubtotal"],
  })
  .refine((tier) => tier.productVariantIds === null || tier.productVariantIds.length > 0, {
    message: "productVariantIds must either be omitted/null (matches any product) or contain at least one variant.",
    path: ["productVariantIds"],
  });
export type SkioShippingTier = z.infer<typeof skioShippingTierSchema>;

export const skioShippingTiersConfigSchema = z
  .object({
    tiers: z.array(skioShippingTierSchema),
  })
  .refine(
    (config) => new Set(config.tiers.map((t) => t.id)).size === config.tiers.length,
    { message: "Tier ids must be unique.", path: ["tiers"] },
  );
export type SkioShippingTiersConfig = z.infer<typeof skioShippingTiersConfigSchema>;
