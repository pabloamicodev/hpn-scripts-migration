import { randomUUID } from "node:crypto";
import type { GraphQLProxyFn } from "./shopifyProducts.server";
import { logger } from "./logger";
import type {
  CycleDiscountValue,
  SubscriptionCyclePricingPlan,
  SubscriptionCyclePricingPlanInput,
} from "./subscriptionCyclePricing";

// ---------------------------------------------------------------------------
// NOTE: these mutation/query shapes are built from the documented Admin API
// Selling Plan schema (SellingPlanGroupInput, SellingPlanInput,
// SellingPlanPricingPolicyInput, etc). They have not been exercised against a
// live store from this environment — smoke-test via /app/graphql (this app's
// GraphiQL console) against a dev store before shipping to production, in
// case a field name has shifted in a newer Admin API version.
// ---------------------------------------------------------------------------

// Stored in merchantCode (never shown to customers) so we can tell "our"
// selling plan groups apart from ones created by the merchant directly in
// Shopify Subscriptions or by another app.
const MERCHANT_CODE_PREFIX = "hpn-cycle-pricing";

// SellingPlanGroup.options is the customer-facing OPTION CATEGORY name (e.g.
// "Delivery frequency"), distinct from each child SellingPlan's own options
// (the specific value under that category, e.g. "3-month subscription").
// Reusing the plan's own name for both — an early version of this file did —
// makes the storefront picker show a dropdown labeled "3-month subscription"
// containing a single choice also labeled "3-month subscription". Keep the
// group-level category name fixed and generic instead.
const SELLING_PLAN_GROUP_OPTION_NAME = "Subscription plan";

const SELLING_PLAN_GROUP_NODE_FRAGMENT = `
  id
  name
  merchantCode
  sellingPlans(first: 1) {
    nodes {
      id
      name
      billingPolicy {
        ... on SellingPlanRecurringBillingPolicy {
          interval
          intervalCount
          maxCycles
        }
      }
      pricingPolicies {
        ... on SellingPlanFixedPricingPolicy {
          adjustmentType
          adjustmentValue {
            ... on SellingPlanPricingPolicyPercentageValue { percentage }
            ... on MoneyV2 { amount }
          }
        }
        ... on SellingPlanRecurringPricingPolicy {
          afterCycle
          adjustmentType
          adjustmentValue {
            ... on SellingPlanPricingPolicyPercentageValue { percentage }
            ... on MoneyV2 { amount }
          }
        }
      }
    }
  }
  products(first: 100) {
    nodes { id title }
  }
`;
// KNOWN LIMITATION: products(first: 100) is not paginated. A plan attached
// to more than 100 products would have its productIds silently truncated on
// read, and the next updateCyclePricingPlan call would then interpret every
// product past the 100th as "removed" and issue a real
// sellingPlanGroupRemoveProducts call for them. Not paginating per-plan here
// is a deliberate scope cut for the realistic case (a handful of products
// per plan) — revisit if a store ever attaches a plan to a large catalog.

const LIST_SELLING_PLAN_GROUPS_QUERY = `
  query ListCyclePricingPlans($first: Int!, $after: String) {
    sellingPlanGroups(first: $first, after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes {
        ${SELLING_PLAN_GROUP_NODE_FRAGMENT}
      }
    }
  }
`;

const CREATE_SELLING_PLAN_GROUP_MUTATION = `
  mutation CreateCyclePricingPlan($input: SellingPlanGroupInput!, $resources: SellingPlanGroupResourceInput) {
    sellingPlanGroupCreate(input: $input, resources: $resources) {
      sellingPlanGroup {
        ${SELLING_PLAN_GROUP_NODE_FRAGMENT}
      }
      userErrors { field message }
    }
  }
`;

const UPDATE_SELLING_PLAN_GROUP_MUTATION = `
  mutation UpdateCyclePricingPlan($id: ID!, $input: SellingPlanGroupInput!) {
    sellingPlanGroupUpdate(id: $id, input: $input) {
      sellingPlanGroup { id }
      userErrors { field message }
    }
  }
`;

