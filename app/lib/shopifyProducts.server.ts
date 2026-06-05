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
      product {
        id
        title
        handle
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
  const valid: string[] = [];
  const invalid: string[] = [];

  for (const id of productIds) {
    try {
      const product = await getProductById(graphqlProxy, id);

      if (product) {
        valid.push(id);
      } else {
        invalid.push(id);
      }
    } catch {
      invalid.push(id);
    }
  }

  return {
    valid,
    invalid,
  };
}

export async function validateVariantIds(
  graphqlProxy: GraphQLProxyFn,
  variantIds: string[],
): Promise<ValidationResult> {
  const valid: string[] = [];
  const invalid: string[] = [];

  for (const id of variantIds) {
    try {
      const variant = await getVariantById(graphqlProxy, id);

      if (variant) {
        valid.push(id);
      } else {
        invalid.push(id);
      }
    } catch {
      invalid.push(id);
    }
  }

  return {
    valid,
    invalid,
  };
}
