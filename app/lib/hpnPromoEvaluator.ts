import type { HpnPromoConfig, HpnPromoRule, RuleConditions } from "./validations";

// ---------------------------------------------------------------------------
// Cart types
// ---------------------------------------------------------------------------

export interface CartLine {
  id: string;
  quantity: number;
  cost?: { totalAmount?: { amount: string }; amountPerQuantity?: { amount: string } };
  sellingPlanAllocation?: { sellingPlan: { id: string } } | null;
  attributes?: Array<{ key: string; value: string | null }>;
  merchandise: {
    __typename: "ProductVariant";
    id: string;
    product: { id: string; tags?: string[] };
  };
}

export interface CartEvalContext {
  /** Cart subtotal in dollars (e.g. 75.00) */
  subtotalAmount?: number;
  /** Cart attributes set via Storefront API */
  attributes?: Array<{ key: string; value: string | null }>;
  /** True if at least one cart line has a selling plan (subscription) */
  hasSubscriptionItem?: boolean;
  /** Number of past orders for the logged-in customer; undefined = guest */
  customerNumberOfOrders?: number;
}

export interface DiscountAction {
  lineId: string;
  variantId: string;
  productId: string;
  discountedQuantity: number;
  percentageOff: number;
  message: string;
}

// ---------------------------------------------------------------------------
// Internal indexes
// ---------------------------------------------------------------------------

interface CartIndex {
  linesByProductId: Map<string, CartLine[]>;
  linesByVariantId: Map<string, CartLine[]>;
}

export function buildCartIndex(lines: CartLine[]): CartIndex {
  const linesByProductId = new Map<string, CartLine[]>();
  const linesByVariantId = new Map<string, CartLine[]>();

  for (const line of lines) {
    if (line.merchandise.__typename !== "ProductVariant") continue;

    const productId = line.merchandise.product.id;
    const variantId = line.merchandise.id;

    if (!linesByProductId.has(productId)) linesByProductId.set(productId, []);
    linesByProductId.get(productId)!.push(line);

    if (!linesByVariantId.has(variantId)) linesByVariantId.set(variantId, []);
    linesByVariantId.get(variantId)!.push(line);
  }

  return { linesByProductId, linesByVariantId };
}

// ---------------------------------------------------------------------------
// Global condition guard
// ---------------------------------------------------------------------------

function checkConditions(
  conditions: RuleConditions,
  context: CartEvalContext,
): boolean {
  if (!conditions) return true;

  if (conditions.minimumCartSubtotal != null) {
    if ((context.subtotalAmount ?? 0) < conditions.minimumCartSubtotal) return false;
  }

  if (conditions.requiredCartAttributeKey) {
    const attr = (context.attributes ?? []).find(
      (a) => a.key === conditions.requiredCartAttributeKey,
    );
    if (!attr) return false;
    if (
      conditions.requiredCartAttributeValue != null &&
      attr.value !== conditions.requiredCartAttributeValue
    ) {
      return false;
    }
  }

  if (conditions.requiresSubscriptionInCart) {
    if (!context.hasSubscriptionItem) return false;
  }

  return true;
}

// ---------------------------------------------------------------------------
// Rule evaluators
// ---------------------------------------------------------------------------

export function evaluatePa7CrossSell(
  rule: Extract<HpnPromoRule, { type: "pa7_cross_sell" }>,
  cartIndex: CartIndex,
): DiscountAction[] {
  const actions: DiscountAction[] = [];

  const triggerLines = cartIndex.linesByProductId.get(rule.triggerProductId);
  if (!triggerLines?.length) return actions;

  for (const targetProductId of rule.targetProductIds) {
    const targetLines = cartIndex.linesByProductId.get(targetProductId);
    if (!targetLines) continue;

    for (const line of targetLines) {
      if (line.quantity !== rule.targetLineQuantityEquals) continue;
      actions.push({
        lineId: line.id,
        variantId: line.merchandise.id,
        productId: line.merchandise.product.id,
        discountedQuantity: line.quantity,
        percentageOff: rule.discountPercentage,
        message: rule.message,
      });
    }
  }

  return actions;
}