const ADD_PRODUCTS_MUTATION = `
  mutation AddCyclePricingPlanProducts($id: ID!, $productIds: [ID!]!) {
    sellingPlanGroupAddProducts(id: $id, productIds: $productIds) {
      userErrors { field message }
    }
  }
`;

const REMOVE_PRODUCTS_MUTATION = `
  mutation RemoveCyclePricingPlanProducts($id: ID!, $productIds: [ID!]!) {
    sellingPlanGroupRemoveProducts(id: $id, productIds: $productIds) {
      userErrors { field message }
    }
  }
`;

const DELETE_SELLING_PLAN_GROUP_MUTATION = `
  mutation DeleteCyclePricingPlan($id: ID!) {
    sellingPlanGroupDelete(id: $id) {
      deletedSellingPlanGroupId
      userErrors { field message }
    }
  }
`;

export interface SellingPlanGroupUserError {
  field: string[] | null;
  message: string;
}

interface RawPricingPolicy {
  afterCycle?: number;
  adjustmentType: "PERCENTAGE" | "FIXED_AMOUNT" | "PRICE";
  adjustmentValue: { percentage?: number; amount?: string } | null;
}

interface RawSellingPlanGroupNode {
  id: string;
  name: string;
  merchantCode: string | null;
  sellingPlans: {
    nodes: Array<{
      id: string;
      name: string;
      billingPolicy: {
        interval?: SubscriptionCyclePricingPlanInput["intervalUnit"];
        intervalCount?: number;
        maxCycles?: number | null;
      } | null;
      pricingPolicies: RawPricingPolicy[];
    }>;
  };
  products: { nodes: Array<{ id: string; title: string }> };
}

interface ListSellingPlanGroupsData {
  sellingPlanGroups: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    nodes: RawSellingPlanGroupNode[];
  };
}

interface CreateSellingPlanGroupData {
  sellingPlanGroupCreate: {
    sellingPlanGroup: RawSellingPlanGroupNode | null;
    userErrors: SellingPlanGroupUserError[];
  };
}

interface UpdateSellingPlanGroupData {
  sellingPlanGroupUpdate: {
    sellingPlanGroup: { id: string } | null;
    userErrors: SellingPlanGroupUserError[];
  };
}

interface AddProductsData {
  sellingPlanGroupAddProducts: { userErrors: SellingPlanGroupUserError[] };
}

interface RemoveProductsData {
  sellingPlanGroupRemoveProducts: { userErrors: SellingPlanGroupUserError[] };
}

interface DeleteSellingPlanGroupData {
  sellingPlanGroupDelete: {
    deletedSellingPlanGroupId: string | null;
    userErrors: SellingPlanGroupUserError[];
  };
}

function getGraphqlErrorMessage(errors?: { message: string }[]) {
  return errors?.map((error) => error.message).join(", ");
}

function assertNoGraphqlErrors(
  result: { errors?: { message: string }[] },
  operationName: string,
) {
  if (result.errors?.length) {
    throw new Error(
      `${operationName} failed: ${getGraphqlErrorMessage(result.errors)}`,
    );
  }
}

// A mutation field resolving to null with neither top-level GraphQL errors
// nor userErrors is anomalous, but callers throughout this file used to read
// straight past it (`payload?.userErrors ?? []` reads as "no errors" just as
// happily as an empty array would). That turned an unconfirmed mutation into
// a silently reported success — e.g. the create route would redirect back to
// the list as if a plan had been made, and the delete confirmation dialog
// would close as if the plan were gone. Every mutation wrapper below checks
// for a null payload explicitly and manufactures a userError for it instead.
function missingPayloadError(operationName: string): SellingPlanGroupUserError {
  return {
    field: null,
    message: `${operationName} returned no result and no error — treating as failed.`,
  };
}

function toAdjustmentType(type: CycleDiscountValue["type"]) {
  return type === "percentage" ? "PERCENTAGE" : "FIXED_AMOUNT";
}

