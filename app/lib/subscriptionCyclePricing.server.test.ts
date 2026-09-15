import { describe, expect, it } from "vitest";
import {
  createCyclePricingPlan,
  updateCyclePricingPlan,
  deleteCyclePricingPlan,
  listCyclePricingPlans,
  getCyclePricingPlan,
} from "./subscriptionCyclePricing.server";
import type { SubscriptionCyclePricingPlan, SubscriptionCyclePricingPlanInput } from "./subscriptionCyclePricing";
import type { GraphQLProxyFn } from "./shopifyProducts.server";

const SAMPLE_INPUT: SubscriptionCyclePricingPlanInput = {
  name: "3-month subscription",
  intervalUnit: "MONTH",
  intervalCount: 1,
  totalCycles: 3,
  firstCycleDiscount: { type: "percentage", value: 0 },
  recurringDiscount: { type: "fixed_amount", value: 2 },
  productIds: ["gid://shopify/Product/1"],
};

function rawSellingPlanGroupNode(overrides: Record<string, unknown> = {}) {
  return {
    id: "gid://shopify/SellingPlanGroup/1",
    name: "[App] 3-month subscription",
    merchantCode: "hpn-cycle-pricing-abc123",
    sellingPlans: {
      nodes: [
        {
          id: "gid://shopify/SellingPlan/1",
          name: "3-month subscription",
          billingPolicy: { interval: "MONTH", intervalCount: 1, maxCycles: 3 },
          pricingPolicies: [
            { adjustmentType: "PERCENTAGE", adjustmentValue: { percentage: 0 } },
            { afterCycle: 1, adjustmentType: "FIXED_AMOUNT", adjustmentValue: { amount: "2.0" } },
          ],
        },
      ],
    },
    products: { nodes: [{ id: "gid://shopify/Product/1", title: "Product One" }] },
    ...overrides,
  };
}