export function evaluateRequiredVariantsFreeVariants(
  rule: Extract<HpnPromoRule, { type: "required_variants_free_variants" }>,
  cartIndex: CartIndex,
): DiscountAction[] {
  const actions: DiscountAction[] = [];

  for (const requiredVariantId of rule.requiredVariantIds) {
    if (!cartIndex.linesByVariantId.get(requiredVariantId)?.length) return actions;
  }

  for (const freeVariantId of rule.freeVariantIds) {
    const line = cartIndex.linesByVariantId.get(freeVariantId)?.[0];
    if (!line) continue;
    actions.push({
      lineId: line.id,
      variantId: line.merchandise.id,
      productId: line.merchandise.product.id,
      discountedQuantity: Math.min(rule.freeQuantityPerLine, line.quantity),
      percentageOff: rule.discountPercentage,
      message: rule.message,
    });
  }

  return actions;
}

export function evaluateRequiredProductWithFreeVariants(
  rule: Extract<HpnPromoRule, { type: "required_product_with_free_variants" }>,
  cartIndex: CartIndex,
): DiscountAction[] {
  const actions: DiscountAction[] = [];

  const triggerLines = cartIndex.linesByProductId.get(rule.triggerProductId);
  if (!triggerLines?.length) return actions;

  for (const requiredVariantId of rule.requiredVariantIds) {
    if (!cartIndex.linesByVariantId.get(requiredVariantId)?.length) return actions;
  }

  for (const freeVariantId of rule.freeVariantIds) {
    const freeLines = cartIndex.linesByVariantId.get(freeVariantId);
    if (!freeLines) continue;

    for (const line of freeLines) {
      const discountedQty = Math.min(rule.freeQuantityPerLine, line.quantity);
      actions.push({
        lineId: line.id,
        variantId: line.merchandise.id,
        productId: line.merchandise.product.id,
        discountedQuantity: discountedQty,
        percentageOff: rule.discountPercentage,
        message: rule.message,
      });
    }
  }

  return actions;
}

export function evaluateTriggerProductDiscountedTargets(
  rule: Extract<HpnPromoRule, { type: "trigger_product_discounted_targets" }>,
  cartIndex: CartIndex,
): DiscountAction[] {
  const actions: DiscountAction[] = [];

  const triggerLines = cartIndex.linesByProductId.get(rule.triggerProductId);
  if (!triggerLines?.length) return actions;

  for (const target of rule.targets) {
    const targetLines = cartIndex.linesByProductId.get(target.productId);
    if (!targetLines) continue;

    for (const line of targetLines) {
      actions.push({
        lineId: line.id,
        variantId: line.merchandise.id,
        productId: line.merchandise.product.id,
        discountedQuantity: line.quantity,
        percentageOff: target.discountPercentage,
        message: rule.message,
      });
    }
  }

  return actions;
}

export function evaluateLoyaltyTier(
  rule: Extract<HpnPromoRule, { type: "loyalty_tier" }>,
  cartIndex: CartIndex,
  context: CartEvalContext,
): DiscountAction[] {
  const actions: DiscountAction[] = [];

  // Guest customers don't qualify — numberOfOrders must be known
  if (context.customerNumberOfOrders == null) return actions;

  const numberOfOrders = context.customerNumberOfOrders;

  // Sort tiers highest-first; pick the first one where customer qualifies
  const sortedTiers = [...rule.tiers].sort((a, b) => b.minOrders - a.minOrders);
  const activeTier = sortedTiers.find((t) => numberOfOrders >= t.minOrders);
  if (!activeTier) return actions;

  for (const productId of rule.targetProductIds) {
    const lines = cartIndex.linesByProductId.get(productId);
    if (!lines) continue;

    for (const line of lines) {
      actions.push({
        lineId: line.id,
        variantId: line.merchandise.id,
        productId: line.merchandise.product.id,
        discountedQuantity: line.quantity,
        percentageOff: activeTier.discountPercentage,
        message: rule.message,
      });
    }
  }

  return actions;
}

