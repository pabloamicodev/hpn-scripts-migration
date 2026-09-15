import { z } from "zod";

// ---------------------------------------------------------------------------
// Subscription cycle pricing — configures a Shopify Selling Plan Group whose
// price changes after the first billing cycle (e.g. 1st shipment full price,
// 2nd/3rd shipment discounted). This is a *separate* mechanism from the
// hpn-discount-function promo rules in validations.ts: those are evaluated by
// a cart Discount Function that only runs at checkout, so they can never see
// "this is the 2nd delivery of an existing subscription contract". Recurring
// subscription orders are priced directly from the Selling Plan's own pricing
// policies (frozen onto the contract at signup), so per-cycle pricing has to
// be configured on the Selling Plan itself via the Admin API.
// ---------------------------------------------------------------------------

export const productGidSchema = z
  .string()
  .trim()
  .startsWith("gid://shopify/Product/");

export const sellingPlanIntervalSchema = z.enum(["DAY", "WEEK", "MONTH", "YEAR"]);
export type SellingPlanInterval = z.infer<typeof sellingPlanIntervalSchema>;

export const cycleDiscountValueSchema = z
  .object({
    type: z.enum(["percentage", "fixed_amount"]),
    value: z.number().min(0),
  })
  .superRefine((discount, ctx) => {
    if (discount.type === "percentage" && discount.value > 100) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Percentage discount cannot exceed 100.",
        path: ["value"],
      });
    }
  });
export type CycleDiscountValue = z.infer<typeof cycleDiscountValueSchema>;

export const subscriptionCyclePricingPlanInputSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  intervalUnit: sellingPlanIntervalSchema,
  intervalCount: z.number().int().positive(),
  // Total number of billing cycles for the whole plan (e.g. 3 for a 3-month
  // plan billed monthly). The recurring discount below applies from cycle 2
  // through this last cycle — there's no cycle after this one to fall back
  // to full price.
  totalCycles: z.number().int().positive(),
  // Applies to the 1st cycle only. Defaults to full price (0% off) but is
  // fully configurable — a merchant could just as well front-load the
  // discount instead.
  firstCycleDiscount: cycleDiscountValueSchema,
  // Applies from the 2nd cycle onward (afterCycle: 1 on the Selling Plan).
  recurringDiscount: cycleDiscountValueSchema,
  productIds: z
    .array(productGidSchema)
    .min(1, "Choose at least one product")
    .refine((ids) => new Set(ids).size === ids.length, {
      message: "Duplicate product — each product can only be added once.",
    }),
});
export type SubscriptionCyclePricingPlanInput = z.infer<
  typeof subscriptionCyclePricingPlanInputSchema
>;

export interface SubscriptionCyclePricingPlan
  extends SubscriptionCyclePricingPlanInput {
  /** Selling Plan Group gid. */
  id: string;
  /** The single child Selling Plan gid this feature manages within the group. */
  sellingPlanId: string;
  /** Product gid -> title, for display in the admin UI. */
  productTitlesById: Record<string, string>;
}
