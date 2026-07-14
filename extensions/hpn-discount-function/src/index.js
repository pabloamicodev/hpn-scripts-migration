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
    } else if (rule.type === "one_time_purchase_discount") {
      applyOneTimePurchaseDiscountRule(rule, byVariant, candidatesByLine);
    } else if (rule.type === "swell_free_product") {
      applySwellFreeProductRule(rule, lines, candidatesByLine);
    } else if (rule.type === "swell_cart_fixed_amount") {
      applySwellCartFixedAmountRule(rule, lines, candidatesByLine);
    } else if (rule.type === "landing_quantity_tier_fixed_price") {
      applyLandingQuantityTierFixedPriceRule(rule, lines, candidatesByLine);
    } else if (rule.type === "landing_scoped_product_discount") {
      applyLandingScopedProductDiscountRule(rule, byProduct, lines, candidatesByLine);
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
      line.bundleTypeAttribute?.value !== rule.requiredLineAttributeValue
    ) continue;

    const qtyToDiscount = Math.min(rule.maxUnitsTotal - unitsDiscounted, line.quantity);
    unitsDiscounted += qtyToDiscount;
    addCandidate(candidates, line, qtyToDiscount, rule.discountPercentage, rule.message);
  }
}

/**
 * One-Time Purchase Discount: applies a flat % off exactly ONE unit per
 * qualifying line (e.g. specific flavors, which may exist under more than
 * one product), but only when the line is a one-time purchase (no
 * sellingPlanAllocation). Extra units on the same line stay full price.
 * Subscription lines for the same variants are skipped entirely.
 */
function applyOneTimePurchaseDiscountRule(rule, byVariant, candidates) {
  if (
    !Array.isArray(rule.targetVariantIds) ||
    typeof rule.discountPercentage !== "number"
  ) return;

  for (const variantId of rule.targetVariantIds) {
    for (const line of (byVariant.get(variantId) ?? [])) {
      if (line.sellingPlanAllocation?.sellingPlan?.id) continue;
      addCandidate(candidates, line, 1, rule.discountPercentage, rule.message);
    }
  }
}

// The only landing-page-scoped line attribute key fetched in run.graphql —
// same static-key constraint as BUNDLE_LINE_ATTRIBUTE_KEY above.
const LANDING_SOURCE_LINE_ATTRIBUTE_KEY = "__landing_source";

function getLandingAnchorQuantity(rule, lines) {
  const anchorVariantIds = Array.isArray(rule.requiredAnchorVariantIds) && rule.requiredAnchorVariantIds.length > 0
    ? new Set(rule.requiredAnchorVariantIds)
    : null;

  return lines.reduce((sum, line) => {
    if (line.landingSourceAttribute?.value !== rule.requiredLineAttributeValue) return sum;
    if (anchorVariantIds && !anchorVariantIds.has(line.merchandise?.id)) return sum;
    return sum + (line.quantity || 0);
  }, 0);
}

function satisfiesLandingAnchorRequirement(rule, lines) {
  const minQuantity = typeof rule.requiredAnchorMinQuantity === "number"
    ? rule.requiredAnchorMinQuantity
    : 1;

  return getLandingAnchorQuantity(rule, lines) >= minQuantity;
}

/**
 * Landing Page Quantity-Tier Fixed Price: only touches cart lines carrying a
 * line item property that's set exclusively by the landing page's add-to-cart
 * form, so the same variant added from a PDP is never affected. Sums quantity
 * across all matching lines (a flavor split still counts as one purchase),
 * and applies the highest configured tier whose quantity is at or below that
 * total — so buying more than the highest tier (e.g. 6 units when the top
 * tier is 4) still gets that top tier's price on every unit, it doesn't fall
 * through to no discount. Price is a fixed-amount discount computed from the
 * line's live cost — immune to rounding from the subscription discount
 * that's already applied upstream.
 */
function applyLandingQuantityTierFixedPriceRule(rule, lines, candidates) {
  if (
    !Array.isArray(rule.targetVariantIds) ||
    rule.targetVariantIds.length === 0 ||
    rule.requiredLineAttributeKey !== LANDING_SOURCE_LINE_ATTRIBUTE_KEY ||
    !rule.requiredLineAttributeValue ||
    !Array.isArray(rule.tiers) ||
    rule.tiers.length === 0
  ) return;

  const targetVariantIds = new Set(rule.targetVariantIds);
  const matchingLines = lines.filter((line) => {
    if (!targetVariantIds.has(line.merchandise?.id)) return false;
    if (line.landingSourceAttribute?.value !== rule.requiredLineAttributeValue) return false;
    if (typeof rule.requiresSubscription === "boolean") {
      const isSubscription = Boolean(line.sellingPlanAllocation?.sellingPlan?.id);
      if (isSubscription !== rule.requiresSubscription) return false;
    }
    return true;
  });
  if (matchingLines.length === 0) return;

  const totalQuantity = matchingLines.reduce((sum, line) => sum + line.quantity, 0);
  const tier = [...rule.tiers]
    .sort((a, b) => b.quantity - a.quantity)
    .find((t) => totalQuantity >= t.quantity);
  if (!tier) return;

  for (const line of matchingLines) {
    const currentPerUnit = parseFloat(line.cost?.amountPerQuantity?.amount ?? "");
    if (isNaN(currentPerUnit)) continue;
    const discountPerUnit = currentPerUnit - tier.targetPricePerUnit;
    if (discountPerUnit <= 0) continue;
    addFixedAmountCandidate(candidates, line, discountPerUnit, rule.message);
  }
}

