const EMPTY_RESULT = {
  operations: [],
};

const PRODUCT_DISCOUNT_SELECTION_STRATEGY = "ALL";

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

  const cart = input.cart ?? {};
  const buyerIdentity = cart.buyerIdentity ?? {};
  const cartAttributes = deriveCartAttributes(cart);

  // --- Index cart lines by product ID and variant ID ---
  const lines = (cart.lines ?? []).filter(
    (l) => l.merchandise?.__typename === "ProductVariant"
  );

  const byProduct = new Map();
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
  const candidatesByLine = new Map();

  for (const rule of config.rules) {
    // Skip malformed entries (null, non-object, missing type) that could crash downstream.
    if (!rule || typeof rule !== "object" || typeof rule.type !== "string") continue;
    if (!rule.enabled) continue;

    // Check global conditions before dispatching to the specific rule handler.
    if (!checkGlobalConditions(rule, cart, cartAttributes)) continue;

    if (rule.type === "pa7_cross_sell") {
      applyPa7Rule(rule, byProduct, candidatesByLine);
    } else if (rule.type === "required_variants_free_variants") {
      applyPlantaRule(rule, byVariant, candidatesByLine);
    } else if (rule.type === "required_product_with_free_variants") {
      applyPouchesRule(rule, byProduct, byVariant, candidatesByLine);
    } else if (rule.type === "trigger_product_discounted_targets") {
      applyTriggerProductDiscountedTargetsRule(rule, byProduct, candidatesByLine);
    } else if (rule.type === "loyalty_tier") {
      applyLoyaltyTierRule(rule, byProduct, candidatesByLine, buyerIdentity);
    } else if (rule.type === "subscription_bundle_group") {
      applySubscriptionBundleGroupRule(rule, lines, candidatesByLine);
    } else if (rule.type === "swell_free_product") {
      applySwellFreeProductRule(rule, lines, candidatesByLine);
    } else if (rule.type === "swell_cart_fixed_amount") {
      applySwellCartFixedAmountRule(rule, lines, candidatesByLine);
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
    message: message ?? "",
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

// ---------------------------------------------------------------------------
// Global conditions guard
// ---------------------------------------------------------------------------

// Cart-level attribute keys that conditions.requiredCartAttributeKey can
// check in production. Cart.attribute(key) takes a static key per query, so
// each supported key needs its own aliased field in run.graphql below.
const CART_ATTRIBUTE_ALIASES = {
  source: "sourceAttribute",
};

// Test fixtures pass cart.attributes directly; the real Function input never
// has that field — it only has the aliased singular lookups above, which we
// fold into the same { key, value } shape here.
function deriveCartAttributes(cart) {
  if (Array.isArray(cart.attributes)) return cart.attributes;
  const attrs = [];
  for (const [key, alias] of Object.entries(CART_ATTRIBUTE_ALIASES)) {
    const attribute = cart[alias];
    if (attribute) attrs.push({ key, value: attribute.value });
  }
  return attrs;
}

function checkGlobalConditions(rule, cart, cartAttributes) {
  const c = rule.conditions;
  if (!c || typeof c !== "object") return true;

  // Minimum cart subtotal
  if (typeof c.minimumCartSubtotal === "number") {
    const subtotal = parseFloat(cart.cost?.subtotalAmount?.amount ?? "0");
    if (isNaN(subtotal) || subtotal < c.minimumCartSubtotal) return false;
  }

  // Required cart attribute (e.g. landing-page source set via Storefront API)
  if (typeof c.requiredCartAttributeKey === "string" && c.requiredCartAttributeKey) {
    const attr = cartAttributes.find((a) => a.key === c.requiredCartAttributeKey);
    if (!attr) return false;
    if (c.requiredCartAttributeValue != null && attr.value !== c.requiredCartAttributeValue) {
      return false;
    }
  }

  // Requires at least one subscription item
  if (c.requiresSubscriptionInCart === true) {
    const hasSub = (cart.lines ?? []).some(
      (l) => l.sellingPlanAllocation != null
    );
    if (!hasSub) return false;
  }

  return true;
}

// ---------------------------------------------------------------------------
// Rule handlers
// ---------------------------------------------------------------------------

/**
 * PA7 Cross-Sell: when trigger product is in cart, apply X% off to target
 * product lines that have exactly the configured quantity.
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
 * Required Variants → Discounted Variants: all required variants must be
 * present in cart; then apply configured % to each free variant line.
 */
function applyPlantaRule(rule, byVariant, candidates) {
  if (
    !Array.isArray(rule.requiredVariantIds) ||
    !Array.isArray(rule.freeVariantIds) ||
    typeof rule.freeQuantityPerLine !== "number" ||
    rule.freeQuantityPerLine < 1
  ) return;

  for (const requiredId of rule.requiredVariantIds) {
    if (!byVariant.get(requiredId)?.length) return;
  }

  const pct = typeof rule.discountPercentage === "number" ? rule.discountPercentage : 100;

  for (const freeId of rule.freeVariantIds) {
    const line = (byVariant.get(freeId) ?? [])[0];
    if (!line) continue;
    const qty = Math.min(rule.freeQuantityPerLine, line.quantity);
    addCandidate(candidates, line, qty, pct, rule.message);
  }
}

/**
 * Required Product + Variants → Discounted Variants: trigger product AND all
 * required variants must be present; then apply % to each free variant line.
 */
function applyPouchesRule(rule, byProduct, byVariant, candidates) {
  if (
    !rule.triggerProductId ||
    !Array.isArray(rule.requiredVariantIds) ||
    !Array.isArray(rule.freeVariantIds) ||
    typeof rule.freeQuantityPerLine !== "number" ||
    rule.freeQuantityPerLine < 1
  ) return;

  if (!byProduct.get(rule.triggerProductId)?.length) return;

  for (const requiredId of rule.requiredVariantIds) {
    if (!byVariant.get(requiredId)?.length) return;
  }

  const pct = typeof rule.discountPercentage === "number" ? rule.discountPercentage : 100;

  for (const freeId of rule.freeVariantIds) {
    for (const line of (byVariant.get(freeId) ?? [])) {
      const qty = Math.min(rule.freeQuantityPerLine, line.quantity);
      addCandidate(candidates, line, qty, pct, rule.message);
    }
  }
}

/**
 * Trigger Product → Discounted Targets: when trigger product is in cart,
 * apply per-target discount % to each configured target product's lines.
 */
function applyTriggerProductDiscountedTargetsRule(rule, byProduct, candidates) {
  if (
    !rule.triggerProductId ||
    !Array.isArray(rule.targets) ||
    rule.targets.length === 0
  ) return;

  if (!byProduct.get(rule.triggerProductId)?.length) return;

  for (const target of rule.targets) {
    if (
      typeof target.productId !== "string" ||
      typeof target.discountPercentage !== "number" ||
      target.discountPercentage < 1
    ) continue;

    for (const line of (byProduct.get(target.productId) ?? [])) {
      addCandidate(candidates, line, null, target.discountPercentage, rule.message);
    }
  }
}

// The only line attribute key fetched in run.graphql — CartLine.attribute(key)
// requires a static key per query, so requiredLineAttributeKey is only
// enforceable when it matches this exact key.
const BUNDLE_LINE_ATTRIBUTE_KEY = "__bundle_type";

/**
 * Subscription Bundle Group: discounts up to maxUnitsTotal units (cart-wide)
 * across a group of target products, for subscription lines only.
 *
 * requiredLineAttributeKey/Value (e.g. __bundle_type = two) is enforced when
 * the configured key matches BUNDLE_LINE_ATTRIBUTE_KEY.
 */
function applySubscriptionBundleGroupRule(rule, lines, candidates) {
  if (
    !Array.isArray(rule.targetProductIds) ||
    typeof rule.discountPercentage !== "number" ||
    typeof rule.maxUnitsTotal !== "number" ||
    rule.maxUnitsTotal < 1
  ) return;

  const targetProductIds = new Set(rule.targetProductIds);
  let unitsDiscounted = 0;

  for (const line of lines) {
    if (unitsDiscounted >= rule.maxUnitsTotal) break;

    const productId = line.merchandise?.product?.id;
    if (!targetProductIds.has(productId)) continue;

    if (!line.sellingPlanAllocation?.sellingPlan?.id) continue;

    if (
      rule.requiredLineAttributeKey === BUNDLE_LINE_ATTRIBUTE_KEY &&
      line.attribute?.value !== rule.requiredLineAttributeValue
    ) continue;

    const qtyToDiscount = Math.min(rule.maxUnitsTotal - unitsDiscounted, line.quantity);
    unitsDiscounted += qtyToDiscount;
    addCandidate(candidates, line, qtyToDiscount, rule.discountPercentage, rule.message);
  }
}

/**
 * Swell Free Product / Fixed-Amount Reward rules are stored in the config
 * but intentionally left as no-ops. Applying them safely requires validating
 * _swell_redemption_token via Swell's calculate_token secret (see TRU Shopify
 * Scripts Discounts Guide), which isn't available in this codebase — without
 * it, anyone could fake a reward by adding the cart line properties manually.
 *
 * Swell (Yotpo) may already apply its own discount through its native
 * Shopify integration. These rule entries are kept in the config so the
 * admin UI can track which stores use Swell rewards.
 */
function applySwellFreeProductRule(_rule, _lines, _candidates) { /* no-op */ }
function applySwellCartFixedAmountRule(_rule, _lines, _candidates) { /* no-op */ }

/**
 * Loyalty Tier: applies the highest matching tier discount to target products
 * based on the logged-in customer's order count. Skipped for guests.
 */
function applyLoyaltyTierRule(rule, byProduct, candidates, buyerIdentity) {
  if (!Array.isArray(rule.targetProductIds) || !Array.isArray(rule.tiers) || rule.tiers.length === 0) return;

  const numberOfOrders = buyerIdentity?.customer?.numberOfOrders;
  if (numberOfOrders == null || typeof numberOfOrders !== "number") return;

  // Sort tiers highest-first and pick first where customer qualifies
  const sorted = [...rule.tiers]
    .filter((t) => typeof t.minOrders === "number" && typeof t.discountPercentage === "number")
    .sort((a, b) => b.minOrders - a.minOrders);

  const activeTier = sorted.find((t) => numberOfOrders >= t.minOrders);
  if (!activeTier) return;

  for (const productId of rule.targetProductIds) {
    for (const line of (byProduct.get(productId) ?? [])) {
      addCandidate(candidates, line, null, activeTier.discountPercentage, rule.message);
    }
  }
}
