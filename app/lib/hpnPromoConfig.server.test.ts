import { describe, expect, it } from "vitest";
import {
  getConfigRevision,
  loadActiveDiscount,
} from "./hpnPromoConfig.server";
import { defaultHpnPromoConfig, getDiscountTitle } from "./hpnPromoDefaults";
import type { GraphQLProxyFn } from "./shopifyProducts.server";

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
    expect(getConfigRevision(defaultHpnPromoConfig)).toBe(
      getConfigRevision(structuredClone(defaultHpnPromoConfig)),
    );
  });

  it("migrates legacy unlimited Planta configs to one free unit", async () => {
    const legacyConfig = structuredClone(defaultHpnPromoConfig);
    const plantaRule = legacyConfig.rules.find(
      (rule) => rule.type === "required_variants_free_variants",
    );
    if (!plantaRule) throw new Error("Planta rule fixture is missing.");

    const loaded = await loadActiveDiscount(
      proxyFor([
        automaticDiscount(
          JSON.stringify({
            ...legacyConfig,
            rules: legacyConfig.rules.map((rule) =>
              rule.id === plantaRule.id
                ? { ...rule, freeQuantityPerLine: null }
                : rule,
            ),
          }),
        ),
      ]),
      "hpn-supplements.myshopify.com",
    );

    expect(loaded.configValid).toBe(true);
    expect(
      loaded.config.rules.find(
        (rule) => rule.type === "required_variants_free_variants",
      )?.freeQuantityPerLine,
    ).toBe(1);
  });
});
