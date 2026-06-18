// Server-side error utilities.
// Produces serializable ActionError objects for both inline action display
// and structured loader error Responses (caught by ErrorBoundary).

export interface ActionError {
  /** Human-readable summary of what went wrong. */
  message: string;
  /** The operation that was executing, e.g. "createDiscount", "saveConfig". */
  operation: string;
  /** Granular sub-errors: Shopify userErrors with field paths, validation issues. */
  details: string[];
  /** Developer hint — what to check or do next. */
  hint?: string;
  /** Full stack trace — only included in NODE_ENV !== "production". */
  stack?: string;
  /** ISO timestamp for correlation with server logs. */
  timestamp: string;
}

type ShopifyUserError = {
  field?: string[] | null;
  message: string;
};

/**
 * Converts Shopify GraphQL userErrors to readable detail strings,
 * preserving the field path so the developer knows exactly which field failed.
 * e.g. ["automaticAppDiscount.title: can't be blank"]
 */
export function shopifyUserErrors(errors: ShopifyUserError[]): string[] {
  return errors.map((e) => {
    const path = e.field?.length ? `${e.field.join(".")}: ` : "";
    return `${path}${e.message}`;
  });
}

/**
 * Creates a serializable { error: ActionError } suitable for returning from
 * a route action. The error is also logged to the server console for log
 * correlation regardless of environment.
 */
export function actionError(
  message: string,
  opts: {
    operation: string;
    details?: string[];
    hint?: string;
    cause?: unknown;
  }
): { error: ActionError } {
  const isDev = process.env.NODE_ENV !== "production";

  const error: ActionError = {
    message,
    operation: opts.operation,
    details: opts.details ?? [],
    hint: opts.hint,
    stack:
      isDev && opts.cause instanceof Error
        ? opts.cause.stack
        : undefined,
    timestamp: new Date().toISOString(),
  };

  console.error(`[ACTION ERROR] [${opts.operation}] ${message}`, {
    details: opts.details,
    cause:
      opts.cause instanceof Error
        ? { message: opts.cause.message, name: opts.cause.name }
        : opts.cause,
  });

  return { error };
}

/**
 * Creates and throws a structured Response from inside a loader.
 * Caught by ErrorBoundary, which renders DevErrorBanner with full context.
 * Return type is `never` — always throws.
 */
export function loaderError(
  message: string,
  opts: {
    operation: string;
    details?: string[];
    hint?: string;
    cause?: unknown;
    status?: number;
  }
): never {
  const isDev = process.env.NODE_ENV !== "production";

  const error: ActionError = {
    message,
    operation: opts.operation,
    details: opts.details ?? [],
    hint: opts.hint,
    stack:
      isDev && opts.cause instanceof Error
        ? opts.cause.stack
        : undefined,
    timestamp: new Date().toISOString(),
  };

  console.error(`[LOADER ERROR] [${opts.operation}] ${message}`, {
    details: opts.details,
    cause:
      opts.cause instanceof Error
        ? { message: opts.cause.message, name: opts.cause.name }
        : opts.cause,
  });

  throw new Response(JSON.stringify(error), {
    status: opts.status ?? 500,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
