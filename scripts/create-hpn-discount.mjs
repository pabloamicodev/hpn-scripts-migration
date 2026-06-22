import fs from "node:fs";
import process from "node:process";
import pg from "pg";

const { Client } = pg;

const envText = fs.readFileSync(".env", "utf8");
for (const line of envText.split(/\r?\n/)) {
  const match = line.match(/^\s*([^#=]+)=(.*)$/);
  if (!match) continue;
  const [, key, rawValue] = match;
  process.env[key] = rawValue.trim().replace(/^['"]|['"]$/g, "");
}

const DATABASE_URL = process.env.DATABASE_URL;
const FUNCTION_ID_FROM_ENV = process.env.SHOPIFY_DISCOUNT_FUNCTION_ID;
const DISCOUNT_TITLE = "HPN Scripts Migration Discounts";

const config = {
  combinesWith: {
    orderDiscounts: true,
    productDiscounts: true,
    shippingDiscounts: true,
  },
  version: 1,
  rules: [
    {
      id: "pa7-cross-sell",
      type: "pa7_cross_sell",
      enabled: true,
      triggerProductId: "gid://shopify/Product/1313973239892",
      targetProductIds: [
        "gid://shopify/Product/1319321763924",
        "gid://shopify/Product/1313557741652",
      ],
      targetLineQuantityEquals: 1,
      discountPercentage: 10,
      message: "Congratulations! 10% Off (when purchased with PA7)",
    },
    {
      id: "nad3-single-planta-samples",
      type: "required_variants_free_variants",
      enabled: true,
      requiredVariantIds: [
        "gid://shopify/ProductVariant/21174522675284",
        "gid://shopify/ProductVariant/40608348438665",
        "gid://shopify/ProductVariant/40608348373129",
      ],
      freeVariantIds: [
        "gid://shopify/ProductVariant/40608348438665",
        "gid://shopify/ProductVariant/40608348373129",
      ],
      freeQuantityPerLine: 1,
      message: "Free Planta Samples - NAD3 Subscription",
    },
    {
      id: "nad3-240-pouches",
      type: "required_product_with_free_variants",
      enabled: true,
      triggerProductId: "gid://shopify/Product/6784435060873",
      requiredVariantIds: [
        "gid://shopify/ProductVariant/44633124995209",
        "gid://shopify/ProductVariant/44633124864137",
      ],
      freeVariantIds: [
        "gid://shopify/ProductVariant/44633124995209",
        "gid://shopify/ProductVariant/44633124864137",
      ],
      freeQuantityPerLine: 1,
      message: "Free 1-Week Pouches - NAD3 240 Bundle",
    },
  ],
};

if (!DATABASE_URL) {
  throw new Error("DATABASE_URL is missing.");
}

const client = new Client({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const CREATE_MUTATION = `
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

const UPDATE_MUTATION = `
  mutation UpdateHpnDiscount($id: ID!, $automaticAppDiscount: DiscountAutomaticAppInput!) {
    discountAutomaticAppUpdate(id: $id, automaticAppDiscount: $automaticAppDiscount) {
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

const FIND_EXISTING_QUERY = `
  query FindExisting($query: String!) {
    discountNodes(first: 10, query: $query) {
      edges {
        node {
          id
          discount {
            __typename
            ... on DiscountAutomaticApp {
              discountId
              title
              status
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
        }
      }
    }
  }
`;

async function shopifyGraphql(shop, accessToken, query, variables) {
  const response = await fetch(`https://${shop}/admin/api/2026-04/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": accessToken,
    },
    body: JSON.stringify({ query, variables }),
  });

  const result = await response.json();
  if (!response.ok || result.errors) {
    throw new Error(JSON.stringify(result.errors ?? result, null, 2));
  }
  return result;
}

try {
  await client.connect();
  const { rows } = await client.query(`
    SELECT "id", "shop", "scope", "isOnline", "accessToken"
    FROM "shopify_sessions"
    ORDER BY "isOnline" ASC, "shop" ASC
  `);

  const safeSessions = rows.map((row) => ({
    id: row.id,
    shop: row.shop,
    isOnline: row.isOnline,
    scope: row.scope,
    hasToken: Boolean(row.accessToken),
  }));
  console.log("Available sessions:");
  console.log(JSON.stringify(safeSessions, null, 2));

  const session =
    rows.find(
      (row) =>
        row.shop === "hpn-supplements.myshopify.com" &&
        row.isOnline === false &&
        row.accessToken,
    ) ?? rows.find((row) => row.isOnline === false && row.accessToken);

  if (!session) {
    throw new Error("No offline Shopify session with accessToken found.");
  }

  console.log(`Using offline session for ${session.shop}.`);

  let functionId = FUNCTION_ID_FROM_ENV;
  if (!functionId) {
    const functionsResult = await shopifyGraphql(
      session.shop,
      session.accessToken,
      GET_SHOPIFY_FUNCTIONS_QUERY,
      {},
    );
    const functions = functionsResult.data?.shopifyFunctions?.nodes ?? [];
    console.log("Available product discount functions:");
    console.log(
      JSON.stringify(
        functions
          .filter((node) => String(node.apiType ?? "").toLowerCase().includes("discount"))
          .map((node) => ({
            id: node.id,
            title: node.title,
            appTitle: node.app?.title,
          })),
        null,
        2,
      ),
    );

    const fn =
      functions.find(
        (node) =>
          String(node.apiType ?? "").toLowerCase().includes("discount") &&
          (node.title?.toLowerCase().includes("hpn") ||
            node.app?.title?.toLowerCase().includes("hpn")),
      ) ??
      functions.find((node) =>
        String(node.apiType ?? "").toLowerCase().includes("discount")
      );

    functionId = fn?.id;
  }

  if (!functionId) {
    throw new Error("No product discount Shopify Function found.");
  }

  console.log(`Using function ID ${functionId}.`);

  const existing = await shopifyGraphql(
    session.shop,
    session.accessToken,
    FIND_EXISTING_QUERY,
    { query: `title:'${DISCOUNT_TITLE}'` },
  );

  const existingNodes = existing.data?.discountNodes?.edges ?? [];
  if (existingNodes.length > 0) {
    const existingDiscount = existingNodes[0]?.node?.discount;
    console.log("Discount already exists. Updating config metafield:");
    console.log(JSON.stringify(existingNodes, null, 2));

    const updated = await shopifyGraphql(
      session.shop,
      session.accessToken,
      UPDATE_MUTATION,
      {
        id: existingDiscount.discountId,
        automaticAppDiscount: {
          title: DISCOUNT_TITLE,
          discountClasses: ["PRODUCT"],
          combinesWith: config.combinesWith,
          metafields: [
            {
              namespace: "hpn_scripts",
              key: "function_configuration",
              type: "json",
              value: JSON.stringify(config),
            },
          ],
        },
      },
    );

    console.log("Update result:");
    console.log(JSON.stringify(updated.data.discountAutomaticAppUpdate, null, 2));
    process.exit(0);
  }

  const startsAt = new Date().toISOString();
  const created = await shopifyGraphql(
    session.shop,
    session.accessToken,
    CREATE_MUTATION,
    {
      automaticAppDiscount: {
        title: DISCOUNT_TITLE,
        functionId,
        discountClasses: ["PRODUCT"],
        startsAt,
        combinesWith: config.combinesWith,
        metafields: [
          {
            namespace: "hpn_scripts",
            key: "function_configuration",
            type: "json",
            value: JSON.stringify(config),
          },
        ],
      },
    },
  );

  console.log("Create result:");
  console.log(JSON.stringify(created.data.discountAutomaticAppCreate, null, 2));
} finally {
  await client.end().catch(() => {});
}
