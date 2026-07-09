const EMPTY_RESULT = {
  operations: [],
};

const DELIVERY_DISCOUNT_SELECTION_STRATEGY = "ALL";
const LANDING_FREE_SHIPPING_RULE_TYPE = "landing_free_shipping";

/**
 * Landing Page Free Shipping: whenever any cart line carries the landing's
 * line item property, discounts every delivery group to 100% off — free
 * shipping for the whole order. Independent of the cart-lines target; reads
 * the same shared config metafield but only acts on landing_free_shipping
 * rules. `conditions` is intentionally not evaluated here (out of scope for
 * this rule — see validations.ts).
 */
export function cartDeliveryOptionsDiscountsGenerateRun(input) {
  const discountClasses = input?.discount?.discountClasses ?? [];
  if (!discountClasses.includes("SHIPPING")) return EMPTY_RESULT;

  let config;
  try {
    const value = input?.discount?.metafield?.value;
    if (!value) return EMPTY_RESULT;
    config = JSON.parse(value);
  } catch {
    return EMPTY_RESULT;
  }

  if (!Array.isArray(config?.rules) || config.rules.length === 0) return EMPTY_RESULT;

  const lines = input?.cart?.lines ?? [];
  const deliveryGroups = input?.cart?.deliveryGroups ?? [];
  if (deliveryGroups.length === 0) return EMPTY_RESULT;

  for (const rule of config.rules) {
    if (!rule || typeof rule !== "object" || rule.type !== LANDING_FREE_SHIPPING_RULE_TYPE) continue;
    if (!rule.enabled) continue;
    if (!rule.requiredLineAttributeKey || !rule.requiredLineAttributeValue) continue;

    const isTagged = lines.some(
      (line) => line.landingSourceAttribute?.value === rule.requiredLineAttributeValue,
    );
    if (!isTagged) continue;

    return {
      operations: [
        {
          deliveryDiscountsAdd: {
            candidates: deliveryGroups.map((group) => ({
              message: rule.message ?? "",
              targets: [{ deliveryGroup: { id: group.id } }],
              value: { percentage: { value: "100" } },
            })),
            selectionStrategy: DELIVERY_DISCOUNT_SELECTION_STRATEGY,
          },
        },
      ],
    };
  }

  return EMPTY_RESULT;
}

export const run = cartDeliveryOptionsDiscountsGenerateRun;