describe("createCyclePricingPlan", () => {
  it("sends a fixed (cycle 1) and recurring (afterCycle 1) pricing policy plus product resources", async () => {
    let capturedVariables: Record<string, unknown> | undefined;
    const proxy: GraphQLProxyFn = async <TData>(_query: string, variables?: Record<string, unknown>) => {
      capturedVariables = variables;
      return {
        data: {
          sellingPlanGroupCreate: {
            sellingPlanGroup: { id: "gid://shopify/SellingPlanGroup/1" },
            userErrors: [],
          },
        } as TData,
      };
    };

    const result = await createCyclePricingPlan(proxy, SAMPLE_INPUT);

    expect(result.id).toBe("gid://shopify/SellingPlanGroup/1");
    expect(result.userErrors).toEqual([]);

    const input = capturedVariables?.input as Record<string, unknown>;
    expect((capturedVariables?.resources as Record<string, unknown>).productIds).toEqual([
      "gid://shopify/Product/1",
    ]);
    expect(input.merchantCode).toMatch(/^hpn-cycle-pricing-/);

    const sellingPlan = (input.sellingPlansToCreate as Record<string, unknown>[])[0];
    const pricingPolicies = sellingPlan.pricingPolicies as Record<string, unknown>[];
    expect(pricingPolicies[0]).toMatchObject({
      fixed: { adjustmentType: "PERCENTAGE", adjustmentValue: { percentage: 0 } },
    });
    expect(pricingPolicies[1]).toMatchObject({
      recurring: {
        afterCycle: 1,
        adjustmentType: "FIXED_AMOUNT",
        adjustmentValue: { fixedValue: 2 },
      },
    });
    expect(sellingPlan.billingPolicy).toMatchObject({
      recurring: { interval: "MONTH", intervalCount: 1, maxCycles: 3 },
    });
  });

  it("uses a fixed, generic option-category name at the group level — not the plan's own name", async () => {
    // SellingPlanGroup.options is the customer-facing option CATEGORY (e.g.
    // "Delivery frequency"); the plan's own name/options is the specific
    // value under it. Reusing input.name for both would render as a
    // dropdown labeled "3-month subscription" containing a single choice
    // also labeled "3-month subscription".
    let capturedVariables: Record<string, unknown> | undefined;
    const proxy: GraphQLProxyFn = async <TData>(_query: string, variables?: Record<string, unknown>) => {
      capturedVariables = variables;
      return {
        data: { sellingPlanGroupCreate: { sellingPlanGroup: { id: "gid://1" }, userErrors: [] } } as TData,
      };
    };

    await createCyclePricingPlan(proxy, SAMPLE_INPUT);

    const input = capturedVariables?.input as Record<string, unknown>;
    expect(input.options).not.toEqual([SAMPLE_INPUT.name]);
    expect(input.name).toBe(`[App] ${SAMPLE_INPUT.name}`);

    const sellingPlan = (input.sellingPlansToCreate as Record<string, unknown>[])[0];
    expect(sellingPlan.options).toEqual([SAMPLE_INPUT.name]);
    expect(sellingPlan.name).toBe(SAMPLE_INPUT.name);
  });

  it("deduplicates productIds before sending resources to Shopify", async () => {
    let capturedVariables: Record<string, unknown> | undefined;
    const proxy: GraphQLProxyFn = async <TData>(_query: string, variables?: Record<string, unknown>) => {
      capturedVariables = variables;
      return {
        data: { sellingPlanGroupCreate: { sellingPlanGroup: { id: "gid://1" }, userErrors: [] } } as TData,
      };
    };

    await createCyclePricingPlan(proxy, {
      ...SAMPLE_INPUT,
      productIds: ["gid://shopify/Product/1", "gid://shopify/Product/1", "gid://shopify/Product/2"],
    });

    expect((capturedVariables?.resources as Record<string, unknown>).productIds).toEqual([
      "gid://shopify/Product/1",
      "gid://shopify/Product/2",
    ]);
  });

  it("surfaces Shopify userErrors instead of throwing", async () => {
    const proxy: GraphQLProxyFn = async <TData>() =>
      ({
        data: {
          sellingPlanGroupCreate: {
            sellingPlanGroup: null,
            userErrors: [{ field: ["input", "name"], message: "can't be blank" }],
          },
        },
      }) as { data: TData };

    const result = await createCyclePricingPlan(proxy, SAMPLE_INPUT);

    expect(result.id).toBeNull();
    expect(result.userErrors).toEqual([{ field: ["input", "name"], message: "can't be blank" }]);
  });

  it("treats a null mutation payload with no userErrors as a failure instead of a silent success", async () => {
    // Anomalous but possible shape: no top-level GraphQL `errors`, and the
    // mutation's own payload field is null with an empty userErrors array.
    // A naive `payload?.userErrors ?? []` reads this exactly like a real
    // success (empty error list) — the create route would then redirect the
    // merchant back to the list as if a plan had actually been created.
    const proxy: GraphQLProxyFn = async <TData>() =>
      ({ data: { sellingPlanGroupCreate: { sellingPlanGroup: null, userErrors: [] } } }) as { data: TData };

    const result = await createCyclePricingPlan(proxy, SAMPLE_INPUT);

    expect(result.id).toBeNull();
    expect(result.userErrors.length).toBeGreaterThan(0);
  });

  it("treats a completely missing sellingPlanGroupCreate field as a failure", async () => {
    const proxy: GraphQLProxyFn = async <TData>() => ({ data: {} }) as { data: TData };

    const result = await createCyclePricingPlan(proxy, SAMPLE_INPUT);

    expect(result.id).toBeNull();
    expect(result.userErrors.length).toBeGreaterThan(0);
  });

  it("throws when the GraphQL response carries top-level errors", async () => {
    const proxy: GraphQLProxyFn = async <TData>() =>
      ({ errors: [{ message: "Internal server error" }] }) as { errors: { message: string }[] } as {
        data: TData;
        errors: { message: string }[];
      };

    await expect(createCyclePricingPlan(proxy, SAMPLE_INPUT)).rejects.toThrow(/CreateCyclePricingPlan failed/);
  });
});

