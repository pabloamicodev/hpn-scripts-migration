import { hpnPromoConfigSchema, type HpnPromoConfig, type HpnPromoRule } from "./validations";
import { defaultHpnPromoConfig } from "./hpnPromoDefaults";
import { searchDiscounts, updateAutomaticDiscount } from "./shopifyDiscounts.server";
import {
  validateProductIds,
  validateVariantIds,
  type GraphQLProxyFn,
} from "./shopifyProducts.server";

export const DISCOUNT_TITLE = "HPN Scripts Migration Discounts";

export type GraphQLProxy = GraphQLProxyFn;

export interface LoadedDiscount {
  discountId: string | null;
  config: HpnPromoConfig;
  status: "ACTIVE" | "EXPIRED" | "SCHEDULED" | null;
  title: string | null;
  startsAt: string | null;
  functionId: string | null;
}

export async function loadActiveDiscount(
  graphqlProxy: GraphQLProxy
): Promise<LoadedDiscount> {
  const nodes = await searchDiscounts(graphqlProxy, DISCOUNT_TITLE);

  const hpnAppDiscounts = nodes.filter(
    (node) => node.type === "DiscountAutomaticApp" && node.configMetafield,
  );
  const active =
    hpnAppDiscounts.find((node) => node.status === "ACTIVE") ??
    hpnAppDiscounts[0] ??
    nodes.find((node) => node.type === "DiscountAutomaticApp") ??
    nodes[0];

  if (!active) {
    return {
      discountId: null,
      config: defaultHpnPromoConfig,
      status: null,
      title: null,
      startsAt: null,
      functionId: null,
    };
  }

  let config = defaultHpnPromoConfig;

  if (active.configMetafield) {
    try {
      const parsed = hpnPromoConfigSchema.safeParse(JSON.parse(active.configMetafield));
      if (parsed.success) {
        config = parsed.data;
      } else {
        console.warn(
          "[hpnPromoConfig] Metafield failed Zod validation, using defaults.",
          "discountId:", active.discountId,
          "issues:", parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`)
        );
      }
    } catch (err) {
      console.warn(
        "[hpnPromoConfig] Metafield is not valid JSON, using defaults.",
        "discountId:", active.discountId,
        err
      );
    }
  }

  return {
    discountId: active.discountId ?? null,
    config,
    status:
      active.status === "ACTIVE" ||
      active.status === "EXPIRED" ||
      active.status === "SCHEDULED"
        ? active.status
        : null,
    title: active.title ?? null,
    startsAt: active.startsAt ?? null,
    functionId: active.functionId ?? null,
  };
}

export async function validateRuleReferences(
  graphqlProxy: GraphQLProxy,
  rule: HpnPromoRule,
): Promise<string[]> {
  const productIds = new Set<string>();
  const variantIds = new Set<string>();

  if (rule.type === "pa7_cross_sell") {
    productIds.add(rule.triggerProductId);
    for (const targetProductId of rule.targetProductIds) {
      productIds.add(targetProductId);
    }
  }

  if (rule.type === "required_variants_free_variants") {
    for (const requiredVariantId of rule.requiredVariantIds) {
      variantIds.add(requiredVariantId);
    }
    for (const freeVariantId of rule.freeVariantIds) {
      variantIds.add(freeVariantId);
    }
  }

  if (rule.type === "required_product_with_free_variants") {
    productIds.add(rule.triggerProductId);
    for (const requiredVariantId of rule.requiredVariantIds) {
      variantIds.add(requiredVariantId);
    }
    for (const freeVariantId of rule.freeVariantIds) {
      variantIds.add(freeVariantId);
    }
  }

  const [productResult, variantResult] = await Promise.all([
    productIds.size > 0
      ? validateProductIds(graphqlProxy, Array.from(productIds))
      : { invalid: [], valid: [] },
    variantIds.size > 0
      ? validateVariantIds(graphqlProxy, Array.from(variantIds))
      : { invalid: [], valid: [] },
  ]);

  return [
    ...productResult.invalid.map((id) => `Product not found: ${id}`),
    ...variantResult.invalid.map((id) => `Variant not found: ${id}`),
  ];
}

export async function saveConfig(
  graphqlProxy: GraphQLProxy,
  discountId: string,
  currentConfig: HpnPromoConfig,
  updater: (current: HpnPromoConfig) => HpnPromoConfig
): Promise<{ userErrors: { field: string[]; message: string }[] }> {
  const nextConfig = updater(currentConfig);

  const result = await updateAutomaticDiscount(graphqlProxy, discountId, {
    config: nextConfig,
  });

  return {
    userErrors: result?.userErrors ?? [],
  };
}

export function pauseRule(config: HpnPromoConfig, ruleId: string): HpnPromoConfig {
  return {
    ...config,
    rules: config.rules.map((r) =>
      r.id === ruleId ? { ...r, enabled: false } : r
    ) as HpnPromoConfig["rules"],
  };
}

export function resumeRule(config: HpnPromoConfig, ruleId: string): HpnPromoConfig {
  return {
    ...config,
    rules: config.rules.map((r) =>
      r.id === ruleId ? { ...r, enabled: true } : r
    ) as HpnPromoConfig["rules"],
  };
}

export function deleteRule(config: HpnPromoConfig, ruleId: string): HpnPromoConfig {
  return {
    ...config,
    rules: config.rules.filter((r) => r.id !== ruleId) as HpnPromoConfig["rules"],
  };
}

export function upsertRule(
  config: HpnPromoConfig,
  rule: HpnPromoRule
): HpnPromoConfig {
  const exists = config.rules.some((r) => r.id === rule.id);
  if (exists) {
    return {
      ...config,
      rules: config.rules.map((r) => (r.id === rule.id ? rule : r)) as HpnPromoConfig["rules"],
    };
  }
  return {
    ...config,
    rules: [...config.rules, rule] as HpnPromoConfig["rules"],
  };
}
