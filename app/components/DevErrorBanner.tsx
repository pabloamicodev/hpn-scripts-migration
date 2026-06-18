import type { ActionError } from "~/lib/actionError.server";

interface Props {
  error: ActionError | null | undefined;
}

/**
 * Rich developer-facing error display.
 * Shows: operation badge, message, detail bullets with field paths,
 * debugging hint, timestamp, and a collapsible stack trace (dev only).
 */
export function DevErrorBanner({ error }: Props) {
  if (!error) return null;

  const date = new Date(error.timestamp);
  const timeLabel = !isNaN(date.getTime())
    ? date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : error.timestamp;

  return (
    <div
      role="alert"
      style={{
        background: "#fff1f2",
        border: "1px solid #fca5a5",
        borderLeft: "4px solid #dc2626",
        borderRadius: 8,
        padding: "14px 16px",
        margin: "12px 0",
        fontSize: 13,
        lineHeight: 1.6,
      }}
    >
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <code
          style={{
            background: "#dc2626",
            color: "#fff",
            borderRadius: 4,
            padding: "1px 7px",
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 0.3,
            flexShrink: 0,
          }}
        >
          {error.operation}
        </code>
        <strong style={{ color: "#7f1d1d", fontSize: 14 }}>{error.message}</strong>
        <span style={{ marginLeft: "auto", color: "#b91c1c", fontSize: 11, opacity: 0.7, whiteSpace: "nowrap" }}>
          {timeLabel}
        </span>
      </div>

      {/* Detail bullets */}
      {error.details.length > 0 && (
        <ul
          style={{
            margin: "10px 0 0 0",
            padding: "0 0 0 18px",
            color: "#991b1b",
          }}
        >
          {error.details.map((d, i) => (
            <li key={i} style={{ marginBottom: 2 }}>
              <code
                style={{
                  background: "#fee2e2",
                  borderRadius: 3,
                  padding: "1px 5px",
                  fontSize: 12,
                  fontFamily: "'SFMono-Regular', Menlo, Consolas, monospace",
                }}
              >
                {d}
              </code>
            </li>
          ))}
        </ul>
      )}

      {/* Hint */}
      {error.hint && (
        <p style={{ margin: "10px 0 0 0", color: "#7c3aed", fontSize: 12 }}>
          <span style={{ marginRight: 4 }}>💡</span>
          {error.hint}
        </p>
      )}

      {/* Stack trace — dev only, collapsible */}
      {error.stack && (
        <details style={{ marginTop: 10 }}>
          <summary
            style={{
              cursor: "pointer",
              color: "#b91c1c",
              fontSize: 11,
              fontWeight: 600,
              userSelect: "none",
            }}
          >
            Stack trace
          </summary>
          <pre
            style={{
              margin: "8px 0 0 0",
              padding: "10px 12px",
              background: "#1c1917",
              color: "#fca5a5",
              borderRadius: 6,
              fontSize: 11,
              overflowX: "auto",
              whiteSpace: "pre-wrap",
              wordBreak: "break-all",
              fontFamily: "'SFMono-Regular', Menlo, Consolas, monospace",
              lineHeight: 1.5,
            }}
          >
            {error.stack}
          </pre>
        </details>
      )}
    </div>
  );
}