describe("updateCyclePricingPlan", () => {
  const EXISTING: SubscriptionCyclePricingPlan = {
    ...SAMPLE_INPUT,
    id: "gid://shopify/SellingPlanGroup/1",
    sellingPlanId: "gid://shopify/SellingPlan/1",
    productIds: ["gid://shopify/Product/1", "gid://shopify/Product/2"],
    productTitlesById: {
      "gid://shopify/Product/1": "Product One",
      "gid://shopify/Product/2": "Product Two",
    },
  };

  function makeSuccessProxy(calls: { query: string; variables?: Record<string, unknown> }[]): GraphQLProxyFn {
    return async <TData>(query: string, variables?: Record<string, unknown>) => {
      calls.push({ query, variables });
      if (query.includes("UpdateCyclePricingPlan")) {
        return { data: { sellingPlanGroupUpdate: { sellingPlanGroup: { id: EXISTING.id }, userErrors: [] } } } as {
          data: TData;
        };
      }
      if (query.includes("AddCyclePricingPlanProducts")) {
        return { data: { sellingPlanGroupAddProducts: { userErrors: [] } } } as { data: TData };
      }
      if (query.includes("RemoveCyclePricingPlanProducts")) {
        return { data: { sellingPlanGroupRemoveProducts: { userErrors: [] } } } as { data: TData };
      }
      throw new Error(`Unexpected query: ${query}`);
    };
  }

  it("diffs product attachments, only adding/removing what changed", async () => {
    const calls: { query: string; variables?: Record<string, unknown> }[] = [];
    const proxy = makeSuccessProxy(calls);

    const nextInput: SubscriptionCyclePricingPlanInput = {
      ...SAMPLE_INPUT,
      productIds: ["gid://shopify/Product/2", "gid://shopify/Product/3"],
    };

    const result = await updateCyclePricingPlan(proxy, EXISTING, nextInput);

    expect(result.userErrors).toEqual([]);

    const addCall = calls.find((c) => c.query.includes("AddCyclePricingPlanProducts"));
    const removeCall = calls.find((c) => c.query.includes("RemoveCyclePricingPlanProducts"));
    expect(addCall?.variables).toMatchObject({ productIds: ["gid://shopify/Product/3"] });
    expect(removeCall?.variables).toMatchObject({ productIds: ["gid://shopify/Product/1"] });

    const updateCall = calls.find((c) => c.query.includes("UpdateCyclePricingPlan"));
    const sellingPlan = ((updateCall?.variables?.input as Record<string, unknown>)
      .sellingPlansToUpdate as Record<string, unknown>[])[0];
    expect(sellingPlan.id).toBe(EXISTING.sellingPlanId);
  });

  it("skips add/remove calls entirely when the product list is unchanged", async () => {
    const calls: string[] = [];
    const proxy: GraphQLProxyFn = async <TData>(query: string) => {
      calls.push(query);
      return { data: { sellingPlanGroupUpdate: { sellingPlanGroup: { id: EXISTING.id }, userErrors: [] } } } as {
        data: TData;
      };
    };

    await updateCyclePricingPlan(proxy, EXISTING, { ...SAMPLE_INPUT, productIds: EXISTING.productIds });

    expect(calls.some((q) => q.includes("AddCyclePricingPlanProducts"))).toBe(false);
    expect(calls.some((q) => q.includes("RemoveCyclePricingPlanProducts"))).toBe(false);
  });

  it("dedupes duplicate productIds in the incoming input before diffing (no duplicate ids sent to Add)", async () => {
    const calls: { query: string; variables?: Record<string, unknown> }[] = [];
    const proxy = makeSuccessProxy(calls);

    await updateCyclePricingPlan(proxy, EXISTING, {
      ...SAMPLE_INPUT,
      productIds: [
        "gid://shopify/Product/1",
        "gid://shopify/Product/3",
        "gid://shopify/Product/3",
        "gid://shopify/Product/2",
      ],
    });

    const addCall = calls.find((c) => c.query.includes("AddCyclePricingPlanProducts"));
    expect(addCall?.variables).toMatchObject({ productIds: ["gid://shopify/Product/3"] });
  });

  it("removes every existing product when the new list is empty", async () => {
    const calls: { query: string; variables?: Record<string, unknown> }[] = [];
    const proxy = makeSuccessProxy(calls);

    // The Zod schema would normally reject an empty productIds array before
    // this function is ever called, but the function itself should still
    // behave sanely if invoked directly (e.g. from a script).
    await updateCyclePricingPlan(proxy, EXISTING, { ...SAMPLE_INPUT, productIds: [] });

    const removeCall = calls.find((c) => c.query.includes("RemoveCyclePricingPlanProducts"));
    expect(removeCall?.variables).toMatchObject({
      productIds: ["gid://shopify/Product/1", "gid://shopify/Product/2"],
    });
    expect(calls.some((c) => c.query.includes("AddCyclePricingPlanProducts"))).toBe(false);
  });

  it("short-circuits before touching product attachments when the core update itself fails", async () => {
    const calls: string[] = [];
    const proxy: GraphQLProxyFn = async <TData>(query: string) => {
      calls.push(query);
      return {
        data: {
          sellingPlanGroupUpdate: { sellingPlanGroup: null, userErrors: [{ field: null, message: "nope" }] },
        },
      } as { data: TData };
    };

    const result = await updateCyclePricingPlan(proxy, EXISTING, {
      ...SAMPLE_INPUT,
      productIds: ["gid://shopify/Product/9"],
    });

    expect(result.userErrors).toEqual([{ field: null, message: "nope" }]);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("UpdateCyclePricingPlan");
  });

  it("treats a null update payload with no userErrors as failure and never touches product attachments", async () => {
    const calls: string[] = [];
    const proxy: GraphQLProxyFn = async <TData>(query: string) => {
      calls.push(query);
      return { data: { sellingPlanGroupUpdate: { sellingPlanGroup: null, userErrors: [] } } } as { data: TData };
    };

    const result = await updateCyclePricingPlan(proxy, EXISTING, {
      ...SAMPLE_INPUT,
      productIds: ["gid://shopify/Product/9"],
    });

    expect(result.userErrors.length).toBeGreaterThan(0);
    expect(calls).toHaveLength(1);
  });

  it("surfaces (not throws on) Add/Remove mutation userErrors", async () => {
    const proxy: GraphQLProxyFn = async <TData>(query: string) => {
      if (query.includes("UpdateCyclePricingPlan")) {
        return { data: { sellingPlanGroupUpdate: { sellingPlanGroup: { id: EXISTING.id }, userErrors: [] } } } as {
          data: TData;
        };
      }
      if (query.includes("AddCyclePricingPlanProducts")) {
        return {
          data: { sellingPlanGroupAddProducts: { userErrors: [{ field: null, message: "already attached" }] } },
        } as { data: TData };
      }
      if (query.includes("RemoveCyclePricingPlanProducts")) {
        return { data: { sellingPlanGroupRemoveProducts: { userErrors: [] } } } as { data: TData };
      }
      throw new Error(`Unexpected query: ${query}`);
    };

    const result = await updateCyclePricingPlan(proxy, EXISTING, {
      ...SAMPLE_INPUT,
      productIds: ["gid://shopify/Product/9"],
    });

    expect(result.userErrors).toEqual([{ field: null, message: "already attached" }]);
  });

  it("does not crash when an Add mutation payload itself is null, and reports it as a failure rather than silent success", async () => {
    const proxy: GraphQLProxyFn = async <TData>(query: string) => {
      if (query.includes("UpdateCyclePricingPlan")) {
        return { data: { sellingPlanGroupUpdate: { sellingPlanGroup: { id: EXISTING.id }, userErrors: [] } } } as {
          data: TData;
        };
      }
      if (query.includes("AddCyclePricingPlanProducts")) {
        return { data: { sellingPlanGroupAddProducts: null } } as unknown as { data: TData };
      }
      if (query.includes("RemoveCyclePricingPlanProducts")) {
        return { data: { sellingPlanGroupRemoveProducts: { userErrors: [] } } } as { data: TData };
      }
      throw new Error(`Unexpected query: ${query}`);
    };

    const result = await updateCyclePricingPlan(proxy, EXISTING, {
      ...SAMPLE_INPUT,
      productIds: ["gid://shopify/Product/9"],
    });

    expect(result.userErrors.length).toBeGreaterThan(0);
  });
});