export function evaluateSubscriptionBundleGroup(
  rule: Extract<HpnPromoRule, { type: "subscription_bundle_group" }>,
  lines: CartLine[],
): DiscountAction[] {
  const actions: DiscountAction[] = [];
  const targetProductIds = new Set(rule.targetProductIds);
  let unitsDiscounted = 0;

  for (const line of lines) {
    if (unitsDiscounted >= rule.maxUnitsTotal) break;
    if (line.merchandise.__typename !== "ProductVariant") continue;

    const productId = line.merchandise.product.id;
    if (!targetProductIds.has(productId)) continue;

    if (!line.sellingPlanAllocation?.sellingPlan?.id) continue;

    if (rule.requiredLineAttributeKey) {
      const attrs = line.attributes ?? [];
      const attr = attrs.find((a) => a.key === rule.requiredLineAttributeKey);
      if (!attr) continue;
      if (rule.requiredLineAttributeValue != null && attr.value !== rule.requiredLineAttributeValue) continue;
    }

    const qtyToDiscount = Math.min(rule.maxUnitsTotal - unitsDiscounted, line.quantity);
    unitsDiscounted += qtyToDiscount;
    actions.push({
      lineId: line.id,
      variantId: line.merchandise.id,
      productId,
      discountedQuantity: qtyToDiscount,
      percentageOff: rule.discountPercentage,
      message: rule.message,
    });
  }

  return actions;
}

export function evaluateOneTimePurchaseDiscount(
  rule: Extract<HpnPromoRule, { type: "one_time_purchase_discount" }>,
  cartIndex: CartIndex,
): DiscountAction[] {
  const actions: DiscountAction[] = [];

  for (const variantId of rule.targetVariantIds) {
    const lines = cartIndex.linesByVariantId.get(variantId);
    if (!lines) continue;

    for (const line of lines) {
      if (line.sellingPlanAllocation?.sellingPlan?.id) continue;
      actions.push({
        lineId: line.id,
        variantId: line.merchandise.id,
        productId: line.merchandise.product.id,
        discountedQuantity: 1,
        percentageOff: rule.discountPercentage,
        message: rule.message,
      });
    }
  }

  return actions;
}

export function evaluateSwellFreeProduct(
  rule: Extract<HpnPromoRule, { type: "swell_free_product" }>,
  lines: CartLine[],
): DiscountAction[] {
  const actions: DiscountAction[] = [];
  for (const line of lines) {
    if (line.merchandise.__typename !== "ProductVariant") continue;
    const attrs = line.attributes ?? [];
    const discountType = attrs.find((a) => a.key === "_swell_discount_type")?.value;
    if (discountType !== "product") continue;
    actions.push({
      lineId: line.id,
      variantId: line.merchandise.id,
      productId: line.merchandise.product.id,
      discountedQuantity: 1,
      percentageOff: 100,
      message: rule.message,
    });
  }
  return actions;
}

export function evaluateSwellCartFixedAmount(
  rule: Extract<HpnPromoRule, { type: "swell_cart_fixed_amount" }>,
  lines: CartLine[],
): DiscountAction[] {
  const actions: DiscountAction[] = [];

  const freeProductLineIds = new Set<string>();
  let totalDiscountCents = 0;

  for (const line of lines) {
    const attrs = line.attributes ?? [];
    const discountType = attrs.find((a) => a.key === "_swell_discount_type")?.value;
    if (discountType === "product") freeProductLineIds.add(line.id);
    if (discountType === "cart_fixed_amount") {
      const amountStr = attrs.find((a) => a.key === "_swell_discount_amount_cents")?.value;
      const amount = parseInt(amountStr ?? "0", 10);
      if (!isNaN(amount) && amount > 0) totalDiscountCents += amount;
    }
  }

  if (totalDiscountCents <= 0) return actions;

  const eligibleLines = lines.filter(
    (l) => l.merchandise.__typename === "ProductVariant" && !freeProductLineIds.has(l.id),
  );
  if (eligibleLines.length === 0) return actions;

  const eligibleCartCents = eligibleLines.reduce((sum, line) => {
    return sum + Math.round(parseFloat(line.cost?.totalAmount?.amount ?? "0") * 100);
  }, 0);
  if (eligibleCartCents <= 0) return actions;

  for (const line of eligibleLines) {
    const lineCents = Math.round(parseFloat(line.cost?.totalAmount?.amount ?? "0") * 100);
    if (lineCents <= 0) continue;
    const lineDiscountCents = Math.floor((lineCents * totalDiscountCents) / eligibleCartCents);
    if (lineDiscountCents <= 0) continue;
    const percentageOff = Math.min((lineDiscountCents / lineCents) * 100, 100);
    actions.push({
      lineId: line.id,
      variantId: line.merchandise.id,
      productId: line.merchandise.product.id,
      discountedQuantity: line.quantity,
      percentageOff,
      message: rule.message,
    });
  }
  return actions;
}

