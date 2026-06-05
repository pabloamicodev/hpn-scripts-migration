import { Outlet, useRouteError } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "~/shopify.server";
import { AppNav } from "~/components/AppNav";

export async function loader({ request }: LoaderFunctionArgs) {
  await authenticate.admin(request);
  return null;
}

export default function AppLayout() {
  return (
    <>
      <AppNav />
      <main style={{ padding: "1.5rem 2rem", maxWidth: "1200px" }}>
        <Outlet />
      </main>
    </>
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
