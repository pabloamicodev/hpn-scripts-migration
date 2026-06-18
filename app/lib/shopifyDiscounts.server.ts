import type { HpnPromoConfig } from "./validations";

const CREATE_AUTOMATIC_DISCOUNT_MUTATION = `
  mutation CreateHpnDiscount($automaticAppDiscount: DiscountAutomaticAppInput!) {
    discountAutomaticAppCreate(automaticAppDiscount: $automaticAppDiscount) {
      automaticAppDiscount {
        discountId
        title
        status
        startsAt
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const UPDATE_AUTOMATIC_DISCOUNT_MUTATION = `
  mutation UpdateHpnDiscount($id: ID!, $automaticAppDiscount: DiscountAutomaticAppInput!) {
    discountAutomaticAppUpdate(id: $id, automaticAppDiscount: $automaticAppDiscount) {
      automaticAppDiscount {
        discountId
        title
        status
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const ACTIVATE_DISCOUNT_MUTATION = `
  mutation ActivateDiscount($id: ID!) {
    discountAutomaticActivate(id: $id) {
      automaticAppDiscount {
        discountId
        status
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const DEACTIVATE_DISCOUNT_MUTATION = `
  mutation DeactivateDiscount($id: ID!) {
    discountAutomaticDeactivate(id: $id) {
      automaticAppDiscount {
        discountId
        status
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const DELETE_DISCOUNT_MUTATION = `
  mutation DeleteDiscount($id: ID!) {
    discountAutomaticDelete(id: $id) {
      deletedAutomaticAppDiscountId
      userErrors {
        field
        message
      }
    }
  }
`;

const SEARCH_DISCOUNTS_QUERY = `
  query SearchDiscounts($query: String!) {
    discountNodes(first: 25, query: $query) {
      edges {
        node {
          id
          metafield(namespace: "hpn_scripts", key: "function_configuration") {
            value
          }
          discount {
            __typename

            ... on DiscountAutomaticApp {
              discountId
              title
              status
              startsAt
              appDiscountType {
                functionId
              }
            }

            ... on DiscountAutomaticBasic {
              title
              status
              startsAt
            }

            ... on DiscountAutomaticBxgy {
              title
              status
              startsAt
            }

            ... on DiscountAutomaticFreeShipping {
              title
              status
              startsAt
            }
          }
        }
      }
    }
  }
`;

const LIST_ALL_DISCOUNTS_QUERY = `
  query ListAllDiscounts {
    discountNodes(first: 100) {
      pageInfo {
        hasNextPage
      }
      edges {
        node {
          id
          metafield(namespace: "hpn_scripts", key: "function_configuration") {
            value
          }
          discount {
            __typename

            ... on DiscountAutomaticApp {
              discountId
              title
              status
              startsAt
              appDiscountType {
                functionId
              }
            }

            ... on DiscountAutomaticBasic {
              title
              status
              startsAt
            }

            ... on DiscountAutomaticBxgy {
              title
              status
              startsAt
            }

            ... on DiscountAutomaticFreeShipping {
              title
              status
              startsAt
            }
          }
        }
      }
    }
  }
`;

const GET_SHOPIFY_FUNCTIONS_QUERY = `
  query GetShopifyFunctions {
    shopifyFunctions(first: 25) {
      nodes {
        id
        title
        apiType
        app {
          title
          handle
        }
      }
    }
  }
`;

interface GraphQLProxy {
  (
    query: string,
    variables?: Record<string, unknown>
  ): Promise<{ data?: any; errors?: any[] }>;
}

function getGraphqlErrorMessage(errors?: any[]) {
  return errors?.map((error) => error.message ?? String(error)).join(", ");
}

function assertNoGraphqlErrors(
  result: { errors?: any[] },
  operationName: string,
) {
  if (result.errors?.length) {
    throw new Error(`${operationName} failed: ${getGraphqlErrorMessage(result.errors)}`);
  }
}

interface CombinesWithInput {
  orderDiscounts: boolean;
  productDiscounts: boolean;
  shippingDiscounts: boolean;
}

type AutomaticDiscountTypename =
  | "DiscountAutomaticApp"
  | "DiscountAutomaticBasic"
  | "DiscountAutomaticBxgy"
  | "DiscountAutomaticFreeShipping";

interface SearchDiscountNode {
  id: string;
  metafield?: {
    value: string;
  } | null;
  discount:
    | {
        __typename: "DiscountAutomaticApp";
        discountId: string;
        title: string;
        status: string;
        startsAt: string | null;
        appDiscountType?: {
          functionId: string | null;
        } | null;
      }
    | {
        __typename:
          | "DiscountAutomaticBasic"
          | "DiscountAutomaticBxgy"
          | "DiscountAutomaticFreeShipping";
        title: string;
        status: string;
        startsAt: string | null;
      }
    | null;
}

export interface SearchDiscountResult {
  id: string;
  discountId: string;
  type: AutomaticDiscountTypename;
  title: string;
  status: string;
  startsAt: string | null;
  configMetafield: string | null;
  functionId: string | null;
}

export async function createAutomaticDiscount(
  graphqlProxy: GraphQLProxy,
  title: string,
  functionId: string,
  startsAt: string,
  config: HpnPromoConfig,
  combinesWith: CombinesWithInput
) {
  const configJson = JSON.stringify(config);

  const result = await graphqlProxy(CREATE_AUTOMATIC_DISCOUNT_MUTATION, {
    automaticAppDiscount: {
      title,
      functionId,
      startsAt,
      combinesWith,
      metafields: [
        {
          namespace: "hpn_scripts",
          key: "function_configuration",
          type: "json",
          value: configJson,
        },
      ],
    },
  });

  assertNoGraphqlErrors(result, "CreateHpnDiscount");

  return result.data?.discountAutomaticAppCreate;
}

export async function updateAutomaticDiscount(
  graphqlProxy: GraphQLProxy,
  discountId: string,
  updates: {
    title?: string;
    startsAt?: string;
    config?: HpnPromoConfig;
    combinesWith?: CombinesWithInput;
  }
) {
  const input: Record<string, unknown> = {};

  if (updates.title) {
    input.title = updates.title;
  }

  if (updates.startsAt) {
    input.startsAt = updates.startsAt;
  }

  if (updates.combinesWith) {
    input.combinesWith = updates.combinesWith;
  }

  if (updates.config) {
    input.metafields = [
      {
        namespace: "hpn_scripts",
        key: "function_configuration",
        type: "json",
        value: JSON.stringify(updates.config),
      },
    ];
  }

  const result = await graphqlProxy(UPDATE_AUTOMATIC_DISCOUNT_MUTATION, {
    id: discountId,
    automaticAppDiscount: input,
  });

  assertNoGraphqlErrors(result, "UpdateHpnDiscount");

  return result.data?.discountAutomaticAppUpdate;
}

export async function activateDiscount(
  graphqlProxy: GraphQLProxy,
  discountId: string
) {
  const result = await graphqlProxy(ACTIVATE_DISCOUNT_MUTATION, {
    id: discountId,
  });

  assertNoGraphqlErrors(result, "ActivateDiscount");

  return result.data?.discountAutomaticActivate;
}

export async function deactivateDiscount(
  graphqlProxy: GraphQLProxy,
  discountId: string
) {
  const result = await graphqlProxy(DEACTIVATE_DISCOUNT_MUTATION, {
    id: discountId,
  });

  assertNoGraphqlErrors(result, "DeactivateDiscount");

  return result.data?.discountAutomaticDeactivate;
}

export async function deleteDiscount(
  graphqlProxy: GraphQLProxy,
  discountId: string
) {
  const result = await graphqlProxy(DELETE_DISCOUNT_MUTATION, {
    id: discountId,
  });

  assertNoGraphqlErrors(result, "DeleteDiscount");

  return result.data?.discountAutomaticDelete;
}

export async function searchDiscounts(
  graphqlProxy: GraphQLProxy,
  query: string
): Promise<SearchDiscountResult[]> {
  const escapedQuery = query.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  const result = await graphqlProxy(SEARCH_DISCOUNTS_QUERY, {
    query: `title:'${escapedQuery}'`,
  });

  assertNoGraphqlErrors(result, "SearchDiscounts");

  const nodes: SearchDiscountNode[] =
    result.data?.discountNodes?.edges?.map((edge: { node: SearchDiscountNode }) => edge.node) ??
    [];

  const discounts: SearchDiscountResult[] = [];

  for (const node of nodes) {
    const discount = node.discount;

    if (!discount) {
      continue;
    }

    discounts.push({
      id: node.id,
      discountId:
        discount.__typename === "DiscountAutomaticApp"
          ? discount.discountId
          : node.id,
      type: discount.__typename,
      title: discount.title,
      status: discount.status,
      startsAt: discount.startsAt,
      configMetafield:
        discount.__typename === "DiscountAutomaticApp"
          ? node.metafield?.value ?? null
          : null,
      functionId:
        discount.__typename === "DiscountAutomaticApp"
          ? discount.appDiscountType?.functionId ?? null
          : null,
    });
  }

  return discounts;
}

export interface ListAllDiscountsResult {
  discounts: SearchDiscountResult[];
  truncated: boolean;
}

export async function listAllDiscounts(
  graphqlProxy: GraphQLProxy
): Promise<ListAllDiscountsResult> {
  const result = await graphqlProxy(LIST_ALL_DISCOUNTS_QUERY);

  assertNoGraphqlErrors(result, "ListAllDiscounts");

  const truncated: boolean =
    result.data?.discountNodes?.pageInfo?.hasNextPage === true;

  const nodes: SearchDiscountNode[] =
    result.data?.discountNodes?.edges?.map(
      (edge: { node: SearchDiscountNode }) => edge.node
    ) ?? [];

  const discounts: SearchDiscountResult[] = [];

  for (const node of nodes) {
    const discount = node.discount;

    if (!discount) continue;

    discounts.push({
      id: node.id,
      discountId:
        discount.__typename === "DiscountAutomaticApp"
          ? discount.discountId
          : node.id,
      type: discount.__typename,
      title: discount.title,
      status: discount.status,
      startsAt: discount.startsAt,
      configMetafield:
        discount.__typename === "DiscountAutomaticApp"
          ? node.metafield?.value ?? null
          : null,
      functionId:
        discount.__typename === "DiscountAutomaticApp"
          ? discount.appDiscountType?.functionId ?? null
          : null,
    });
  }

  return { discounts, truncated };
}

// The app handle is set in shopify.app.toml — used to scope function lookup
// to our own app only, preventing accidental matches against other installed apps.
const APP_HANDLE = "hpn-scripts-migration";

export async function findHpnFunctionId(
  graphqlProxy: GraphQLProxy
): Promise<string | null> {
  let result: { data?: any; errors?: any[] };
  try {
    result = await graphqlProxy(GET_SHOPIFY_FUNCTIONS_QUERY);
  } catch (err) {
    console.error("[findHpnFunctionId] GraphQL request failed:", err);
    return null;
  }

  if (result.errors?.length) {
    console.error("[findHpnFunctionId] GraphQL errors:", result.errors);
    return null;
  }

  const nodes: any[] = result.data?.shopifyFunctions?.nodes ?? [];

  // Primary match: function belonging to this app with a discount apiType.
  // Matching by app handle (stable, not editable by store owners) is safer
  // than matching by title, which can be changed in the Partner Dashboard.
  const fn = nodes.find(
    (node) =>
      String(node.app?.handle ?? "") === APP_HANDLE &&
      String(node.apiType ?? "").toLowerCase().includes("discount")
  );

  // Secondary match: title-based within our app only, for dev environments
  // where the app handle may differ from production.
  const fallback = fn ?? nodes.find(
    (node) =>
      String(node.app?.handle ?? "") === APP_HANDLE
  );

  if (!fn && fallback) {
    console.warn(
      "[findHpnFunctionId] No discount function found by apiType for app handle " +
      `"${APP_HANDLE}". Using first function from this app as fallback. ` +
      `Function id: ${fallback.id}, apiType: ${fallback.apiType}`
    );
  }

  if (!fn && !fallback) {
    console.error(
      "[findHpnFunctionId] No Shopify Function found for app handle " +
      `"${APP_HANDLE}". Ensure the app is installed and \`shopify app deploy\` ` +
      "has been run. Functions from other apps will never be used as fallback."
    );
    return null;
  }

  return (fn ?? fallback)?.id ?? null;
}