describe("deleteCyclePricingPlan", () => {
  it("returns no userErrors on a clean delete", async () => {
    const proxy: GraphQLProxyFn = async <TData>() =>
      ({ data: { sellingPlanGroupDelete: { deletedSellingPlanGroupId: "gid://1", userErrors: [] } } }) as {
        data: TData;
      };

    const result = await deleteCyclePricingPlan(proxy, "gid://1");

    expect(result.userErrors).toEqual([]);
  });

  it("surfaces Shopify userErrors instead of throwing", async () => {
    const proxy: GraphQLProxyFn = async <TData>() =>
      ({
        data: {
          sellingPlanGroupDelete: { deletedSellingPlanGroupId: null, userErrors: [{ field: null, message: "in use" }] },
        },
      }) as { data: TData };

    const result = await deleteCyclePricingPlan(proxy, "gid://1");

    expect(result.userErrors).toEqual([{ field: null, message: "in use" }]);
  });

  it("treats a null delete payload with no userErrors as failure, not silent success", async () => {
    const proxy: GraphQLProxyFn = async <TData>() =>
      ({ data: { sellingPlanGroupDelete: { deletedSellingPlanGroupId: null, userErrors: [] } } }) as { data: TData };

    const result = await deleteCyclePricingPlan(proxy, "gid://1");

    expect(result.userErrors.length).toBeGreaterThan(0);
  });

  it("does not throw when the whole data object is missing", async () => {
    const proxy: GraphQLProxyFn = async <TData>() => ({}) as { data: TData };

    const result = await deleteCyclePricingPlan(proxy, "gid://1");

    expect(result.userErrors.length).toBeGreaterThan(0);
  });
});