function toPricingPolicyValueInput(discount: CycleDiscountValue) {
  return discount.type === "percentage"
    ? { percentage: discount.value }
    : { fixedValue: discount.value };
}

// Returns null for a "PRICE" (set absolute price) adjustment type — this app
// never creates that kind, only PERCENTAGE/FIXED_AMOUNT (see
// toAdjustmentType). If a plan we manage was hand-edited in Shopify's own
// Subscriptions UI into a PRICE policy, silently reading its amount as a
// FIXED_AMOUNT discount would show the wrong number here and, worse, clobber
// that policy back into a discount on the next save from this form. Safer to
// refuse to parse the plan at all (parseSellingPlanGroupNode excludes it).
function parsePricingPolicyValue(policy: RawPricingPolicy): CycleDiscountValue | null {
  if (policy.adjustmentType === "PERCENTAGE") {
    return { type: "percentage", value: Number(policy.adjustmentValue?.percentage ?? 0) };
  }
  if (policy.adjustmentType === "FIXED_AMOUNT") {
    return { type: "fixed_amount", value: Number(policy.adjustmentValue?.amount ?? 0) };
  }
  return null;
}

function buildSellingPlanInput(
  input: SubscriptionCyclePricingPlanInput,
  existingSellingPlanId?: string,
) {
  const recurring = {
    interval: input.intervalUnit,
    intervalCount: input.intervalCount,
  };

  return {
    ...(existingSellingPlanId ? { id: existingSellingPlanId } : {}),
    name: input.name,
    options: [input.name],
    billingPolicy: {
      recurring: { ...recurring, maxCycles: input.totalCycles },
    },
    deliveryPolicy: {
      recurring,
    },
    pricingPolicies: [
      {
        fixed: {
          adjustmentType: toAdjustmentType(input.firstCycleDiscount.type),
          adjustmentValue: toPricingPolicyValueInput(input.firstCycleDiscount),
        },
      },
      {
        recurring: {
          afterCycle: 1,
          adjustmentType: toAdjustmentType(input.recurringDiscount.type),
          adjustmentValue: toPricingPolicyValueInput(input.recurringDiscount),
        },
      },
    ],
  };
}

function parseSellingPlanGroupNode(
  node: RawSellingPlanGroupNode,
): SubscriptionCyclePricingPlan | null {
  const plan = node.sellingPlans.nodes[0];
  // plan.billingPolicy is a non-null union field, so a plan whose billing
  // policy resolved to a different concrete type (e.g. hand-edited into a
  // one-off SellingPlanFixedBillingPolicy in Shopify's own Subscriptions UI)
  // comes back as {} rather than null — checking the object's truthiness
  // alone would let that through and silently default every field below.
  // Requiring `interval` catches that case too.
  if (!plan || !plan.billingPolicy?.interval) {
    logger.warn(
      "[subscriptionCyclePricing] Skipping selling plan group with missing/non-recurring billing policy.",
      "id:",
      node.id,
    );
    return null;
  }

  const fixedPolicy = plan.pricingPolicies.find((p) => p.afterCycle === undefined);
  const recurringPolicy = plan.pricingPolicies.find((p) => p.afterCycle !== undefined);
  if (!fixedPolicy || !recurringPolicy) {
    logger.warn(
      "[subscriptionCyclePricing] Skipping selling plan group without exactly one fixed + one recurring pricing policy.",
      "id:",
      node.id,
      "policyCount:",
      plan.pricingPolicies.length,
    );
    return null;
  }

  const firstCycleDiscount = parsePricingPolicyValue(fixedPolicy);
  const recurringDiscount = parsePricingPolicyValue(recurringPolicy);
  if (!firstCycleDiscount || !recurringDiscount) {
    logger.warn(
      "[subscriptionCyclePricing] Skipping selling plan group with an unrecognized pricing policy adjustment type (expected PERCENTAGE or FIXED_AMOUNT).",
      "id:",
      node.id,
    );
    return null;
  }

  const productTitlesById: Record<string, string> = {};
  for (const product of node.products.nodes) {
    productTitlesById[product.id] = product.title;
  }

  return {
    id: node.id,
    sellingPlanId: plan.id,
    name: plan.name,
    intervalUnit: plan.billingPolicy.interval,
    intervalCount: plan.billingPolicy.intervalCount ?? 1,
    totalCycles: plan.billingPolicy.maxCycles ?? 1,
    firstCycleDiscount,
    recurringDiscount,
    productIds: Object.keys(productTitlesById),
    productTitlesById,
  };
}

