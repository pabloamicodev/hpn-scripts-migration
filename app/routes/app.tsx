import {
  isRouteErrorResponse,
  Outlet,
  useLoaderData,
  useRouteError,
} from "react-router";
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
      <div className="app-shell">
        <main className="app-main">
          <Outlet />
        </main>
      </div>
    </AppProvider>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  const message = isRouteErrorResponse(error)
    ? typeof error.data === "string"
      ? error.data
      : error.statusText
    : error instanceof Error
      ? error.message
      : "Unexpected application error.";

  return (
    <div className="app-shell">
      <main className="app-main">
    <div className="alert alert--critical">
      <h2 className="card__title" style={{ marginBottom: "8px" }}>
        Something went wrong
      </h2>
      <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>
        {message}
      </pre>
    </div>
      </main>
    </div>
  );
}
