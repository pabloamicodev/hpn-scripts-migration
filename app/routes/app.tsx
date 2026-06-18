import {
  isRouteErrorResponse,
  Outlet,
  useLoaderData,
  useNavigation,
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

const DOT_COLORS = ["#2c6ecb", "#10b981", "#f59e0b"];

export default function AppLayout() {
  const { apiKey } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const isNavigating = navigation.state === "loading";

  return (
    <AppProvider embedded apiKey={apiKey}>
      {isNavigating && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 2147483647,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(241, 241, 241, 0.72)",
            backdropFilter: "blur(2px)",
          }}
        >
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 10,
              padding: "0 16px",
              minHeight: 40,
              background: "rgba(255,255,255,0.96)",
              borderRadius: 999,
              border: "1px solid rgba(28,25,23,0.10)",
              boxShadow: "0 8px 24px rgba(28,25,23,0.12)",
              fontSize: 13,
              fontWeight: 600,
              color: "#1c1917",
            }}
          >
            <span style={{ display: "inline-flex", gap: 3 }}>
              {DOT_COLORS.map((color, i) => (
                <span
                  key={color}
                  style={{
                    display: "inline-block",
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: color,
                    animation: `b-dot 850ms ease-in-out ${i * 110}ms infinite`,
                  }}
                />
              ))}
            </span>
            Loading
          </div>
        </div>
      )}
      <a href="#main-content" className="skip-link visually-hidden">
        Skip to main content
      </a>
      <AppNav />
      <div className="app-shell">
        <main id="main-content" className="app-main" tabIndex={-1}>
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
      <h2 className="card__title card__title--spaced">
        Something went wrong
      </h2>
      <pre className="alert__pre alert__pre--flush">
        {message}
      </pre>
    </div>
      </main>
    </div>
  );
}
