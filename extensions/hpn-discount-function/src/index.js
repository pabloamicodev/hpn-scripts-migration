// @ts-check

const EMPTY_RESULT = {
  discounts: [],
  discountApplicationStrategy: "ALL",
};

/**
 * Entry point called by Shopify at checkout with the cart and metafield config.
 * @param {object} input
 * @returns {{ discounts: object[], discountApplicationStrategy: string }}
 */
export function run(input) {
  // --- Parse config from metafield ---
  let config;
  try {
    const value = input?.discountNode?.metafield?.value;
    if (!value) return EMPTY_RESULT;
    config = JSON.parse(value);
  } catch {
    return EMPTY_RESULT;
  }

  if (!Array.isArray(config?.rules) || config.rules.length === 0) {
    return EMPTY_RESULT;
  }

  // --- Index cart lines by product ID and variant ID ---
  const lines = (input.cart?.lines ?? []).filter(
    (l) => l.merchandise?.__typename === "ProductVariant"
  );

  /** @type {Map<string, object[]>} */
  const byProduct = new Map();
  /** @type {Map<string, object[]>} */
  const byVariant = new Map();

  for (const line of lines) {
    const productId = line.merchandise.product.id;
    const variantId = line.merchandise.id;

    if (!byProduct.has(productId)) byProduct.set(productId, []);
    byProduct.get(productId).push(line);

    if (!byVariant.has(variantId)) byVariant.set(variantId, []);
    byVariant.get(variantId).push(line);
  }

  // --- Evaluate each enabled rule ---
  /** @type {object[]} */
  const discounts = [];

  for (const rule of config.rules) {
    if (!rule.enabled) continue;

    if (rule.type === "pa7_cross_sell") {
      applyPa7Rule(rule, byProduct, discounts);
    } else if (rule.type === "required_variants_free_variants") {
      applyPlantaRule(rule, byVariant, discounts);
    } else if (rule.type === "required_product_with_free_variants") {
      applyPouchesRule(rule, byProduct, byVariant, discounts);
    }
  }

  if (discounts.length === 0) return EMPTY_RESULT;

  return {
    discounts,
    discountApplicationStrategy: "ALL",
  };
}

/**
 * PA7 Cross-Sell: when PA7 is in cart, apply X% off to C2/T5 lines with qty === 1.
 */
function applyPa7Rule(rule, byProduct, discounts) {
  const triggerLines = byProduct.get(rule.triggerProductId);
  if (!triggerLines?.length) return;

  for (const targetProductId of rule.targetProductIds) {
    const targetLines = byProduct.get(targetProductId) ?? [];

    for (const line of targetLines) {
      if (line.quantity !== rule.targetLineQuantityEquals) continue;

      discounts.push({
        targets: [{ cartLine: { id: line.id } }],
        value: { percentage: { value: String(rule.discountPercentage) } },
        message: rule.message,
      });
    }
  }
}

/**
 * NAD3 Single + Planta Samples: all required variants must be present,
 * then free variants get 100% off (optionally capped to freeQuantityPerLine).
 */
function applyPlantaRule(rule, byVariant, discounts) {
  // All required variants must be in cart
  for (const requiredId of rule.requiredVariantIds) {
    if (!byVariant.get(requiredId)?.length) return;
  }

  for (const freeId of rule.freeVariantIds) {
    const freeLines = byVariant.get(freeId) ?? [];

    for (const line of freeLines) {
      const cap = rule.freeQuantityPerLine;
      const target =
        cap !== null && cap < line.quantity
          ? { cartLine: { id: line.id, quantity: cap } }
          : { cartLine: { id: line.id } };

      discounts.push({
        targets: [target],
        value: { percentage: { value: "100.0" } },
        message: rule.message,
      });
    }
  }
}

/**
 * NAD3 240 + Pouches: trigger product AND both pouch variants must be present.
 * Only 1 unit per pouch line is free (freeQuantityPerLine = 1).
 */
function applyPouchesRule(rule, byProduct, byVariant, discounts) {
  const triggerLines = byProduct.get(rule.triggerProductId);
  if (!triggerLines?.length) return;

  // All required variants must be in cart
  for (const requiredId of rule.requiredVariantIds) {
    if (!byVariant.get(requiredId)?.length) return;
  }

  for (const freeId of rule.freeVariantIds) {
    const freeLines = byVariant.get(freeId) ?? [];

    for (const line of freeLines) {
      discounts.push({
        targets: [{ cartLine: { id: line.id, quantity: rule.freeQuantityPerLine } }],
        value: { percentage: { value: "100.0" } },
        message: rule.message,
      });
    }
  }
}
