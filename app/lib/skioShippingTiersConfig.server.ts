import { skioShippingTiersConfigSchema, type SkioShippingTiersConfig, type SkioShippingTier } from "./skioShippingTiers";
import { logger } from "./logger";
import type { GraphQLProxyFn } from "./shopifyProducts.server";

// Stored as a shop-level metafield — same namespace convention as the
// hpn-discount-function's config (hpn_scripts), but this key is unrelated to
// any discount: it's read/written directly by the Skio shipping sync runner,
// never by the Function.
const METAFIELD_NAMESPACE = "hpn_scripts";
const METAFIELD_KEY = "skio_shipping_tiers";

const EMPTY_CONFIG: SkioShippingTiersConfig = { tiers: [] };

const GET_SHOP_METAFIELD_QUERY = `
  query GetSkioShippingTiersConfig($namespace: String!, $key: String!) {
    shop {
      id
      metafield(namespace: $namespace, key: $key) {
        value
      }
    }
  }
`;

const SET_SHOP_METAFIELD_MUTATION = `
  mutation SetSkioShippingTiersConfig($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields {
        id
      }
      userErrors {
        field
        message
      }
    }
  }
`;

interface ShopMetafieldData {
  shop: {
    id: string;
    metafield: { value: string } | null;
  };
}

interface MetafieldsSetUserError {
  field: string[] | null;
  message: string;
}

interface SetShopMetafieldData {
  metafieldsSet: {
    metafields: { id: string }[] | null;
    userErrors: MetafieldsSetUserError[];
  };
}

export interface LoadedSkioShippingTiersConfig {
  config: SkioShippingTiersConfig;
  configValid: boolean;
  configError: string | null;
}

function getGraphqlErrorMessage(errors?: { message: string }[]) {
  return errors?.map((e) => e.message).join(", ");
}

function assertNoGraphqlErrors(result: { errors?: { message: string }[] }, operationName: string) {
  if (result.errors?.length) {
    throw new Error(`${operationName} failed: ${getGraphqlErrorMessage(result.errors)}`);
  }
}

export async function loadSkioShippingTiersConfig(
  graphqlProxy: GraphQLProxyFn,
): Promise<LoadedSkioShippingTiersConfig> {
  const result = await graphqlProxy<ShopMetafieldData>(GET_SHOP_METAFIELD_QUERY, {
    namespace: METAFIELD_NAMESPACE,
    key: METAFIELD_KEY,
  });
  assertNoGraphqlErrors(result, "GetSkioShippingTiersConfig");

  const rawValue = result.data?.shop.metafield?.value;
  if (!rawValue) {
    return { config: EMPTY_CONFIG, configValid: true, configError: null };
  }

  try {
    const parsed = skioShippingTiersConfigSchema.safeParse(JSON.parse(rawValue));
    if (parsed.success) {
      return { config: parsed.data, configValid: true, configError: null };
    }
    logger.warn(
      "[skioShippingTiersConfig] Metafield failed Zod validation, using empty config.",
      "issues:",
      parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
    );
    return {
      config: EMPTY_CONFIG,
      configValid: false,
      configError: "The stored Skio shipping tiers configuration failed validation.",
    };
  } catch (err) {
    logger.warn("[skioShippingTiersConfig] Metafield is not valid JSON, using empty config.", err);
    return {
      config: EMPTY_CONFIG,
      configValid: false,
      configError: "The stored Skio shipping tiers configuration is not valid JSON.",
    };
  }
}

export async function saveSkioShippingTiersConfig(
  graphqlProxy: GraphQLProxyFn,
  config: SkioShippingTiersConfig,
): Promise<{ userErrors: MetafieldsSetUserError[] }> {
  const shopResult = await graphqlProxy<ShopMetafieldData>(GET_SHOP_METAFIELD_QUERY, {
    namespace: METAFIELD_NAMESPACE,
    key: METAFIELD_KEY,
  });
  assertNoGraphqlErrors(shopResult, "GetShopId");

  const shopId = shopResult.data?.shop.id;
  if (!shopId) {
    return { userErrors: [{ field: null, message: "Could not resolve the shop id." }] };
  }

  const validated = skioShippingTiersConfigSchema.parse(config);

  const result = await graphqlProxy<SetShopMetafieldData>(SET_SHOP_METAFIELD_MUTATION, {
    metafields: [
      {
        ownerId: shopId,
        namespace: METAFIELD_NAMESPACE,
        key: METAFIELD_KEY,
        type: "json",
        value: JSON.stringify(validated),
      },
    ],
  });
  assertNoGraphqlErrors(result, "SetSkioShippingTiersConfig");

  return { userErrors: result.data?.metafieldsSet.userErrors ?? [] };
}

export function upsertTier(config: SkioShippingTiersConfig, tier: SkioShippingTier): SkioShippingTiersConfig {
  const exists = config.tiers.some((t) => t.id === tier.id);
  return {
    tiers: exists ? config.tiers.map((t) => (t.id === tier.id ? tier : t)) : [...config.tiers, tier],
  };
}

export function deleteTier(config: SkioShippingTiersConfig, tierId: string): SkioShippingTiersConfig {
  return { tiers: config.tiers.filter((t) => t.id !== tierId) };
}
