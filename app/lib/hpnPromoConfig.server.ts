import { createHash } from "node:crypto";
import { hpnPromoConfigSchema, type HpnPromoConfig, type HpnPromoRule } from "./validations";
import { logger } from "./logger";
import { getStorePreset, getDiscountTitle } from "./hpnPromoDefaults";
import { searchDiscounts, updateAutomaticDiscount } from "./shopifyDiscounts.server";
import { withDatabaseLock } from "./databaseLock.server";
import {
  validateProductIds,
  validateVariantIds,
  type GraphQLProxyFn,
} from "./shopifyProducts.server";

export type GraphQLProxy = GraphQLProxyFn;

export interface LoadedDiscount {
  discountId: string | null;
  config: HpnPromoConfig;
  status: "ACTIVE" | "EXPIRED" | "SCHEDULED" | null;
  title: string | null;
  startsAt: string | null;
  functionId: string | null;
  configValid: boolean;
  configError: string | null;
  configRevision: string;
}

export class ConfigConflictError extends Error {
  constructor() {
    super("The discount configuration changed since this page was loaded.");
    this.name = "ConfigConflictError";
  }
}

export class InvalidStoredConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidStoredConfigError";
  }
}

export function getConfigRevision(config: HpnPromoConfig): string {
  return createHash("sha256").update(JSON.stringify(config)).digest("hex");
}

export async function loadActiveDiscount(
  graphqlProxy: GraphQLProxy,
  shop: string,
): Promise<LoadedDiscount> {
  const nodes = await searchDiscounts(graphqlProxy, getDiscountTitle(shop));

  const hpnAppDiscounts = nodes.filter(
    (node) => node.type === "DiscountAutomaticApp",
  );
  const active =
    hpnAppDiscounts.find((node) => node.status === "ACTIVE") ??
    hpnAppDiscounts[0];

  if (!active) {
    return {
      discountId: null,
      config: getStorePreset(shop),
      status: null,
      title: null,
      startsAt: null,
      functionId: null,
      configValid: true,
      configError: null,
      configRevision: getConfigRevision(getStorePreset(shop)),
    };
  }

  let config = getStorePreset(shop);
  let configValid = true;
  let configError: string | null = null;

  if (active.configMetafield) {
    try {
      const parsed = hpnPromoConfigSchema.safeParse(JSON.parse(active.configMetafield));
      if (parsed.success) {
        config = parsed.data;
      } else {
        configValid = false;
        configError = "The stored discount configuration failed validation.";
        logger.warn(
          "[hpnPromoConfig] Metafield failed Zod validation, using defaults.",
          "discountId:", active.discountId,
          "issues:", parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`)
        );
      }
    } catch (err) {
      configValid = false;
      configError = "The stored discount configuration is not valid JSON.";
      logger.warn(
        "[hpnPromoConfig] Metafield is not valid JSON, using defaults.",
        "discountId:", active.discountId,
        err
      );
    }
  }
  else {
    configValid = false;
    configError = "The automatic discount is missing its configuration metafield.";
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
    configValid,
    configError,
    configRevision: getConfigRevision(config),
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

  if (rule.type === "trigger_product_discounted_targets") {
    productIds.add(rule.triggerProductId);
    for (const target of rule.targets) {
      productIds.add(target.productId);
    }
  }

  if (rule.type === "loyalty_tier") {
    for (const productId of rule.targetProductIds) {
      productIds.add(productId);
    }
  }

  if (rule.type === "subscription_bundle_group") {
    for (const productId of rule.targetProductIds) {
      productIds.add(productId);
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
  shop: string,
  discountId: string,
  currentConfig: HpnPromoConfig,
  expectedRevision: string,
  updater: (current: HpnPromoConfig) => HpnPromoConfig,
): Promise<{ userErrors: { field: string[] | null; message: string }[] }> {
  return withDatabaseLock(`hpn-discount-config:${discountId}`, async () => {
    const latest = await loadActiveDiscount(graphqlProxy, shop);
    if (!latest.configValid) {
      throw new InvalidStoredConfigError(
        latest.configError ?? "The stored configuration is invalid.",
      );
    }
    if (latest.discountId !== discountId || latest.configRevision !== expectedRevision) {
      throw new ConfigConflictError();
    }

    const nextConfig = hpnPromoConfigSchema.parse(updater(currentConfig));
    const result = await updateAutomaticDiscount(graphqlProxy, discountId, {
      config: nextConfig,
      combinesWith: nextConfig.combinesWith,
    });

    return {
      userErrors: result?.userErrors ?? [],
    };
  });
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
