import { describe, expect, it } from "vitest";
import { defaultHpnPromoConfig } from "./hpnPromoDefaults";
import {
  createAutomaticDiscount,
  updateAutomaticDiscount,
} from "./shopifyDiscounts.server";
import type { GraphQLProxyFn } from "./shopifyProducts.server";

describe("Shopify discount mutations", () => {
  it("declares PRODUCT when creating a unified discounts API discount", async () => {
    let capturedVariables: Record<string, unknown> | undefined;
    const proxy: GraphQLProxyFn = async <TData>(
      _query: string,
      variables?: Record<string, unknown>,
    ) => {
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
    const proxy: GraphQLProxyFn = async <TData>(
      _query: string,
      variables?: Record<string, unknown>,
    ) => {
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

    await updateAutomaticDiscount(
      proxy,
      "gid://shopify/DiscountAutomaticNode/1",
      { config: defaultHpnPromoConfig },
    );

    expect(capturedVariables).toMatchObject({
      automaticAppDiscount: {
        discountClasses: ["PRODUCT"],
      },
    });
  });
});
