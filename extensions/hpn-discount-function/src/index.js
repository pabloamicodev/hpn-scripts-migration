// @ts-check

const EMPTY_RESULT = {
  operations: [],
};

const PRODUCT_DISCOUNT_SELECTION_STRATEGY = "ALL";

/**
 * Entry point called by Shopify at checkout with the cart and metafield config.
 * @param {object} input
 * @returns {{ operations: object[] }}
 */
export function cartLinesDiscountsGenerateRun(input) {
  const discountClasses = input?.discount?.discountClasses ?? [];
  if (!discountClasses.includes("PRODUCT")) return EMPTY_RESULT;

  // --- Parse config from metafield ---
  let config;
  try {
    const value = input?.discount?.metafield?.value;
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
  const candidatesByLine = new Map();

  for (const rule of config.rules) {
    // Skip malformed entries (null, non-object, missing type) that could crash downstream.
    if (!rule || typeof rule !== "object" || typeof rule.type !== "string") continue;
    if (!rule.enabled) continue;

    if (rule.type === "pa7_cross_sell") {
      applyPa7Rule(rule, byProduct, candidatesByLine);
    } else if (rule.type === "required_variants_free_variants") {
      applyPlantaRule(rule, byVariant, candidatesByLine);
    } else if (rule.type === "required_product_with_free_variants") {
      applyPouchesRule(rule, byProduct, byVariant, candidatesByLine);
    }
  }

  const candidates = Array.from(candidatesByLine.values());
  if (candidates.length === 0) return EMPTY_RESULT;

  return {
    operations: [
      {
        productDiscountsAdd: {
          candidates,
          selectionStrategy: PRODUCT_DISCOUNT_SELECTION_STRATEGY,
        },
      },
    ],
  };
}

function addCandidate(candidatesByLine, line, quantity, percentage, message) {
  const candidate = {
    targets: [
      quantity === null
        ? { cartLine: { id: line.id } }
        : { cartLine: { id: line.id, quantity } },
    ],
    value: {
      percentage: { value: percentage === 100 ? "100.0" : String(percentage) },
    },
    message,
  };
  const existing = candidatesByLine.get(line.id);
  if (!existing) {
    candidatesByLine.set(line.id, candidate);
    return;
  }

  const existingPercentage = Number(existing.value.percentage.value);
  const existingQuantity = existing.targets[0].cartLine.quantity ?? Number.POSITIVE_INFINITY;
  const candidateQuantity = quantity ?? Number.POSITIVE_INFINITY;
  if (
    percentage > existingPercentage ||
    (percentage === existingPercentage && candidateQuantity > existingQuantity)
  ) {
    candidatesByLine.set(line.id, candidate);
  }
}

export const run = cartLinesDiscountsGenerateRun;

/**
 * PA7 Cross-Sell: when PA7 is in cart, apply X% off to C2/T5 lines with qty === 1.
 */
function applyPa7Rule(rule, byProduct, candidates) {
  if (
    !rule.triggerProductId ||
    !Array.isArray(rule.targetProductIds) ||
    typeof rule.discountPercentage !== "number" ||
    typeof rule.targetLineQuantityEquals !== "number"
  ) return;
  const triggerLines = byProduct.get(rule.triggerProductId);
  if (!triggerLines?.length) return;

  for (const targetProductId of rule.targetProductIds) {
    const targetLines = byProduct.get(targetProductId) ?? [];

    for (const line of targetLines) {
      if (line.quantity !== rule.targetLineQuantityEquals) continue;

      addCandidate(candidates, line, null, rule.discountPercentage, rule.message);
    }
  }
}

/**
 * NAD3 Single + Planta Samples: all required variants must be present,
 * then free variants get 100% off (optionally capped to freeQuantityPerLine).
 */
function applyPlantaRule(rule, byVariant, candidates) {
  if (!Array.isArray(rule.requiredVariantIds) || !Array.isArray(rule.freeVariantIds)) return;
  // All required variants must be in cart
  for (const requiredId of rule.requiredVariantIds) {
    if (!byVariant.get(requiredId)?.length) return;
  }

  for (const freeId of rule.freeVariantIds) {
    const freeLines = byVariant.get(freeId) ?? [];

    for (const line of freeLines) {
      const cap = rule.freeQuantityPerLine;
      // Omitting `quantity` in the cartLine target tells Shopify to discount
      // the entire line. We do this when cap is null (no limit) or when cap
      // is >= line.quantity (no point capping beyond what's in cart).
      const quantity = cap !== null && cap < line.quantity ? cap : null;
      addCandidate(candidates, line, quantity, 100, rule.message);
    }
  }
}

/**
 * NAD3 240 + Pouches: trigger product AND both pouch variants must be present.
 * Only 1 unit per pouch line is free (freeQuantityPerLine = 1).
 */
function applyPouchesRule(rule, byProduct, byVariant, candidates) {
  if (
    !rule.triggerProductId ||
    !Array.isArray(rule.requiredVariantIds) ||
    !Array.isArray(rule.freeVariantIds) ||
    rule.freeQuantityPerLine !== 1
  ) return;
  const triggerLines = byProduct.get(rule.triggerProductId);
  if (!triggerLines?.length) return;

  // All required variants must be in cart
  for (const requiredId of rule.requiredVariantIds) {
    if (!byVariant.get(requiredId)?.length) return;
  }

  for (const freeId of rule.freeVariantIds) {
    const freeLines = byVariant.get(freeId) ?? [];

    for (const line of freeLines) {
      addCandidate(
        candidates,
        line,
        rule.freeQuantityPerLine,
        100,
        rule.message,
      );
    }
  }
}
