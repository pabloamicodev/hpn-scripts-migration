export interface GraphqlErrorNode {
  message: string;
  path?: Array<string | number>;
  extensions?: Record<string, unknown>;
}

export interface GraphqlProxyResponse<TData> {
  data?: TData;
  errors?: GraphqlErrorNode[];
}

export type GraphQLProxyFn = <TData = unknown>(
  query: string,
  variables?: Record<string, unknown>,
) => Promise<GraphqlProxyResponse<TData>>;

const SEARCH_PRODUCTS_QUERY = `
  query SearchProducts($query: String!, $first: Int!) {
    products(first: $first, query: $query) {
      nodes {
        id
        title
        handle
        vendor
        featuredImage {
          url
          altText
        }
        variants(first: 50) {
          nodes {
            id
            title
            sku
            price
            inventoryQuantity
            selectedOptions {
              name
              value
            }
            image {
              url
              altText
            }
          }
        }
      }
    }
  }
`;

const LIST_PRODUCTS_QUERY = `
  query ListProducts($first: Int!) {
    products(first: $first) {
      nodes {
        id
        title
        handle
        vendor
        featuredImage {
          url
          altText
        }
        variants(first: 50) {
          nodes {
            id
            title
            sku
            price
            inventoryQuantity
            selectedOptions {
              name
              value
            }
            image {
              url
              altText
            }
          }
        }
      }
    }
  }
`;

const GET_PRODUCT_BY_ID_QUERY = `
  query GetProduct($id: ID!) {
    product(id: $id) {
      id
      title
      handle
      vendor
      featuredImage {
        url
        altText
      }
      variants(first: 50) {
        nodes {
          id
          title
          sku
          price
          inventoryQuantity
          selectedOptions {
            name
            value
          }
        }
      }
    }
  }
`;

const GET_VARIANT_BY_ID_QUERY = `
  query GetVariant($id: ID!) {
    productVariant(id: $id) {
      id
      title
      sku
      price
      inventoryQuantity
      availableForSale
      selectedOptions {
        name
        value
      }
      image {
        url
        altText
      }
      product {
        id
        title
        handle
        vendor
        featuredImage {
          url
          altText
        }
      }
    }
  }
`;

export interface ProductVariantNode {
  id: string;
  title: string;
  sku?: string | null;
  price: string;
  inventoryQuantity?: number | null;
  availableForSale?: boolean;
  selectedOptions?: Array<{
    name: string;
    value: string;
  }>;
  image?: {
    url: string;
    altText?: string | null;
  } | null;
}

export interface ProductNode {
  id: string;
  title: string;
  handle: string;
  vendor?: string | null;
  featuredImage?: {
    url: string;
    altText?: string | null;
  } | null;
  variants: {
    nodes: ProductVariantNode[];
  };
}

export interface ProductVariantWithProductNode extends ProductVariantNode {
  product: {
    id: string;
    title: string;
    handle: string;
    vendor?: string | null;
    featuredImage?: {
      url: string;
      altText?: string | null;
    } | null;
  };
}

interface SearchProductsData {
  products?: {
    nodes?: ProductNode[];
  };
}

interface GetProductByIdData {
  product?: ProductNode | null;
}

interface GetVariantByIdData {
  productVariant?: ProductVariantWithProductNode | null;
}

export interface ValidationResult {
  valid: string[];
  invalid: string[];
}

function getGraphqlErrorMessage(errors: GraphqlErrorNode[]) {
  return errors.map((error) => error.message).join("; ");
}

function assertNoGraphqlErrors<TData>(
  result: GraphqlProxyResponse<TData>,
  operationName: string,
): void {
  if (result.errors?.length) {
    throw new Error(
      `${operationName} failed: ${getGraphqlErrorMessage(result.errors)}`,
    );
  }
}

function clampProductSearchLimit(first: number) {
  return Math.max(1, Math.min(first, 50));
}

export async function searchProducts(
  graphqlProxy: GraphQLProxyFn,
  query: string,
  first = 20,
): Promise<ProductNode[]> {
  const result = await graphqlProxy<SearchProductsData>(SEARCH_PRODUCTS_QUERY, {
    query,
    first: clampProductSearchLimit(first),
  });

  assertNoGraphqlErrors(result, "SearchProducts");

  return result.data?.products?.nodes ?? [];
}

export async function listProducts(
  graphqlProxy: GraphQLProxyFn,
  first = 20,
): Promise<ProductNode[]> {
  const result = await graphqlProxy<SearchProductsData>(LIST_PRODUCTS_QUERY, {
    first: clampProductSearchLimit(first),
  });

  assertNoGraphqlErrors(result, "ListProducts");

  return result.data?.products?.nodes ?? [];
}

export async function getProductById(
  graphqlProxy: GraphQLProxyFn,
  id: string,
): Promise<ProductNode | null> {
  const result = await graphqlProxy<GetProductByIdData>(
    GET_PRODUCT_BY_ID_QUERY,
    {
      id,
    },
  );

  assertNoGraphqlErrors(result, "GetProduct");

  return result.data?.product ?? null;
}

export async function getVariantById(
  graphqlProxy: GraphQLProxyFn,
  id: string,
): Promise<ProductVariantWithProductNode | null> {
  const result = await graphqlProxy<GetVariantByIdData>(
    GET_VARIANT_BY_ID_QUERY,
    {
      id,
    },
  );

  assertNoGraphqlErrors(result, "GetVariant");

  return result.data?.productVariant ?? null;
}

export async function validateProductIds(
  graphqlProxy: GraphQLProxyFn,
  productIds: string[],
): Promise<ValidationResult> {
  const results = await Promise.all(
    productIds.map(async (id) => {
      try {
        const product = await getProductById(graphqlProxy, id);
        return { id, ok: Boolean(product) };
      } catch {
        return { id, ok: false };
      }
    }),
  );

  return {
    valid: results.filter((r) => r.ok).map((r) => r.id),
    invalid: results.filter((r) => !r.ok).map((r) => r.id),
  };
}

export async function validateVariantIds(
  graphqlProxy: GraphQLProxyFn,
  variantIds: string[],
): Promise<ValidationResult> {
  const results = await Promise.all(
    variantIds.map(async (id) => {
      try {
        const variant = await getVariantById(graphqlProxy, id);
        return { id, ok: Boolean(variant) };
      } catch {
        return { id, ok: false };
      }
    }),
  );

  return {
    valid: results.filter((r) => r.ok).map((r) => r.id),
    invalid: results.filter((r) => !r.ok).map((r) => r.id),
  };
}
