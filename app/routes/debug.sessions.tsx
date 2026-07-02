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
  };
}