describe("listCyclePricingPlans", () => {
  it("only returns groups whose merchantCode carries our prefix, and reconstructs discounts from pricing policies", async () => {
    const proxy: GraphQLProxyFn = async <TData>() =>
      ({
        data: {
          sellingPlanGroups: {
            pageInfo: { hasNextPage: false, endCursor: null },
            nodes: [
              rawSellingPlanGroupNode(),
              {
                id: "gid://shopify/SellingPlanGroup/2",
                name: "Merchant's own plan",
                merchantCode: "some-other-app-code",
                sellingPlans: { nodes: [] },
                products: { nodes: [] },
              },
            ],
          },
        },
      }) as { data: TData };

    const plans = await listCyclePricingPlans(proxy);

    expect(plans).toHaveLength(1);
    expect(plans[0]).toMatchObject({
      id: "gid://shopify/SellingPlanGroup/1",
      sellingPlanId: "gid://shopify/SellingPlan/1",
      intervalUnit: "MONTH",
      intervalCount: 1,
      totalCycles: 3,
      firstCycleDiscount: { type: "percentage", value: 0 },
      recurringDiscount: { type: "fixed_amount", value: 2 },
      productIds: ["gid://shopify/Product/1"],
    });
  });

  it("excludes a group with a null merchantCode", async () => {
    const proxy: GraphQLProxyFn = async <TData>() =>
      ({
        data: {
          sellingPlanGroups: {
            pageInfo: { hasNextPage: false, endCursor: null },
            nodes: [rawSellingPlanGroupNode({ merchantCode: null })],
          },
        },
      }) as { data: TData };

    expect(await listCyclePricingPlans(proxy)).toEqual([]);
  });

  it("returns an empty list (not an error) when the store has no selling plan groups at all", async () => {
    const proxy: GraphQLProxyFn = async <TData>() =>
      ({ data: { sellingPlanGroups: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [] } } }) as {
        data: TData;
      };

    expect(await listCyclePricingPlans(proxy)).toEqual([]);
  });

  it("does not throw when the whole response is missing `data` (and returns an empty list)", async () => {
    const proxy: GraphQLProxyFn = async <TData>() => ({}) as { data: TData };

    await expect(listCyclePricingPlans(proxy)).resolves.toEqual([]);
  });

  it("paginates across multiple pages using the returned cursor", async () => {
    const requestedAfters: (string | null | undefined)[] = [];
    const proxy: GraphQLProxyFn = async <TData>(_query: string, variables?: Record<string, unknown>) => {
      requestedAfters.push(variables?.after as string | null | undefined);
      if (variables?.after === undefined || variables?.after === null) {
        return {
          data: {
            sellingPlanGroups: {
              pageInfo: { hasNextPage: true, endCursor: "cursor-1" },
              nodes: [rawSellingPlanGroupNode({ id: "gid://shopify/SellingPlanGroup/1" })],
            },
          },
        } as { data: TData };
      }
      return {
        data: {
          sellingPlanGroups: {
            pageInfo: { hasNextPage: false, endCursor: null },
            nodes: [
              rawSellingPlanGroupNode({
                id: "gid://shopify/SellingPlanGroup/2",
                sellingPlans: {
                  nodes: [
                    {
                      id: "gid://shopify/SellingPlan/2",
                      name: "Second plan",
                      billingPolicy: { interval: "WEEK", intervalCount: 2, maxCycles: 4 },
                      pricingPolicies: [
                        { adjustmentType: "PERCENTAGE", adjustmentValue: { percentage: 10 } },
                        { afterCycle: 1, adjustmentType: "PERCENTAGE", adjustmentValue: { percentage: 20 } },
                      ],
                    },
                  ],
                },
              }),
            ],
          },
        },
      } as { data: TData };
    };

    const plans = await listCyclePricingPlans(proxy);

    expect(plans.map((p) => p.id)).toEqual([
      "gid://shopify/SellingPlanGroup/1",
      "gid://shopify/SellingPlanGroup/2",
    ]);
    expect(plans[1].intervalUnit).toBe("WEEK");
    expect(requestedAfters).toEqual([null, "cursor-1"]);
  });

  it("stops pagination when hasNextPage is true but endCursor is null (malformed page info)", async () => {
    let callCount = 0;
    const proxy: GraphQLProxyFn = async <TData>() => {
      callCount += 1;
      return {
        data: {
          sellingPlanGroups: {
            pageInfo: { hasNextPage: true, endCursor: null },
            nodes: [rawSellingPlanGroupNode()],
          },
        },
      } as { data: TData };
    };

    const plans = await listCyclePricingPlans(proxy);

    expect(callCount).toBe(1);
    expect(plans).toHaveLength(1);
  });

  it("skips (and does not crash on) a plan with no selling plans at all", async () => {
    const proxy: GraphQLProxyFn = async <TData>() =>
      ({
        data: {
          sellingPlanGroups: {
            pageInfo: { hasNextPage: false, endCursor: null },
            nodes: [rawSellingPlanGroupNode({ sellingPlans: { nodes: [] } })],
          },
        },
      }) as { data: TData };

    expect(await listCyclePricingPlans(proxy)).toEqual([]);
  });

  it("skips a plan whose billing policy resolved to a non-recurring type (empty fragment)", async () => {
    const proxy: GraphQLProxyFn = async <TData>() =>
      ({
        data: {
          sellingPlanGroups: {
            pageInfo: { hasNextPage: false, endCursor: null },
            nodes: [
              rawSellingPlanGroupNode({
                sellingPlans: {
                  nodes: [
                    {
                      id: "gid://shopify/SellingPlan/1",
                      name: "Odd plan",
                      billingPolicy: {},
                      pricingPolicies: [],
                    },
                  ],
                },
              }),
            ],
          },
        },
      }) as { data: TData };

    expect(await listCyclePricingPlans(proxy)).toEqual([]);
  });

  it("skips a plan with only a fixed pricing policy and no recurring one", async () => {
    const proxy: GraphQLProxyFn = async <TData>() =>
      ({
        data: {
          sellingPlanGroups: {
            pageInfo: { hasNextPage: false, endCursor: null },
            nodes: [
              rawSellingPlanGroupNode({
                sellingPlans: {
                  nodes: [
                    {
                      id: "gid://shopify/SellingPlan/1",
                      name: "Odd plan",
                      billingPolicy: { interval: "MONTH", intervalCount: 1, maxCycles: 3 },
                      pricingPolicies: [{ adjustmentType: "PERCENTAGE", adjustmentValue: { percentage: 0 } }],
                    },
                  ],
                },
              }),
            ],
          },
        },
      }) as { data: TData };

    expect(await listCyclePricingPlans(proxy)).toEqual([]);
  });

  it("skips a plan whose pricing policy uses a PRICE adjustment type instead of PERCENTAGE/FIXED_AMOUNT", async () => {
    // We never create PRICE-type policies ourselves — only a plan hand-edited
    // in Shopify's own Subscriptions UI could carry one. Misreading it as a
    // FIXED_AMOUNT discount would show the wrong number and, worse, clobber
    // it back into a discount on the next save from our form.
    const proxy: GraphQLProxyFn = async <TData>() =>
      ({
        data: {
          sellingPlanGroups: {
            pageInfo: { hasNextPage: false, endCursor: null },
            nodes: [
              rawSellingPlanGroupNode({
                sellingPlans: {
                  nodes: [
                    {
                      id: "gid://shopify/SellingPlan/1",
                      name: "Hand-edited plan",
                      billingPolicy: { interval: "MONTH", intervalCount: 1, maxCycles: 3 },
                      pricingPolicies: [
                        { adjustmentType: "PRICE", adjustmentValue: { amount: "9.99" } },
                        { afterCycle: 1, adjustmentType: "FIXED_AMOUNT", adjustmentValue: { amount: "2.0" } },
                      ],
                    },
                  ],
                },
              }),
            ],
          },
        },
      }) as { data: TData };

    expect(await listCyclePricingPlans(proxy)).toEqual([]);
  });

  it("defaults intervalCount/totalCycles to 1 when Shopify omits them", async () => {
    const proxy: GraphQLProxyFn = async <TData>() =>
      ({
        data: {
          sellingPlanGroups: {
            pageInfo: { hasNextPage: false, endCursor: null },
            nodes: [
              rawSellingPlanGroupNode({
                sellingPlans: {
                  nodes: [
                    {
                      id: "gid://shopify/SellingPlan/1",
                      name: "Sparse plan",
                      billingPolicy: { interval: "MONTH" },
                      pricingPolicies: [
                        { adjustmentType: "PERCENTAGE", adjustmentValue: { percentage: 0 } },
                        { afterCycle: 1, adjustmentType: "FIXED_AMOUNT", adjustmentValue: { amount: "2.0" } },
                      ],
                    },
                  ],
                },
              }),
            ],
          },
        },
      }) as { data: TData };

    const plans = await listCyclePricingPlans(proxy);
    expect(plans[0]).toMatchObject({ intervalCount: 1, totalCycles: 1 });
  });

  it("handles a plan attached to zero products", async () => {
    const proxy: GraphQLProxyFn = async <TData>() =>
      ({
        data: {
          sellingPlanGroups: {
            pageInfo: { hasNextPage: false, endCursor: null },
            nodes: [rawSellingPlanGroupNode({ products: { nodes: [] } })],
          },
        },
      }) as { data: TData };

    const plans = await listCyclePricingPlans(proxy);
    expect(plans[0].productIds).toEqual([]);
    expect(plans[0].productTitlesById).toEqual({});
  });

  it("throws when the GraphQL response carries top-level errors", async () => {
    const proxy: GraphQLProxyFn = async <TData>() =>
      ({ errors: [{ message: "throttled" }] }) as { data: TData; errors: { message: string }[] };

    await expect(listCyclePricingPlans(proxy)).rejects.toThrow(/ListCyclePricingPlans failed/);
  });
});