// KNOWN LIMITATION: this walks every SellingPlanGroup in the store (ours and
// everyone else's — the merchant's own manually-created plans, a legacy
// subscriptions app's leftovers, etc.) 50 at a time and filters client-side
// by merchantCode prefix, since there's no server-side `query:` filter on
// this connection to push that down to Shopify. Fine for a handful of plans;
// a store with thousands of unrelated selling plan groups would make every
// list/edit page load slow. Revisit if that turns out to matter in practice.
export async function listCyclePricingPlans(
  graphqlProxy: GraphQLProxyFn,
): Promise<SubscriptionCyclePricingPlan[]> {
  const plans: SubscriptionCyclePricingPlan[] = [];
  let after: string | null = null;

  do {
    const result: { data?: ListSellingPlanGroupsData; errors?: { message: string }[] } =
      await graphqlProxy<ListSellingPlanGroupsData>(LIST_SELLING_PLAN_GROUPS_QUERY, {
        first: 50,
        after,
      });
    assertNoGraphqlErrors(result, "ListCyclePricingPlans");

    const connection: ListSellingPlanGroupsData["sellingPlanGroups"] | undefined =
      result.data?.sellingPlanGroups;
    for (const node of connection?.nodes ?? []) {
      if (!node.merchantCode?.startsWith(MERCHANT_CODE_PREFIX)) continue;
      const plan = parseSellingPlanGroupNode(node);
      if (plan) plans.push(plan);
    }

    after = connection?.pageInfo.hasNextPage ? connection.pageInfo.endCursor : null;
  } while (after);

  return plans;
}

// Re-walks the entire list to find one plan (no single-item
// `sellingPlanGroup(id:)` lookup here yet) — same pagination cost as
// listCyclePricingPlans on every edit-page load. Acceptable for the expected
// plan counts; see the limitation noted on listCyclePricingPlans above.
export async function getCyclePricingPlan(
  graphqlProxy: GraphQLProxyFn,
  id: string,
): Promise<SubscriptionCyclePricingPlan | null> {
  const plans = await listCyclePricingPlans(graphqlProxy);
  return plans.find((plan) => plan.id === id) ?? null;
}

// Belt-and-suspenders against duplicate product ids reaching the Admin API:
// the Zod schema already rejects duplicates from the form, but these
// functions are also callable directly (scripts, future callers) without
// going through that validation.
function dedupeProductIds(productIds: string[]): string[] {
  return Array.from(new Set(productIds));
}

export async function createCyclePricingPlan(
  graphqlProxy: GraphQLProxyFn,
  input: SubscriptionCyclePricingPlanInput,
): Promise<{ id: string | null; userErrors: SellingPlanGroupUserError[] }> {
  const merchantCode = `${MERCHANT_CODE_PREFIX}-${randomUUID()}`;
  const productIds = dedupeProductIds(input.productIds);

  const result = await graphqlProxy<CreateSellingPlanGroupData>(
    CREATE_SELLING_PLAN_GROUP_MUTATION,
    {
      input: {
        name: `[App] ${input.name}`,
        merchantCode,
        options: [SELLING_PLAN_GROUP_OPTION_NAME],
        sellingPlansToCreate: [buildSellingPlanInput(input)],
      },
      resources: { productIds },
    },
  );
  assertNoGraphqlErrors(result, "CreateCyclePricingPlan");

  const payload = result.data?.sellingPlanGroupCreate;
  const userErrors = payload?.userErrors ?? [];
  const id = payload?.sellingPlanGroup?.id ?? null;

  if (!id && userErrors.length === 0) {
    return { id: null, userErrors: [missingPayloadError("CreateCyclePricingPlan")] };
  }

  return { id, userErrors };
}

