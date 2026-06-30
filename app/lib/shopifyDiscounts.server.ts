import type { HpnPromoConfig } from "./validations";
import { logger } from "./logger";

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
      automaticDiscountNode {
        id
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
      automaticDiscountNode {
        id
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
  query ListAllDiscounts($cursor: String) {
    discountNodes(first: 50, after: $cursor) {
      pageInfo {
        hasNextPage
        endCursor
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

            ... on DiscountCodeBasic {
              title
              status
              startsAt
            }

            ... on DiscountCodeBxgy {
              title
              status
              startsAt
            }

            ... on DiscountCodeFreeShipping {
              title
              status
              startsAt
            }

            ... on DiscountCodeApp {
              title
              status
              startsAt
              appDiscountType {
                functionId
              }
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

interface GraphQLError {
  message: string;
  locations?: { line: number; column: number }[];
  path?: (string | number)[];
  extensions?: Record<string, unknown>;
}

interface GraphQLProxy {
  <T extends object = Record<string, unknown>>(
    query: string,
    variables?: Record<string, unknown>
  ): Promise<{ data?: T; errors?: GraphQLError[] }>;
}

interface DiscountUserError {
  field: string[] | null;
  message: string;
}

interface AutomaticAppDiscountFragment {
  discountId: string;
  title: string;
  status: string;
  startsAt?: string | null;
}

interface CreateDiscountData {
  discountAutomaticAppCreate: {
    automaticAppDiscount: AutomaticAppDiscountFragment;
    userErrors: DiscountUserError[];
  };
}

interface UpdateDiscountData {
  discountAutomaticAppUpdate: {
    automaticAppDiscount: Omit<AutomaticAppDiscountFragment, "startsAt">;
    userErrors: DiscountUserError[];
  };
}

interface ActivateDiscountData {
  discountAutomaticActivate: {
    automaticDiscountNode: { id: string } | null;
    userErrors: DiscountUserError[];
  };
}

interface DeactivateDiscountData {
  discountAutomaticDeactivate: {
    automaticDiscountNode: { id: string } | null;
    userErrors: DiscountUserError[];
  };
}

interface DeleteDiscountData {
  discountAutomaticDelete: {
    deletedAutomaticAppDiscountId: string | null;
    userErrors: DiscountUserError[];
  };
}

function getGraphqlErrorMessage(errors?: GraphQLError[]) {
  return errors?.map((error) => error.message ?? String(error)).join(", ");
}

function assertNoGraphqlErrors(
  result: { errors?: GraphQLError[] },
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

const HPN_DISCOUNT_CLASSES = ["PRODUCT"] as const;

type DiscountTypename =
  | "DiscountAutomaticApp"
  | "DiscountAutomaticBasic"
  | "DiscountAutomaticBxgy"
  | "DiscountAutomaticFreeShipping"
  | "DiscountCodeBasic"
  | "DiscountCodeBxgy"
  | "DiscountCodeFreeShipping"
  | "DiscountCodeApp";

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
        appDiscountType?: { functionId: string | null } | null;
      }
    | {
        __typename:
          | "DiscountAutomaticBasic"
          | "DiscountAutomaticBxgy"
          | "DiscountAutomaticFreeShipping"
          | "DiscountCodeBasic"
          | "DiscountCodeBxgy"
          | "DiscountCodeFreeShipping";
        title: string;
        status: string;
        startsAt: string | null;
      }
    | {
        __typename: "DiscountCodeApp";
        title: string;
        status: string;
        startsAt: string | null;
        appDiscountType?: { functionId: string | null } | null;
      }
    | null;
}

export interface SearchDiscountResult {
  id: string;
  discountId: string;
  type: DiscountTypename;
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

  const result = await graphqlProxy<CreateDiscountData>(CREATE_AUTOMATIC_DISCOUNT_MUTATION, {
    automaticAppDiscount: {
      title,
      functionId,
      discountClasses: HPN_DISCOUNT_CLASSES,
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
  const input: Record<string, unknown> = {
    discountClasses: HPN_DISCOUNT_CLASSES,
  };

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

  const result = await graphqlProxy<UpdateDiscountData>(UPDATE_AUTOMATIC_DISCOUNT_MUTATION, {
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
  const result = await graphqlProxy<ActivateDiscountData>(ACTIVATE_DISCOUNT_MUTATION, {
    id: discountId,
  });

  assertNoGraphqlErrors(result, "ActivateDiscount");

  return result.data?.discountAutomaticActivate;
}

export async function deactivateDiscount(
  graphqlProxy: GraphQLProxy,
  discountId: string
) {
  const result = await graphqlProxy<DeactivateDiscountData>(DEACTIVATE_DISCOUNT_MUTATION, {
    id: discountId,
  });

  assertNoGraphqlErrors(result, "DeactivateDiscount");

  return result.data?.discountAutomaticDeactivate;
}

export async function deleteDiscount(
  graphqlProxy: GraphQLProxy,
  discountId: string
) {
  const result = await graphqlProxy<DeleteDiscountData>(DELETE_DISCOUNT_MUTATION, {
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
  interface SearchDiscountsData {
    discountNodes: { edges: { node: SearchDiscountNode }[] };
  }
  const result = await graphqlProxy<SearchDiscountsData>(SEARCH_DISCOUNTS_QUERY, {
    query: `title:'${escapedQuery}'`,
  });

  assertNoGraphqlErrors(result, "SearchDiscounts");

  const nodes: SearchDiscountNode[] =
    result.data?.discountNodes?.edges?.map((edge) => edge.node) ?? [];

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
  endCursor: string | null;
}

export async function listAllDiscounts(
  graphqlProxy: GraphQLProxy,
  cursor?: string | null
): Promise<ListAllDiscountsResult> {
  interface ListAllDiscountsData {
    discountNodes: {
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
      edges: { node: SearchDiscountNode }[];
    };
  }
  const result = await graphqlProxy<ListAllDiscountsData>(LIST_ALL_DISCOUNTS_QUERY, cursor ? { cursor } : {});

  assertNoGraphqlErrors(result, "ListAllDiscounts");

  const pageInfo = result.data?.discountNodes?.pageInfo;
  const truncated: boolean = pageInfo?.hasNextPage === true;
  const endCursor: string | null = pageInfo?.endCursor ?? null;

  const nodes: SearchDiscountNode[] =
    result.data?.discountNodes?.edges?.map((edge) => edge.node) ?? [];

  const discounts: SearchDiscountResult[] = [];

  const KNOWN_TYPES: DiscountTypename[] = [
    "DiscountAutomaticApp",
    "DiscountAutomaticBasic",
    "DiscountAutomaticBxgy",
    "DiscountAutomaticFreeShipping",
    "DiscountCodeBasic",
    "DiscountCodeBxgy",
    "DiscountCodeFreeShipping",
    "DiscountCodeApp",
  ];

  for (const node of nodes) {
    const discount = node.discount;

    // Skip null or unrecognized types — their inline fragments won't have spread
    // so title/status would be undefined at runtime.
    if (!discount || !KNOWN_TYPES.includes(discount.__typename as DiscountTypename)) continue;

    const isAutomaticApp = discount.__typename === "DiscountAutomaticApp";
    const isCodeApp = discount.__typename === "DiscountCodeApp";

    discounts.push({
      id: node.id,
      discountId: isAutomaticApp ? discount.discountId : node.id,
      type: discount.__typename as DiscountTypename,
      title: discount.title,
      status: discount.status,
      startsAt: discount.startsAt,
      configMetafield: isAutomaticApp ? node.metafield?.value ?? null : null,
      functionId:
        isAutomaticApp || isCodeApp
          ? discount.appDiscountType?.functionId ?? null
          : null,
    });
  }

  return { discounts, truncated, endCursor };
}

// The app handle is set in shopify.app.toml — used to scope function lookup
// to our own app only, preventing accidental matches against other installed apps.
// hpn-supplements and gettrusupps share the same Partner app/handle; One Sol
// is a separate Partner org with its own client_id and handle (shopify.app.one-sol.toml).
const DEFAULT_APP_HANDLE = "hpn-scripts-migration";
const SHOP_APP_HANDLES: Record<string, string> = {
  "onesolsupps.myshopify.com": "script-migration-one-sol",
};

export async function findHpnFunctionId(
  graphqlProxy: GraphQLProxy,
  shop?: string,
): Promise<string | null> {
  const configuredFunctionId = process.env.SHOPIFY_DISCOUNT_FUNCTION_ID?.trim();
  if (configuredFunctionId) {
    if (configuredFunctionId.startsWith("gid://shopify/ShopifyFunction/")) {
      return configuredFunctionId;
    }
    logger.error(
      "[findHpnFunctionId] SHOPIFY_DISCOUNT_FUNCTION_ID is not a ShopifyFunction GID.",
    );
  }

  const appHandle =
    (shop && SHOP_APP_HANDLES[shop]) ||
    process.env.SHOPIFY_APP_HANDLE?.trim() ||
    DEFAULT_APP_HANDLE;
  interface ShopifyFunctionNode {
    id: string;
    title: string;
    apiType: string;
    app: { title: string; handle: string } | null;
  }
  interface GetShopifyFunctionsData {
    shopifyFunctions: { nodes: ShopifyFunctionNode[] };
  }

  let result: Awaited<ReturnType<typeof graphqlProxy<GetShopifyFunctionsData>>>;
  try {
    result = await graphqlProxy<GetShopifyFunctionsData>(GET_SHOPIFY_FUNCTIONS_QUERY);
  } catch (err) {
    logger.error("[findHpnFunctionId] GraphQL request failed:", err);
    return null;
  }

  if (result.errors?.length) {
    logger.error("[findHpnFunctionId] GraphQL errors:", result.errors);
    return null;
  }

  const nodes: ShopifyFunctionNode[] = result.data?.shopifyFunctions?.nodes ?? [];

  // Primary match: function belonging to this app with a discount apiType.
  // Matching by app handle (stable, not editable by store owners) is safer
  // than matching by title, which can be changed in the Partner Dashboard.
  const fn = nodes.find(
    (node) =>
      String(node.app?.handle ?? "") === appHandle &&
      String(node.apiType ?? "").toLowerCase().includes("discount")
  );

  // Secondary match: title-based within our app only, for dev environments
  // where the app handle may differ from production.
  const fallback = fn ?? nodes.find(
    (node) =>
      String(node.app?.handle ?? "") === appHandle
  );

  if (!fn && fallback) {
    logger.warn(
      "[findHpnFunctionId] No discount function found by apiType for app handle " +
      `"${appHandle}". Using first function from this app as fallback. ` +
      `Function id: ${fallback.id}, apiType: ${fallback.apiType}`
    );
  }

  if (!fn && !fallback) {
    logger.error(
      "[findHpnFunctionId] No Shopify Function found for app handle " +
      `"${appHandle}". Ensure the app is installed and \`shopify app deploy\` ` +
      "has been run. Functions from other apps will never be used as fallback."
    );
    return null;
  }

  return (fn ?? fallback)?.id ?? null;
}