export function evaluateLandingQuantityTierFixedPrice(
  rule: Extract<HpnPromoRule, { type: "landing_quantity_tier_fixed_price" }>,
  lines: CartLine[],
): DiscountAction[] {
  const actions: DiscountAction[] = [];
  const targetVariantIds = new Set(rule.targetVariantIds);

  const matchingLines = lines.filter((line) => {
    if (line.merchandise.__typename !== "ProductVariant") return false;
    if (!targetVariantIds.has(line.merchandise.id)) return false;
    const attr = (line.attributes ?? []).find((a) => a.key === rule.requiredLineAttributeKey);
    if (attr?.value !== rule.requiredLineAttributeValue) return false;
    if (typeof rule.requiresSubscription === "boolean") {
      const isSubscription = Boolean(line.sellingPlanAllocation?.sellingPlan?.id);
      if (isSubscription !== rule.requiresSubscription) return false;
    }
    return true;
  });
  if (matchingLines.length === 0) return actions;

  const totalQuantity = matchingLines.reduce((sum, line) => sum + line.quantity, 0);
  const tier = [...rule.tiers]
    .sort((a, b) => b.quantity - a.quantity)
    .find((t) => totalQuantity >= t.quantity);
  if (!tier) return actions;

  for (const line of matchingLines) {
    const currentPerUnit = parseFloat(line.cost?.amountPerQuantity?.amount ?? "");
    if (isNaN(currentPerUnit) || currentPerUnit <= 0) continue;
    const discountPerUnit = currentPerUnit - tier.targetPricePerUnit;
    if (discountPerUnit <= 0) continue;
    actions.push({
      lineId: line.id,
      variantId: line.merchandise.id,
      productId: line.merchandise.product.id,
      discountedQuantity: line.quantity,
      // Fixed-amount discount expressed as an effective % for preview purposes.
      percentageOff: Math.min((discountPerUnit / currentPerUnit) * 100, 100),
      message: rule.message,
    });
  }

  return actions;
}

function getLineAttribute(line: CartLine, key: string): string | null | undefined {
  return (line.attributes ?? []).find((a) => a.key === key)?.value;
}

function getLandingAnchorQuantity(
  rule: Extract<
    HpnPromoRule,
    { type: "landing_scoped_product_discount" | "landing_free_shipping" }
  >,
  lines: CartLine[],
): number {
  const anchorVariantIds = rule.requiredAnchorVariantIds?.length
    ? new Set(rule.requiredAnchorVariantIds)
    : null;

  return lines.reduce((sum, line) => {
    if (line.merchandise.__typename !== "ProductVariant") return sum;
    if (getLineAttribute(line, rule.requiredLineAttributeKey) !== rule.requiredLineAttributeValue) {
      return sum;
    }
    if (anchorVariantIds && !anchorVariantIds.has(line.merchandise.id)) return sum;
    return sum + line.quantity;
  }, 0);
}

