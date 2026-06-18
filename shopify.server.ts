import "@shopify/shopify-app-react-router/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  shopifyApp,
} from "@shopify/shopify-app-react-router/server";
import { PostgreSQLSessionStorage } from "@shopify/shopify-app-session-storage-postgresql";

// Fail fast at startup — never silently degrade to in-memory sessions on Vercel
const REQUIRED_ENV = ["SHOPIFY_API_KEY", "SHOPIFY_API_SECRET", "DATABASE_URL"] as const;
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    throw new Error(
      `Missing required environment variable: ${key}. ` +
      `Configure it in Vercel → Settings → Environment Variables ` +
      `(Neon provides DATABASE_URL automatically on project creation).`
    );
  }
}

const pgSessionStorage = (() => {
  const raw = process.env.DATABASE_URL!;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(
      `DATABASE_URL is not a valid connection URL. ` +
      `Check Neon project settings. Value starts with: ${raw.slice(0, 20)}...`
    );
  }
  if (!url.searchParams.has("sslmode")) {
    url.searchParams.append("sslmode", "require");
  }
  return new PostgreSQLSessionStorage(url);
})();

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY!,
  apiSecretKey: process.env.SHOPIFY_API_SECRET!,
  appUrl: process.env.SHOPIFY_APP_URL || "https://localhost:8081",
  scopes: ["write_discounts", "read_products"],
  apiVersion: ApiVersion.April26,
  distribution: AppDistribution.AppStore,
  sessionStorage: pgSessionStorage,
});

export default shopify;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const shopifySessionStorage = shopify.sessionStorage;
