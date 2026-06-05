import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { login } from "~/shopify.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  
  if (!shop) {
    // Si no hay shop en la URL, intenta obtenerlo del header
    const shopFromHeader = request.headers.get("X-Shopify-Shop-Domain");
    if (shopFromHeader) {
      const redirectUrl = new URL(request.url);
      redirectUrl.searchParams.set("shop", shopFromHeader);
      throw redirect(redirectUrl.toString());
    }
  }
  
  return login(request);
}