function satisfiesLandingAnchorRequirement(
  rule: Extract<
    HpnPromoRule,
    { type: "landing_scoped_product_discount" | "landing_free_shipping" }
  >,
  lines: CartLine[],
): boolean {
  return getLandingAnchorQuantity(rule, lines) >= (rule.requiredAnchorMinQuantity ?? 1);
}

export function evaluateLandingScopedProductDiscount(
  rule: Extract<HpnPromoRule, { type: "landing_scoped_product_discount" }>,
  cartIndex: CartIndex,
  allLines: CartLine[],
): DiscountAction[] {
  const actions: DiscountAction[] = [];

  if (!satisfiesLandingAnchorRequirement(rule, allLines)) return actions;

  for (const productId of rule.targetProductIds) {
    const lines = cartIndex.linesByProductId.get(productId);
    if (!lines) continue;

    let remainingFreeUnits = 1;
    for (const line of lines) {
      if (remainingFreeUnits <= 0) break;
      if (getLineAttribute(line, rule.requiredLineAttributeKey) !== rule.requiredLineAttributeValue) continue;
      actions.push({
        lineId: line.id,
        variantId: line.merchandise.id,
        productId: line.merchandise.product.id,
        discountedQuantity: 1,
        percentageOff: rule.discountPercentage,
        message: rule.message,
      });
      remainingFreeUnits -= 1;
    }
  }

  return actions;
}

// landing_free_shipping affects delivery cost, not cart lines — it's
// evaluated by a separate Function target (deliveryRun.js) and has no
// PRODUCT-class discount actions to preview here.
export function evaluateLandingFreeShipping(
  _rule: Extract<HpnPromoRule, { type: "landing_free_shipping" }>,
): DiscountAction[] {
  return [];
}

// quiz_bundle_free_shipping — same reasoning as landing_free_shipping above:
// delivery cost, not cart lines, evaluated by cartDeliveryOptionsDiscountsGenerateRun.
export function evaluateQuizBundleFreeShipping(
  _rule: Extract<HpnPromoRule, { type: "quiz_bundle_free_shipping" }>,
): DiscountAction[] {
  return [];
}

/**
 * Quiz Bundle Price Match + Free Gifts: groups lines by _quiz_bundle_id,
 * discounts _quiz_free_gift lines to (default 100%) free, and discounts the
 * remaining paid lines in the group down to that group's _quiz_target_cents
 * total. The real Function applies the paid-line discount as one combined
 * fixedAmount candidate; here it's expressed as an equivalent effective
 * percentage per line, matching how the fixed-amount landing tier rule above
 * is previewed.
 */
export function evaluateQuizBundlePriceMatch(
  rule: Extract<HpnPromoRule, { type: "quiz_bundle_price_match" }>,
  lines: CartLine[],
): DiscountAction[] {
  const actions: DiscountAction[] = [];

  const groups = new Map<
    string,
    { paid: CartLine[]; gifts: CartLine[]; targetCents: number | null; expectedPaidCount: number | null }
  >();

  for (const line of lines) {
    if (line.merchandise.__typename !== "ProductVariant") continue;
    const bundleId = getLineAttribute(line, "_quiz_bundle_id");
    if (!bundleId) continue;

    if (!groups.has(bundleId)) {
      groups.set(bundleId, { paid: [], gifts: [], targetCents: null, expectedPaidCount: null });
    }
    const group = groups.get(bundleId)!;

    if (getLineAttribute(line, "_quiz_free_gift") === "true") {
      group.gifts.push(line);
    } else {
      group.paid.push(line);
    }

    if (group.targetCents == null) {
      const raw = getLineAttribute(line, "_quiz_target_cents");
      const parsed = raw != null ? parseInt(raw, 10) : NaN;
      if (!isNaN(parsed)) group.targetCents = parsed;
    }

    if (group.expectedPaidCount == null) {
      const raw = getLineAttribute(line, "_quiz_expected_paid_count");
      const parsed = raw != null ? parseInt(raw, 10) : NaN;
      if (!isNaN(parsed)) group.expectedPaidCount = parsed;
    }
  }

  for (const group of groups.values()) {
    // Same gate as the real Function: every originally-added paid line must
    // still be present before this group gets any discount at all.
    if (group.expectedPaidCount == null || group.paid.length < group.expectedPaidCount) continue;

    for (const line of group.gifts) {
      actions.push({
        lineId: line.id,
        variantId: line.merchandise.id,
        productId: line.merchandise.product.id,
        discountedQuantity: line.quantity,
        percentageOff: rule.discountPercentageOnGifts,
        message: rule.message,
      });
    }

    if (group.paid.length === 0 || group.targetCents == null) continue;

    const currentTotal = group.paid.reduce(
      (sum, line) => sum + parseFloat(line.cost?.totalAmount?.amount ?? "0"),
      0,
    );
    const targetAmount = group.targetCents / 100;
    const discountNeeded = currentTotal - targetAmount;
    if (discountNeeded <= 0 || currentTotal <= 0) continue;

    const effectivePercentage = Math.min((discountNeeded / currentTotal) * 100, 100);
    for (const line of group.paid) {
      actions.push({
        lineId: line.id,
        variantId: line.merchandise.id,
        productId: line.merchandise.product.id,
        discountedQuantity: line.quantity,
        percentageOff: effectivePercentage,
        message: rule.message,
      });
    }
  }

  return actions;
}