// Sets (rather than merges) the candidate for the line — safe because this
// rule only ever matches lines gated by LANDING_SOURCE_LINE_ATTRIBUTE_KEY, so
// no other rule is expected to also target the same line.
function addFixedAmountCandidate(candidatesByLine, line, amountPerUnit, message) {
  candidatesByLine.set(line.id, {
    targets: [{ cartLine: { id: line.id, quantity: line.quantity } }],
    value: {
      fixedAmount: {
        amount: amountPerUnit.toFixed(2),
        appliesToEachItem: true,
      },
    },
    message: message ?? "",
  });
}

/**
 * Landing Page Scoped Product Discount: applies a flat % (typically 100, for
 * a free gift) to at most ONE unit per configured product, and only on lines
 * carrying the landing's line item property — the same gift product added
 * from its own PDP is unaffected. Capped at 1 unit so bumping the quantity
 * in the cart drawer/page doesn't turn extra units free too.
 *
 * When requiredAnchorVariantIds is set, the discount only applies while at
 * least one tagged anchor line (e.g. the protein purchase this gift is
 * bundled with) is still in the cart — removing the anchor line reverts the
 * gift to full price instead of leaving it free forever.
 */
function applyLandingScopedProductDiscountRule(rule, byProduct, lines, candidates) {
  if (
    !Array.isArray(rule.targetProductIds) ||
    rule.targetProductIds.length === 0 ||
    rule.requiredLineAttributeKey !== LANDING_SOURCE_LINE_ATTRIBUTE_KEY ||
    !rule.requiredLineAttributeValue ||
    typeof rule.discountPercentage !== "number"
  ) return;

  if (!satisfiesLandingAnchorRequirement(rule, lines)) return;

  for (const productId of rule.targetProductIds) {
    let remainingFreeUnits = 1;
    for (const line of (byProduct.get(productId) ?? [])) {
      if (remainingFreeUnits <= 0) break;
      if (line.landingSourceAttribute?.value !== rule.requiredLineAttributeValue) continue;
      addCandidate(candidates, line, 1, rule.discountPercentage, rule.message);
      remainingFreeUnits -= 1;
    }
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

// ---------------------------------------------------------------------------
// cart.delivery-options.discounts.generate.run target
//
// Bundled in this same file (rather than a separate module) because the CLI's
// JS function bundler resolves every [[extensions.targeting]] export against
// the module declared on the FIRST targeting block, regardless of what a
// later block's own `module` field says.
// ---------------------------------------------------------------------------

const DELIVERY_DISCOUNT_SELECTION_STRATEGY = "ALL";
const LANDING_FREE_SHIPPING_RULE_TYPE = "landing_free_shipping";

/**
 * Landing Page Free Shipping: whenever the cart satisfies the landing anchor
 * requirement, discounts every delivery group to 100% off — free shipping for
 * the whole order. Independent of the cart-lines target above; reads the same
 * shared config metafield but only acts on landing_free_shipping rules.
 * `conditions` is intentionally not evaluated here (out of scope for this rule
 * — see validations.ts).
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

  const deliveryLines = input?.cart?.lines ?? [];
  const deliveryGroups = input?.cart?.deliveryGroups ?? [];
  if (deliveryGroups.length === 0) return EMPTY_RESULT;

  for (const rule of config.rules) {
    if (!rule || typeof rule !== "object" || rule.type !== LANDING_FREE_SHIPPING_RULE_TYPE) continue;
    if (!rule.enabled) continue;
    if (!rule.requiredLineAttributeKey || !rule.requiredLineAttributeValue) continue;

    if (!satisfiesLandingAnchorRequirement(rule, deliveryLines)) continue;

    // One candidate targeting every delivery group at once — not one
    // candidate per group — so checkout shows a single discount label
    // instead of a duplicate "free shipping" line per group (e.g.
    // subscription items and one-time gifts often land in separate groups).
    return {
      operations: [
        {
          deliveryDiscountsAdd: {
            candidates: [
              {
                message: rule.message ?? "",
                targets: deliveryGroups.map((group) => ({ deliveryGroup: { id: group.id } })),
                value: { percentage: { value: "100" } },
              },
            ],
            selectionStrategy: DELIVERY_DISCOUNT_SELECTION_STRATEGY,
          },
        },
      ],
    };
  }

  return EMPTY_RESULT;
}
