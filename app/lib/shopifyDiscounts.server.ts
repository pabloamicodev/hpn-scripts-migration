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
    automaticDiscountNodes(first: 10, query: $query) {
      nodes {
        automaticDiscount {
          discountId
          title
          status
          startsAt
          metafield(namespace: "hpn_scripts", key: "function_configuration") {
            value
          }
        }
      }
    }
  }
`;

interface GraphQLProxy {
  (query: string, variables?: Record<string, unknown>): Promise<{ data: any; errors?: any[] }>;
}

export async function createAutomaticDiscount(
  graphqlProxy: GraphQLProxy,
  title: string,
  functionId: string,
  startsAt: string,
  config: HpnPromoConfig,
  combinesWith: { orderDiscounts: boolean; productDiscounts: boolean; shippingDiscounts: boolean }
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
    combinesWith?: { orderDiscounts: boolean; productDiscounts: boolean; shippingDiscounts: boolean };
  }
) {
  const input: any = {};
  if (updates.title) input.title = updates.title;
  if (updates.startsAt) input.startsAt = updates.startsAt;
  if (updates.combinesWith) input.combinesWith = updates.combinesWith;
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

export async function activateDiscount(graphqlProxy: GraphQLProxy, discountId: string) {
  const result = await graphqlProxy(ACTIVATE_DISCOUNT_MUTATION, { id: discountId });
  return result.data?.discountAutomaticActivate;
}

export async function deactivateDiscount(graphqlProxy: GraphQLProxy, discountId: string) {
  const result = await graphqlProxy(DEACTIVATE_DISCOUNT_MUTATION, { id: discountId });
  return result.data?.discountAutomaticDeactivate;
}

export async function deleteDiscount(graphqlProxy: GraphQLProxy, discountId: string) {
  const result = await graphqlProxy(DELETE_DISCOUNT_MUTATION, { id: discountId });
  return result.data?.discountAutomaticDelete;
}

export async function searchDiscounts(graphqlProxy: GraphQLProxy, query: string) {
  const result = await graphqlProxy(SEARCH_DISCOUNTS_QUERY, { query });
  return result.data?.automaticDiscountNodes?.nodes || [];
}

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

export async function findHpnFunctionId(graphqlProxy: GraphQLProxy): Promise<string | null> {
  try {
    const result = await graphqlProxy(GET_SHOPIFY_FUNCTIONS_QUERY);
    const nodes: any[] = result.data?.shopifyFunctions?.nodes ?? [];
    const fn = nodes.find(
      (n) =>
        n.apiType === "product_discounts" &&
        (n.app?.title?.toLowerCase().includes("hpn") ||
          n.title?.toLowerCase().includes("hpn"))
    ) ?? nodes.find((n) => n.apiType === "product_discounts");
    return fn?.id ?? null;
  } catch {
    return null;
  }
}
