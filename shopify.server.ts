import "@shopify/shopify-app-react-router/adapters/node";

const globalWithRejectionHandler = globalThis as typeof globalThis & {
  hpnUnhandledRejectionHandlerInstalled?: boolean;
};
if (!globalWithRejectionHandler.hpnUnhandledRejectionHandlerInstalled) {
  process.on("unhandledRejection", (reason) => {
    console.error(
      "[unhandledRejection]",
      reason instanceof Error ? reason.message : reason,
    );
  });
  globalWithRejectionHandler.hpnUnhandledRejectionHandlerInstalled = true;
}
import {
  ApiVersion,
  AppDistribution,
  shopifyApp,
} from "@shopify/shopify-app-react-router/server";
import { PostgreSQLSessionStorage } from "@shopify/shopify-app-session-storage-postgresql";

// Fail fast at startup — never silently degrade to in-memory sessions on Vercel
const REQUIRED_ENV = [
  "SHOPIFY_API_KEY",
  "SHOPIFY_API_SECRET",
  "SHOPIFY_APP_URL",
  "DATABASE_URL",
] as const;
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
  if (!url.searchParams.has("connect_timeout")) {
    url.searchParams.append("connect_timeout", "15");
  }
  return new PostgreSQLSessionStorage(url);
})();

function makeShopifyInstance(apiKey: string, apiSecretKey: string) {
  return shopifyApp({
    apiKey,
    apiSecretKey,
    appUrl: process.env.SHOPIFY_APP_URL || "https://localhost:8081",
    scopes: ["write_discounts", "read_products"],
    apiVersion: ApiVersion.April26,
    distribution: AppDistribution.SingleMerchant,
    sessionStorage: pgSessionStorage,
  });
}

// Primary instance — HPN LLC (hpn-supplements + gettrusupps)
const shopify = makeShopifyInstance(
  process.env.SHOPIFY_API_KEY!,
  process.env.SHOPIFY_API_SECRET!,
);

// Secondary instance — ONE SOL SUPPLEMENTS LLC (onesolsupps)
// Only created when One Sol credentials are provided.
const shopifyOneSol =
  process.env.SHOPIFY_API_KEY_ONE_SOL && process.env.SHOPIFY_API_SECRET_ONE_SOL
    ? makeShopifyInstance(
        process.env.SHOPIFY_API_KEY_ONE_SOL,
        process.env.SHOPIFY_API_SECRET_ONE_SOL,
      )
    : null;

const ONE_SOL_SHOP = "onesolsupps.myshopify.com";

// Detect which shop is making the request so we can pick the right credentials.
function detectShop(request: Request): string | null {
  const url = new URL(request.url);

  // Direct shop param (OAuth flow, session-token exchange)
  const shopParam = url.searchParams.get("shop");
  if (shopParam) return shopParam;

  // host param is base64(admin.shopify.com/store/<shop_name>)
  const host = url.searchParams.get("host");
  if (host) {
    try {
      const decoded = Buffer.from(host, "base64url").toString("utf-8");
      const m = decoded.match(/\/store\/([^/]+)/);
      if (m) return `${m[1]}.myshopify.com`;
    } catch { /* ignore */ }
  }

  // Bearer JWT — decode payload (no verify) to get the dest claim
  const auth = request.headers.get("Authorization");
  if (auth?.startsWith("Bearer ")) {
    try {
      const payload = auth.slice(7).split(".")[1];
      const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf-8")) as { dest?: string };
      if (decoded.dest) {
        const m = decoded.dest.match(/https?:\/\/([^/]+)/);
        if (m) return m[1];
      }
    } catch { /* ignore */ }
  }

  return null;
}

function pickInstance(request: Request) {
  if (shopifyOneSol && detectShop(request) === ONE_SOL_SHOP) {
    return shopifyOneSol;
  }
  return shopify;
}

// Proxy authenticate — routes to the correct shopify instance
export const authenticate: typeof shopify.authenticate = new Proxy(
  shopify.authenticate,
  {
    get(_, prop) {
      return (...args: unknown[]) => {
        const request = args[0] as Request;
        const instance = pickInstance(request);
        const auth = instance.authenticate as unknown as Record<string, unknown>;
        const method = auth[prop as string];
        if (typeof method === "function") {
          return (method as (...a: unknown[]) => unknown).apply(instance.authenticate, args);
        }
        return (shopify.authenticate as unknown as Record<string, unknown>)[prop as string];
      };
    },
  },
) as typeof shopify.authenticate;

export default shopify;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const shopifySessionStorage = shopify.sessionStorage;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
