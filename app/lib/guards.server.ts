

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function guardAppRoute(request: Request): void {
  /*
   * Main embedded-app protection is enforced by:
   * authenticate.admin(request)
   *
   * In this app, that should come from:
   * @shopify/shopify-app-react-router/server
   *
   * This helper is only for extra route-level guards.
   */

  if (WRITE_METHODS.has(request.method)) {
    /*
     * Write requests must be handled inside authenticated actions.
     * Keep this hook available for future internal checks if needed.
     */
    return;
  }
}

export function guardGraphQLConsole(): void {
  if (process.env.ENABLE_GRAPHQL_CONSOLE !== "true") {
    throw new Response(
      "GraphQL Console is disabled. Set ENABLE_GRAPHQL_CONSOLE=true to enable.",
      {
        status: 403,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
        },
      },
    );
  }
}

export function guardNoPolarisDeprecated(): void {
  /*
   * Architectural guard:
   *
   * Do not import @shopify/polaris React components.
   * This app should use Shopify Polaris Web Components instead.
   *
   * Enforce this with ESLint no-restricted-imports.
   */
}

export function guardDevOnlyRoute(): void {
  if (process.env.NODE_ENV === "production") {
    throw new Response("This route is only available in development.", {
      status: 403,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
      },
    });
  }
}

export function guardInternalToolEnabled(
  envName: string,
  label = "Internal tool",
): void {
  if (process.env[envName] !== "true") {
    throw new Response(`${label} is disabled. Set ${envName}=true to enable.`, {
      status: 403,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
      },
    });
  }
}
