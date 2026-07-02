import type { LoaderFunctionArgs } from "react-router";
import { shopifySessionStorage } from "~/shopify.server";

// TEMPORARY diagnostic route — remove after debugging the One Sol 401.
// Protected by a shared secret so it can't be scraped by outsiders.
export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const key = url.searchParams.get("key");
  const shop = url.searchParams.get("shop");

  if (!shop || key !== process.env.SHOPIFY_API_SECRET_ONE_SOL) {
    return new Response("Not found", { status: 404 });
  }

  const sessions = await shopifySessionStorage.findSessionsByShop(shop);

  const liveChecks = await Promise.all(
    sessions.map(async (s) => {
      if (!s.accessToken) return { id: s.id, liveCheck: "no-token" };
      try {
        const res = await fetch(`https://${shop}/admin/api/2026-04/graphql.json`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Shopify-Access-Token": s.accessToken,
          },
          body: JSON.stringify({ query: "{ shop { name myshopifyDomain } }" }),
        });
        const bodyText = await res.text();
        return {
          id: s.id,
          liveCheckStatus: res.status,
          liveCheckStatusText: res.statusText,
          liveCheckBody: bodyText.slice(0, 500),
        };
      } catch (err) {
        return { id: s.id, liveCheckError: err instanceof Error ? err.message : String(err) };
      }
    }),
  );

  return {
    shop,
    count: sessions.length,
    sessions: sessions.map((s) => ({
      id: s.id,
      isOnline: s.isOnline,
      scope: s.scope,
      expires: s.expires,
      accessTokenPresent: Boolean(s.accessToken),
      accessTokenLength: s.accessToken?.length ?? 0,
      accessTokenPrefix: s.accessToken?.slice(0, 8) ?? null,
      onlineAccessInfo: s.onlineAccessInfo ?? null,
    })),
    liveChecks,
  };
}