describe("getCyclePricingPlan", () => {
  it("returns the matching plan by id", async () => {
    const proxy: GraphQLProxyFn = async <TData>() =>
      ({
        data: {
          sellingPlanGroups: {
            pageInfo: { hasNextPage: false, endCursor: null },
            nodes: [rawSellingPlanGroupNode()],
          },
        },
      }) as { data: TData };

    const plan = await getCyclePricingPlan(proxy, "gid://shopify/SellingPlanGroup/1");
    expect(plan?.id).toBe("gid://shopify/SellingPlanGroup/1");
  });

  it("returns null when no plan matches the id", async () => {
    const proxy: GraphQLProxyFn = async <TData>() =>
      ({
        data: {
          sellingPlanGroups: {
            pageInfo: { hasNextPage: false, endCursor: null },
            nodes: [rawSellingPlanGroupNode()],
          },
        },
      }) as { data: TData };

    expect(await getCyclePricingPlan(proxy, "gid://shopify/SellingPlanGroup/does-not-exist")).toBeNull();
  });

  it("returns null (not throws) when the store has no plans", async () => {
    const proxy: GraphQLProxyFn = async <TData>() =>
      ({ data: { sellingPlanGroups: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [] } } }) as {
        data: TData;
      };

    expect(await getCyclePricingPlan(proxy, "gid://shopify/SellingPlanGroup/1")).toBeNull();
  });
});
