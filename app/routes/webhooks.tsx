import type { ActionFunctionArgs } from "react-router";
import { authenticate, shopifySessionStorage } from "~/shopify.server";
import { logger } from "~/lib/logger";

export async function loader() {
  return new Response("Method Not Allowed", {
    status: 405,
    headers: { Allow: "POST" },
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const { topic, shop, webhookId } = await authenticate.webhook(request);

  switch (topic) {
    case "APP_UNINSTALLED": {
      const sessions = await shopifySessionStorage.findSessionsByShop(shop);
      if (sessions.length > 0) {
        await shopifySessionStorage.deleteSessions(
          sessions.map((session) => session.id),
        );
      }
      logger.warn("[webhook] App uninstalled; sessions deleted.", {
        shop,
        webhookId,
        sessionCount: sessions.length,
      });
      break;
    }
    case "CUSTOMERS_DATA_REQUEST":
    case "CUSTOMERS_REDACT":
    case "SHOP_REDACT":
      // This app stores Shopify authentication sessions only. It does not
      // persist customer records, orders, carts, or checkout data.
      logger.warn("[webhook] Compliance webhook acknowledged.", {
        shop,
        topic,
        webhookId,
      });
      break;
    default:
      logger.warn("[webhook] Unhandled authenticated webhook.", {
        shop,
        topic,
        webhookId,
      });
  }

  return new Response(null, { status: 200 });
}
