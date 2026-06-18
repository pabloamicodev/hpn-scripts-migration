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
import { DevErrorBanner } from "~/components/DevErrorBanner";
import type { ActionError } from "~/lib/actionError.server";

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

  // Structured loader errors thrown via loaderError() — render with DevErrorBanner
  if (isRouteErrorResponse(error)) {
    // Try to parse as our ActionError JSON shape
    let structuredError: ActionError | null = null;
    if (typeof error.data === "string") {
      try {
        const parsed = JSON.parse(error.data);
        if (parsed && typeof parsed.operation === "string") {
          structuredError = parsed as ActionError;
        }
      } catch {
        // Not our format — fall through
      }
    } else if (
      error.data &&
      typeof error.data === "object" &&
      typeof (error.data as ActionError).operation === "string"
    ) {
      structuredError = error.data as ActionError;
    }

    if (structuredError) {
      return (
        <div className="app-shell">
          <main className="app-main">
            <div className="page-header" style={{ marginBottom: 0 }}>
              <h1 className="page-title">Page failed to load</h1>
            </div>
            <DevErrorBanner error={structuredError} />
          </main>
        </div>
      );
    }

    // Plain HTTP error (404, 403, guard throws, etc.)
    const message =
      typeof error.data === "string" ? error.data : error.statusText;

    return (
      <div className="app-shell">
        <main className="app-main">
          <div className="alert alert--critical">
            <h2 className="card__title card__title--spaced">
              {error.status} — {error.statusText}
            </h2>
            {message && (
              <pre className="alert__pre alert__pre--flush">{message}</pre>
            )}
          </div>
        </main>
      </div>
    );
  }

  // Unexpected runtime errors: full details in dev, generic in production
  const isDev =
    typeof process !== "undefined" && process.env.NODE_ENV !== "production";
  const devMessage =
    error instanceof Error
      ? `${error.message}\n\n${error.stack ?? ""}`
      : String(error);

  return (
    <div className="app-shell">
      <main className="app-main">
        <div className="alert alert--critical">
          <h2 className="card__title card__title--spaced">Something went wrong</h2>
          {isDev ? (
            <pre className="alert__pre alert__pre--flush">{devMessage}</pre>
          ) : (
            <p>An unexpected error occurred. Please try again or contact support.</p>
          )}
        </div>
      </main>
    </div>
  );
}
