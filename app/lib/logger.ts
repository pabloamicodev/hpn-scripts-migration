const isProd = process.env.NODE_ENV === "production";
const REDACTED_KEYS = /token|secret|password|authorization|cookie/i;

function sanitize(value: unknown): unknown {
  if (value instanceof Error) {
    return { name: value.name, message: value.message };
  }
  if (value instanceof Response) {
    return { responseStatus: value.status, responseStatusText: value.statusText };
  }
  if (Array.isArray(value)) {
    return value.map(sanitize);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        REDACTED_KEYS.test(key) ? "[REDACTED]" : sanitize(entry),
      ]),
    );
  }
  return value;
}

function serializeArgs(args: unknown[]): unknown[] {
  if (!isProd) return args;
  return args.map(sanitize);
}

export const logger = {
  warn(prefix: string, ...args: unknown[]) {
    if (isProd) {
      console.warn(JSON.stringify({ level: "warn", prefix, detail: serializeArgs(args) }));
    } else {
      console.warn(prefix, ...args);
    }
  },
  error(prefix: string, ...args: unknown[]) {
    if (isProd) {
      console.error(JSON.stringify({ level: "error", prefix, detail: serializeArgs(args) }));
    } else {
      console.error(prefix, ...args);
    }
  },
};
