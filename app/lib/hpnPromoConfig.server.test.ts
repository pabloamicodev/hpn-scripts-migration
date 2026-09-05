import { describe, expect, it } from "vitest";
import {
  getConfigRevision,
  getMissingPresetRules,
  loadActiveDiscount,
  syncNewRulesFromPreset,
} from "./hpnPromoConfig.server";
import { defaultHpnPromoConfig, getDiscountTitle } from "./hpnPromoDefaults";
import type { GraphQLProxyFn } from "./shopifyProducts.server";
import type { HpnPromoConfig } from "./validations";

const DISCOUNT_TITLE = getDiscountTitle("hpn-supplements.myshopify.com");

function proxyFor(nodes: unknown[]): GraphQLProxyFn {
  return async <TData>() => ({
    data: {
      discountNodes: {
        edges: nodes.map((node) => ({ node })),
      },
    } as TData,
  });
}

function automaticDiscount(metafield: string | null) {
  return {
    id: "gid://shopify/DiscountNode/1",
    metafield: metafield === null ? null : { value: metafield },
    discount: {
      __typename: "DiscountAutomaticApp",
      discountId: "gid://shopify/DiscountAutomaticNode/1",
      title: DISCOUNT_TITLE,
      status: "ACTIVE",
      startsAt: "2026-06-22T00:00:00Z",
      appDiscountType: {
        functionId: "gid://shopify/ShopifyFunction/1",
      },
    },
  };
}

describe("loadActiveDiscount", () => {
  it("marks malformed stored JSON invalid instead of treating defaults as published", async () => {
    const loaded = await loadActiveDiscount(
      proxyFor([automaticDiscount("{not-json")]),
      "hpn-supplements.myshopify.com",
    );

    expect(loaded.discountId).toBeTruthy();
    expect(loaded.configValid).toBe(false);
    expect(loaded.configError).toMatch(/not valid JSON/i);
  });

  it("ignores a native automatic discount that happens to share the title", async () => {
    const loaded = await loadActiveDiscount(
      proxyFor([
        {
          id: "gid://shopify/DiscountNode/native",
          metafield: null,
          discount: {
            __typename: "DiscountAutomaticBasic",
            title: DISCOUNT_TITLE,
            status: "ACTIVE",
            startsAt: "2026-06-22T00:00:00Z",
          },
        },
      ]),
      "hpn-supplements.myshopify.com",
    );

    expect(loaded.discountId).toBeNull();
    expect(loaded.configValid).toBe(true);
  });

  it("produces stable revisions for optimistic concurrency checks", () => {
    expect(getConfigRevision(defaultHpnPromoConfig)).toBe(getConfigRevision(structuredClone(defaultHpnPromoConfig)));
  });

  it("migrates legacy unlimited Planta configs to one free unit", async () => {
    const legacyConfig = structuredClone(defaultHpnPromoConfig);
    const plantaRule = legacyConfig.rules.find((rule) => rule.type === "required_variants_free_variants");
    if (!plantaRule) throw new Error("Planta rule fixture is missing.");

    const loaded = await loadActiveDiscount(
      proxyFor([
        automaticDiscount(
          JSON.stringify({
            ...legacyConfig,
            rules: legacyConfig.rules.map((rule) =>
              rule.id === plantaRule.id ? { ...rule, freeQuantityPerLine: null } : rule,
            ),
          }),
        ),
      ]),
      "hpn-supplements.myshopify.com",
    );

    expect(loaded.configValid).toBe(true);
    expect(
      loaded.config.rules.find((rule) => rule.type === "required_variants_free_variants")?.freeQuantityPerLine,
    ).toBe(1);
  });
});

describe("getMissingPresetRules / syncNewRulesFromPreset", () => {
  function baseConfig(overrides: Partial<HpnPromoConfig> = {}): HpnPromoConfig {
    return {
      version: 1,
      rules: [
        {
          id: "swell-free-product",
          type: "swell_free_product",
          enabled: true,
          message: "Rewards",
        },
      ],
      combinesWith: {
        orderDiscounts: true,
        productDiscounts: true,
        shippingDiscounts: false,
      },
      ...overrides,
    };
  }

  const preset = baseConfig({
    rules: [
      {
        id: "swell-free-product",
        type: "swell_free_product",
        enabled: true,
        message: "Rewards",
      },
      {
        id: "protein-landing-free-shipping",
        type: "landing_free_shipping",
        enabled: true,
        requiredLineAttributeKey: "__landing_source",
        requiredLineAttributeValue: "protein-complete-lp",
        deliveryDiscountType: "percentage",
        deliveryDiscountPercentage: 100,
        shippingDiscountAmount: 1,
        targetDeliveryGroupTypes: ["ONE_TIME_PURCHASE", "SUBSCRIPTION"],
        message: "Free shipping",
      },
    ],
  });

  it("finds preset rules whose id is missing from the live config", () => {
    const live = baseConfig();
    const missing = getMissingPresetRules(live, preset);

    expect(missing).toHaveLength(1);
    expect(missing[0].id).toBe("protein-landing-free-shipping");
  });

  it("returns nothing missing once the live config already has every preset rule id", () => {
    const live = baseConfig({ rules: preset.rules });

    expect(getMissingPresetRules(live, preset)).toHaveLength(0);
  });

  it("appends missing rules without touching existing ones or combinesWith", () => {
    const live = baseConfig({
      rules: [{ ...baseConfig().rules[0], enabled: false }], // live rule diverges from preset (paused)
      combinesWith: {
        orderDiscounts: false,
        productDiscounts: true,
        shippingDiscounts: false,
      },
    });

    const synced = syncNewRulesFromPreset(live, preset);

    expect(synced.rules).toHaveLength(2);
    expect(synced.rules[0]).toEqual(live.rules[0]); // untouched, still paused
    expect(synced.rules[1].id).toBe("protein-landing-free-shipping");
    expect(synced.combinesWith).toEqual(live.combinesWith); // untouched
  });

  it("returns the same config reference when there is nothing to sync", () => {
    const live = baseConfig({ rules: preset.rules });

    expect(syncNewRulesFromPreset(live, preset)).toBe(live);
  });
});
