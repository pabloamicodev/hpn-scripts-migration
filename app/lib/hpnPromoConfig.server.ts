import { hpnPromoConfigSchema, type HpnPromoConfig, type HpnPromoRule } from "./validations";
import { defaultHpnPromoConfig } from "./hpnPromoDefaults";
import { searchDiscounts, updateAutomaticDiscount } from "./shopifyDiscounts.server";

export const DISCOUNT_TITLE = "HPN Scripts Migration Discounts";
export const FUNCTION_ID_ENV = "SHOPIFY_DISCOUNT_FUNCTION_ID";

export type GraphQLProxy = (
  query: string,
  variables?: Record<string, unknown>
) => Promise<{ data: unknown; errors?: unknown[] }>;

export interface LoadedDiscount {
  discountId: string | null;
  config: HpnPromoConfig;
  status: "ACTIVE" | "EXPIRED" | "SCHEDULED" | null;
  title: string | null;
  startsAt: string | null;
}

export async function loadActiveDiscount(
  graphqlProxy: GraphQLProxy
): Promise<LoadedDiscount> {
  const nodes = await searchDiscounts(graphqlProxy, DISCOUNT_TITLE);

  const active = nodes.find((node) => node.status === "ACTIVE") ?? nodes[0];

  if (!active) {
    return {
      discountId: null,
      config: defaultHpnPromoConfig,
      status: null,
      title: null,
      startsAt: null,
    };
  }

  let config = defaultHpnPromoConfig;

  if (active.configMetafield) {
    try {
      const parsed = hpnPromoConfigSchema.safeParse(JSON.parse(active.configMetafield));
      if (parsed.success) config = parsed.data;
    } catch {
      // fall back to defaults
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
  };
}

export async function saveConfig(
  graphqlProxy: GraphQLProxy,
  discountId: string,
  updater: (current: HpnPromoConfig) => HpnPromoConfig
): Promise<{ userErrors: { field: string[]; message: string }[] }> {
  const loaded = await loadActiveDiscount(graphqlProxy);
  const nextConfig = updater(loaded.config);

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
