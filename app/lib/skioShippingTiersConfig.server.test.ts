import { describe, expect, it } from "vitest";
import {
  loadSkioShippingTiersConfig,
  saveSkioShippingTiersConfig,
  upsertTier,
  deleteTier,
} from "./skioShippingTiersConfig.server";
import type { SkioShippingTiersConfig } from "./skioShippingTiers";
import type { GraphQLProxyFn } from "./shopifyProducts.server";

const SAMPLE_CONFIG: SkioShippingTiersConfig = {
  tiers: [
    {
      id: "two-month-under-50",
      name: "2-month, under $50",
      subscriptionDurationMonths: 2,
      minSubtotal: 0,
      maxSubtotal: 50,
      productVariantIds: null,
      cycleOverrides: [{ cycle: 1, override: { amount: null } }],
      defaultOverride: { amount: 1.99 },
    },
  ],
};

describe("loadSkioShippingTiersConfig", () => {
  it("returns an empty config when the metafield doesn't exist yet", async () => {
    const proxy: GraphQLProxyFn = async <TData>() =>
      ({ data: { shop: { id: "gid://shopify/Shop/1", metafield: null } } }) as { data: TData };

    const result = await loadSkioShippingTiersConfig(proxy);

    expect(result).toEqual({ config: { tiers: [] }, configValid: true, configError: null });
  });

  it("parses a valid stored config", async () => {
    const proxy: GraphQLProxyFn = async <TData>() =>
      ({
        data: { shop: { id: "gid://shopify/Shop/1", metafield: { value: JSON.stringify(SAMPLE_CONFIG) } } },
      }) as { data: TData };

    const result = await loadSkioShippingTiersConfig(proxy);

    expect(result.configValid).toBe(true);
    expect(result.config).toEqual(SAMPLE_CONFIG);
  });

  it("falls back to an empty config (marked invalid) when the stored JSON fails schema validation", async () => {
    const proxy: GraphQLProxyFn = async <TData>() =>
      ({
        data: {
          shop: {
            id: "gid://shopify/Shop/1",
            metafield: { value: JSON.stringify({ tiers: [{ id: "bad" }] }) },
          },
        },
      }) as { data: TData };

    const result = await loadSkioShippingTiersConfig(proxy);

    expect(result.configValid).toBe(false);
    expect(result.config).toEqual({ tiers: [] });
    expect(result.configError).toMatch(/failed validation/);
  });

  it("falls back to an empty config (marked invalid) when the stored value isn't valid JSON", async () => {
    const proxy: GraphQLProxyFn = async <TData>() =>
      ({ data: { shop: { id: "gid://shopify/Shop/1", metafield: { value: "{not json" } } } }) as { data: TData };

    const result = await loadSkioShippingTiersConfig(proxy);

    expect(result.configValid).toBe(false);
    expect(result.configError).toMatch(/not valid JSON/);
  });

  it("throws when the GraphQL response carries top-level errors", async () => {
    const proxy: GraphQLProxyFn = async <TData>() =>
      ({ errors: [{ message: "throttled" }] }) as { data: TData; errors: { message: string }[] };

    await expect(loadSkioShippingTiersConfig(proxy)).rejects.toThrow(/GetSkioShippingTiersConfig failed/);
  });
});

describe("saveSkioShippingTiersConfig", () => {
  it("writes the config as JSON to the shop metafield", async () => {
    let capturedMetafields: Record<string, unknown>[] | undefined;
    const proxy: GraphQLProxyFn = async <TData>(query: string, variables?: Record<string, unknown>) => {
      if (query.includes("GetSkioShippingTiersConfig")) {
        return { data: { shop: { id: "gid://shopify/Shop/1", metafield: null } } } as { data: TData };
      }
      if (query.includes("SetSkioShippingTiersConfig")) {
        capturedMetafields = variables?.metafields as Record<string, unknown>[];
        return { data: { metafieldsSet: { metafields: [{ id: "gid://shopify/Metafield/1" }], userErrors: [] } } } as {
          data: TData;
        };
      }
      throw new Error(`Unexpected query: ${query}`);
    };

    const result = await saveSkioShippingTiersConfig(proxy, SAMPLE_CONFIG);

    expect(result.userErrors).toEqual([]);
    expect(capturedMetafields).toHaveLength(1);
    expect(capturedMetafields![0]).toMatchObject({
      ownerId: "gid://shopify/Shop/1",
      namespace: "hpn_scripts",
      key: "skio_shipping_tiers",
      type: "json",
    });
    expect(JSON.parse(capturedMetafields![0].value as string)).toEqual(SAMPLE_CONFIG);
  });

  it("surfaces Shopify userErrors instead of throwing", async () => {
    const proxy: GraphQLProxyFn = async <TData>(query: string) => {
      if (query.includes("GetSkioShippingTiersConfig")) {
        return { data: { shop: { id: "gid://shopify/Shop/1", metafield: null } } } as { data: TData };
      }
      return {
        data: { metafieldsSet: { metafields: null, userErrors: [{ field: null, message: "value too large" }] } },
      } as { data: TData };
    };

    const result = await saveSkioShippingTiersConfig(proxy, SAMPLE_CONFIG);

    expect(result.userErrors).toEqual([{ field: null, message: "value too large" }]);
  });

  it("rejects an invalid config before ever calling the mutation", async () => {
    const calls: string[] = [];
    const proxy: GraphQLProxyFn = async <TData>(query: string) => {
      calls.push(query);
      return { data: { shop: { id: "gid://shopify/Shop/1", metafield: null } } } as { data: TData };
    };

    const invalidConfig = { tiers: [{ id: "bad" }] } as unknown as SkioShippingTiersConfig;

    await expect(saveSkioShippingTiersConfig(proxy, invalidConfig)).rejects.toThrow();
    expect(calls.some((q) => q.includes("SetSkioShippingTiersConfig"))).toBe(false);
  });
});

describe("upsertTier", () => {
  it("appends a new tier", () => {
    const result = upsertTier({ tiers: [] }, SAMPLE_CONFIG.tiers[0]);
    expect(result.tiers).toEqual([SAMPLE_CONFIG.tiers[0]]);
  });

  it("replaces an existing tier with the same id in place", () => {
    const updated = { ...SAMPLE_CONFIG.tiers[0], name: "Renamed" };
    const result = upsertTier(SAMPLE_CONFIG, updated);
    expect(result.tiers).toEqual([updated]);
  });

  it("does not mutate the original config", () => {
    const original = { tiers: [SAMPLE_CONFIG.tiers[0]] };
    upsertTier(original, { ...SAMPLE_CONFIG.tiers[0], name: "Renamed" });
    expect(original.tiers[0].name).toBe(SAMPLE_CONFIG.tiers[0].name);
  });
});

describe("deleteTier", () => {
  it("removes the tier with the matching id", () => {
    const result = deleteTier(SAMPLE_CONFIG, SAMPLE_CONFIG.tiers[0].id);
    expect(result.tiers).toEqual([]);
  });

  it("is a no-op when the id doesn't exist", () => {
    const result = deleteTier(SAMPLE_CONFIG, "does-not-exist");
    expect(result.tiers).toEqual(SAMPLE_CONFIG.tiers);
  });
});
