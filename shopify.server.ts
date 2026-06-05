import "@shopify/shopify-app-react-router/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  shopifyApp,
} from "@shopify/shopify-app-react-router/server";
import { PostgreSQLSessionStorage } from "@shopify/shopify-app-session-storage-postgresql";

const pgSessionStorage = process.env.DATABASE_URL
  ? new PostgreSQLSessionStorage(new URL(process.env.DATABASE_URL))
  : undefined;

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY!,
  apiSecretKey: process.env.SHOPIFY_API_SECRET!,
  appUrl: process.env.SHOPIFY_APP_URL || "https://localhost:8081",
  scopes: ["write_discounts", "read_products"],
  apiVersion: ApiVersion.October24,
  distribution: AppDistribution.AppStore,
  ...(pgSessionStorage ? { sessionStorage: pgSessionStorage } : {}),
});

export default shopify;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const shopifySessionStorage = shopify.sessionStorage;
