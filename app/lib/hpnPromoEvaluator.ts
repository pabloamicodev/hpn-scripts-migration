import type { HpnPromoConfig, HpnPromoRule, RuleConditions } from "./validations";

// ---------------------------------------------------------------------------
// Cart types
// ---------------------------------------------------------------------------

export interface CartLine {
  id: string;
  quantity: number;
  cost?: { totalAmount?: { amount: string } };
  sellingPlanAllocation?: { sellingPlan: { id: string } } | null;
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
      default:
        assertNever(rule);
    }

    allActions.push(...ruleActions);
  }

  return allActions;
}