export async function updateCyclePricingPlan(
  graphqlProxy: GraphQLProxyFn,
  existing: SubscriptionCyclePricingPlan,
  input: SubscriptionCyclePricingPlanInput,
): Promise<{ userErrors: SellingPlanGroupUserError[] }> {
  const updateResult = await graphqlProxy<UpdateSellingPlanGroupData>(
    UPDATE_SELLING_PLAN_GROUP_MUTATION,
    {
      id: existing.id,
      input: {
        name: `[App] ${input.name}`,
        options: [SELLING_PLAN_GROUP_OPTION_NAME],
        sellingPlansToUpdate: [buildSellingPlanInput(input, existing.sellingPlanId)],
      },
    },
  );
  assertNoGraphqlErrors(updateResult, "UpdateCyclePricingPlan");

  // sellingPlanGroupUpdate can come back with a null payload (no top-level
  // GraphQL errors, but the mutation field itself resolved to null). Treat
  // "no confirmed group AND no userErrors" as failure rather than silently
  // proceeding to reconcile product attachments against an update we never
  // actually confirmed happened.
  const updatePayload = updateResult.data?.sellingPlanGroupUpdate;
  const updateUserErrors = updatePayload?.userErrors ?? [];
  if (updateUserErrors.length) return { userErrors: updateUserErrors };
  if (!updatePayload?.sellingPlanGroup) {
    return { userErrors: [missingPayloadError("UpdateCyclePricingPlan")] };
  }

  const productIds = dedupeProductIds(input.productIds);
  const currentIds = new Set(existing.productIds);
  const nextIds = new Set(productIds);
  const toAdd = productIds.filter((id) => !currentIds.has(id));
  const toRemove = existing.productIds.filter((id) => !nextIds.has(id));

  const userErrors: SellingPlanGroupUserError[] = [];

  if (toAdd.length > 0) {
    const addResult = await graphqlProxy<AddProductsData>(ADD_PRODUCTS_MUTATION, {
      id: existing.id,
      productIds: toAdd,
    });
    assertNoGraphqlErrors(addResult, "AddCyclePricingPlanProducts");
    const addPayload = addResult.data?.sellingPlanGroupAddProducts;
    userErrors.push(
      ...(addPayload ? addPayload.userErrors : [missingPayloadError("AddCyclePricingPlanProducts")]),
    );
  }

  if (toRemove.length > 0) {
    const removeResult = await graphqlProxy<RemoveProductsData>(REMOVE_PRODUCTS_MUTATION, {
      id: existing.id,
      productIds: toRemove,
    });
    assertNoGraphqlErrors(removeResult, "RemoveCyclePricingPlanProducts");
    const removePayload = removeResult.data?.sellingPlanGroupRemoveProducts;
    userErrors.push(
      ...(removePayload ? removePayload.userErrors : [missingPayloadError("RemoveCyclePricingPlanProducts")]),
    );
  }

  return { userErrors };
}

export async function deleteCyclePricingPlan(
  graphqlProxy: GraphQLProxyFn,
  id: string,
): Promise<{ userErrors: SellingPlanGroupUserError[] }> {
  const result = await graphqlProxy<DeleteSellingPlanGroupData>(
    DELETE_SELLING_PLAN_GROUP_MUTATION,
    { id },
  );
  assertNoGraphqlErrors(result, "DeleteCyclePricingPlan");

  const payload = result.data?.sellingPlanGroupDelete;
  const userErrors = payload?.userErrors ?? [];
  if (!payload?.deletedSellingPlanGroupId && userErrors.length === 0) {
    return { userErrors: [missingPayloadError("DeleteCyclePricingPlan")] };
  }

  return { userErrors };
}
