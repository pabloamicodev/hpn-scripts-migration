import { describe, expect, it } from "vitest";
import { defaultHpnPromoConfig } from "./hpnPromoDefaults";
import { createAutomaticDiscount, updateAutomaticDiscount } from "./shopifyDiscounts.server";
import type { GraphQLProxyFn } from "./shopifyProducts.server";

describe("Shopify discount mutations", () => {
  it("declares PRODUCT when creating a unified discounts API discount", async () => {
    let capturedVariables: Record<string, unknown> | undefined;
    const proxy: GraphQLProxyFn = async <TData>(_query: string, variables?: Record<string, unknown>) => {
      capturedVariables = variables;
      return {
        data: {
          discountAutomaticAppCreate: {
            automaticAppDiscount: {
              discountId: "gid://shopify/DiscountAutomaticNode/1",
              title: "HPN",
              status: "ACTIVE",
              startsAt: "2026-06-22T00:00:00Z",
            },
            userErrors: [],
          },
        } as TData,
      };
    };

    await createAutomaticDiscount(
      proxy,
      "HPN",
      "function-id",
      "2026-06-22T00:00:00Z",
      defaultHpnPromoConfig,
      defaultHpnPromoConfig.combinesWith,
    );

    expect(capturedVariables).toMatchObject({
      automaticAppDiscount: {
        discountClasses: ["PRODUCT"],
      },
    });
  });

  it("preserves PRODUCT when updating the discount configuration", async () => {
    let capturedVariables: Record<string, unknown> | undefined;
    const proxy: GraphQLProxyFn = async <TData>(_query: string, variables?: Record<string, unknown>) => {
      capturedVariables = variables;
      return {
        data: {
          discountAutomaticAppUpdate: {
            automaticAppDiscount: {
              discountId: "gid://shopify/DiscountAutomaticNode/1",
              title: "HPN",
              status: "ACTIVE",
            },
            userErrors: [],
          },
        } as TData,
      };
    };

    await updateAutomaticDiscount(proxy, "gid://shopify/DiscountAutomaticNode/1", { config: defaultHpnPromoConfig });

    expect(capturedVariables).toMatchObject({
      automaticAppDiscount: {
        discountClasses: ["PRODUCT"],
      },
    });
  });

  it("adds SHIPPING when the config has a landing_free_shipping rule (create)", async () => {
    let capturedVariables: Record<string, unknown> | undefined;
    const proxy: GraphQLProxyFn = async <TData>(_query: string, variables?: Record<string, unknown>) => {
      capturedVariables = variables;
      return {
        data: {
          discountAutomaticAppCreate: {
            automaticAppDiscount: {
              discountId: "gid://shopify/DiscountAutomaticNode/1",
              title: "TRU",
              status: "ACTIVE",
              startsAt: "2026-06-22T00:00:00Z",
            },
            userErrors: [],
          },
        } as TData,
      };
    };

    const configWithShipping = {
      ...defaultHpnPromoConfig,
      rules: [
        ...defaultHpnPromoConfig.rules,
        {
          id: "landing-free-shipping",
          type: "landing_free_shipping" as const,
          enabled: true,
          requiredLineAttributeKey: "__landing_source",
          requiredLineAttributeValue: "protein-complete-lp",
          deliveryDiscountType: "percentage" as const,
          deliveryDiscountPercentage: 100 as const,
          shippingDiscountAmount: 1,
          targetDeliveryGroupTypes: ["ONE_TIME_PURCHASE" as const, "SUBSCRIPTION" as const],
          message: "Free shipping",
        },
      ],
    };

    await createAutomaticDiscount(
      proxy,
      "TRU",
      "function-id",
      "2026-06-22T00:00:00Z",
      configWithShipping,
      configWithShipping.combinesWith,
    );

    expect(capturedVariables).toMatchObject({
      automaticAppDiscount: {
        discountClasses: ["PRODUCT", "SHIPPING"],
      },
    });
  });

  it("does not add SHIPPING when updating a config without a shipping rule (no regression for hpn/one-sol)", async () => {
    let capturedVariables: Record<string, unknown> | undefined;
    const proxy: GraphQLProxyFn = async <TData>(_query: string, variables?: Record<string, unknown>) => {
      capturedVariables = variables;
      return {
        data: {
          discountAutomaticAppUpdate: {
            automaticAppDiscount: {
              discountId: "gid://shopify/DiscountAutomaticNode/1",
              title: "HPN",
              status: "ACTIVE",
            },
            userErrors: [],
          },
        } as TData,
      };
    };

    await updateAutomaticDiscount(proxy, "gid://shopify/DiscountAutomaticNode/1", { config: defaultHpnPromoConfig });

    expect(capturedVariables).toMatchObject({
      automaticAppDiscount: {
        discountClasses: ["PRODUCT"],
      },
    });
  });

  it("uses the 2026-04 automaticDiscountNode payload for lifecycle mutations", async () => {
    const queries: string[] = [];
    const proxy: GraphQLProxyFn = async <TData>(query: string) => {
      queries.push(query);
      const operation = query.includes("discountAutomaticDeactivate")
        ? "discountAutomaticDeactivate"
        : "discountAutomaticActivate";
      return {
        data: {
          [operation]: {
            automaticDiscountNode: {
              id: "gid://shopify/DiscountAutomaticNode/1",
            },
            userErrors: [],
          },
        } as TData,
      };
    };

    const { activateDiscount, deactivateDiscount } = await import("./shopifyDiscounts.server");
    await activateDiscount(proxy, "gid://shopify/DiscountAutomaticNode/1");
    await deactivateDiscount(proxy, "gid://shopify/DiscountAutomaticNode/1");

    expect(queries).toHaveLength(2);
    for (const query of queries) {
      expect(query).toContain("automaticDiscountNode");
      expect(query).not.toContain("automaticAppDiscount {");
    }
  });
});
