import type { HpnPromoConfig, HpnPromoRule } from "./validations";

// Types for cart simulation
export interface CartLine {
  id: string;
  quantity: number;
  merchandise: {
    __typename: "ProductVariant";
    id: string;
    product: {
      id: string;
    };
  };
}

export interface DiscountAction {
  lineId: string;
  variantId: string;
  productId: string;
  discountedQuantity: number;
  percentageOff: number;
  message: string;
}

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

    if (!linesByProductId.has(productId)) {
      linesByProductId.set(productId, []);
    }
    linesByProductId.get(productId)!.push(line);

    if (!linesByVariantId.has(variantId)) {
      linesByVariantId.set(variantId, []);
    }
    linesByVariantId.get(variantId)!.push(line);
  }

  return { linesByProductId, linesByVariantId };
}

export function evaluatePa7CrossSell(
  rule: Extract<HpnPromoRule, { type: "pa7_cross_sell" }>,
  cartIndex: CartIndex
): DiscountAction[] {
  const actions: DiscountAction[] = [];

  if (!rule.enabled) return actions;

  // Check if trigger product is in cart
  const triggerLines = cartIndex.linesByProductId.get(rule.triggerProductId);
  if (!triggerLines || triggerLines.length === 0) return actions;

  // For each target product, check if it's in cart with exact quantity
  for (const targetProductId of rule.targetProductIds) {
    const targetLines = cartIndex.linesByProductId.get(targetProductId);
    if (!targetLines) continue;

    for (const line of targetLines) {
      // Only apply when line quantity exactly equals the configured value
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
  cartIndex: CartIndex
): DiscountAction[] {
  const actions: DiscountAction[] = [];

  if (!rule.enabled) return actions;

  // Check ALL required variants are present
  for (const requiredVariantId of rule.requiredVariantIds) {
    const requiredLines = cartIndex.linesByVariantId.get(requiredVariantId);
    if (!requiredLines || requiredLines.length === 0) return actions;
  }

  // All required variants present, now discount free variants
  for (const freeVariantId of rule.freeVariantIds) {
    const freeLines = cartIndex.linesByVariantId.get(freeVariantId);
    const line = freeLines?.[0];
    if (!line) continue;

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

export function evaluateRequiredProductWithFreeVariants(
  rule: Extract<HpnPromoRule, { type: "required_product_with_free_variants" }>,
  cartIndex: CartIndex
): DiscountAction[] {
  const actions: DiscountAction[] = [];

  if (!rule.enabled) return actions;

  // Check trigger product is in cart
  const triggerLines = cartIndex.linesByProductId.get(rule.triggerProductId);
  if (!triggerLines || triggerLines.length === 0) return actions;

  // Check ALL required variants are present
  for (const requiredVariantId of rule.requiredVariantIds) {
    const requiredLines = cartIndex.linesByVariantId.get(requiredVariantId);
    if (!requiredLines || requiredLines.length === 0) return actions;
  }

  // Discount free variants with quantity cap
  for (const freeVariantId of rule.freeVariantIds) {
    const freeLines = cartIndex.linesByVariantId.get(freeVariantId);
    if (!freeLines) continue;

    for (const line of freeLines) {
      if (line.quantity !== 1) continue;

      actions.push({
        lineId: line.id,
        variantId: line.merchandise.id,
        productId: line.merchandise.product.id,
        discountedQuantity: 1,
        percentageOff: 100,
        message: rule.message,
      });
    }
  }

  return actions;
}

export function evaluateConfig(
  config: HpnPromoConfig,
  lines: CartLine[]
): DiscountAction[] {
  if (!config || !config.rules) return [];

  const cartIndex = buildCartIndex(lines);
  const allActions: DiscountAction[] = [];

  for (const rule of config.rules) {
    if (!rule.enabled) continue;

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
    }

    allActions.push(...ruleActions);
  }

  return allActions;
}
