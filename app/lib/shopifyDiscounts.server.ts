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
    discountNodes(first: 10, query: $query) {
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

  return result.data?.discountAutomaticAppUpdate;
}

export async function activateDiscount(
  graphqlProxy: GraphQLProxy,
  discountId: string
) {
  const result = await graphqlProxy(ACTIVATE_DISCOUNT_MUTATION, {
    id: discountId,
  });

  return result.data?.discountAutomaticActivate;
}

export async function deactivateDiscount(
  graphqlProxy: GraphQLProxy,
  discountId: string
) {
  const result = await graphqlProxy(DEACTIVATE_DISCOUNT_MUTATION, {
    id: discountId,
  });

  return result.data?.discountAutomaticDeactivate;
}

export async function deleteDiscount(
  graphqlProxy: GraphQLProxy,
  discountId: string
) {
  const result = await graphqlProxy(DELETE_DISCOUNT_MUTATION, {
    id: discountId,
  });

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

export async function findHpnFunctionId(
  graphqlProxy: GraphQLProxy
): Promise<string | null> {
  try {
    const result = await graphqlProxy(GET_SHOPIFY_FUNCTIONS_QUERY);
    const nodes: any[] = result.data?.shopifyFunctions?.nodes ?? [];

    const discountFunctions = nodes.filter((node) =>
      String(node.apiType ?? "").toLowerCase().includes("discount")
    );

    const fn =
      discountFunctions.find((node) => {
        const appTitle = String(node.app?.title ?? "").toLowerCase();
        const title = String(node.title ?? "").toLowerCase();

        return appTitle.includes("hpn") || title.includes("hpn");
      }) ?? discountFunctions[0];

    return fn?.id ?? null;
  } catch {
    return null;
  }
}