// ---------------------------------------------------------------------------
// Exhaustiveness guard — TypeScript will error here if a new rule type is
// added to HpnPromoRule but not handled in evaluateConfig's switch.
// ---------------------------------------------------------------------------

function assertNever(x: never): never {
  throw new Error(`Unhandled rule type: ${String((x as { type?: unknown }).type)}`);
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export function evaluateConfig(
  config: HpnPromoConfig,
  lines: CartLine[],
  context: CartEvalContext = {},
): DiscountAction[] {
  if (!config?.rules) return [];

  const cartIndex = buildCartIndex(lines);
  const allActions: DiscountAction[] = [];

  for (const rule of config.rules) {
    if (!rule.enabled) continue;
    if (!checkConditions(rule.conditions, context)) continue;

    let ruleActions: DiscountAction[] = [];

    switch (rule.type) {
      case "pa7_cross_sell":
        ruleActions = evaluatePa7CrossSell(rule, cartIndex);
        break;
      case "required_variants_free_variants":
        ruleActions = evaluateRequiredVariantsFreeVariants(rule, cartIndex);
        break;
      case "required_product_with_free_variants":
        ruleActions = evaluateRequiredProductWithFreeVariants(rule, cartIndex);
        break;
      case "trigger_product_discounted_targets":
        ruleActions = evaluateTriggerProductDiscountedTargets(rule, cartIndex);
        break;
      case "loyalty_tier":
        ruleActions = evaluateLoyaltyTier(rule, cartIndex, context);
        break;
      case "subscription_bundle_group":
        ruleActions = evaluateSubscriptionBundleGroup(rule, lines);
        break;
      case "one_time_purchase_discount":
        ruleActions = evaluateOneTimePurchaseDiscount(rule, cartIndex);
        break;
      case "swell_free_product":
        ruleActions = evaluateSwellFreeProduct(rule, lines);
        break;
      case "swell_cart_fixed_amount":
        ruleActions = evaluateSwellCartFixedAmount(rule, lines);
        break;
      case "landing_quantity_tier_fixed_price":
        ruleActions = evaluateLandingQuantityTierFixedPrice(rule, lines);
        break;
      case "landing_scoped_product_discount":
        ruleActions = evaluateLandingScopedProductDiscount(rule, cartIndex, lines);
        break;
      case "landing_free_shipping":
        ruleActions = evaluateLandingFreeShipping(rule);
        break;
      case "quiz_bundle_price_match":
        ruleActions = evaluateQuizBundlePriceMatch(rule, lines);
        break;
      case "quiz_bundle_free_shipping":
        ruleActions = evaluateQuizBundleFreeShipping(rule);
        break;
      default:
        assertNever(rule);
    }

    allActions.push(...ruleActions);
  }

  return allActions;
}
