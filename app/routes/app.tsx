import { Outlet, useLoaderData, useRouteError } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { authenticate } from "~/shopify.server";
import { AppNav } from "~/components/AppNav";

export async function loader({ request }: LoaderFunctionArgs) {
  await authenticate.admin(request);

  return {
    apiKey: process.env.SHOPIFY_API_KEY!,
  };
}

export default function AppLayout() {
  const { apiKey } = useLoaderData<typeof loader>();

  return (
    <AppProvider embedded apiKey={apiKey}>
      <AppNav />
      <main style={{ padding: "1.5rem 2rem", maxWidth: "1200px" }}>
        <Outlet />
      </main>
    </AppProvider>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  return (
    <div
      style={{
        padding: "2rem",
        backgroundColor: "#fef2f2",
        border: "1px solid #fecaca",
        borderRadius: "0.5rem",
        margin: "2rem",
      }}
    >
      <h2 style={{ color: "#991b1b", marginBottom: "0.5rem" }}>
        Something went wrong
      </h2>
      <pre style={{ fontSize: "0.85rem", color: "#7f1d1d", whiteSpace: "pre-wrap" }}>
        {error instanceof Error ? error.message : String(error)}
      </pre>
    </div>
  );
}
