import { useCallback, useMemo, useState, useEffect, useRef } from "react";

// ─── Toast ────────────────────────────────────────────────────────────────────

function Toast({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2000);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <div
      style={{
        position: "fixed",
        bottom: 24,
        right: 24,
        background: "#1a1a2e",
        color: "#fff",
        padding: "10px 18px",
        borderRadius: 8,
        fontSize: 13,
        fontWeight: 600,
        zIndex: 9999,
        boxShadow: "0 4px 16px rgba(0,0,0,0.35)",
        pointerEvents: "none",
      }}
    >
      ✓ Copied to clipboard
    </div>
  );
}

// ─── Copy button ──────────────────────────────────────────────────────────────

function CopyButton({ getText, onCopy }: { getText: () => string; onCopy: () => void }) {
  return (
    <button
      type="button"
      className="btn btn--secondary"
      style={{ fontSize: 12, padding: "2px 10px", lineHeight: 1.6 }}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(getText());
          onCopy();
        } catch {
          /* clipboard access denied */
        }
      }}
    >
      Copy
    </button>
  );
}

// ─── JSON tree ────────────────────────────────────────────────────────────────

const K = { color: "#ce93d8" }; // key
const S = { color: "#ffb74d" }; // string value
const N = { color: "#66bb6a" }; // number
const B = { color: "#42a5f5" }; // boolean
const U = { color: "#ef5350" }; // null/undefined
const P = { color: "#ccc" };   // punctuation

function CollapseBtn({ open, onClick }: { open: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: "none",
        border: "none",
        color: "#888",
        cursor: "pointer",
        fontSize: 10,
        padding: "0 3px",
        userSelect: "none",
        lineHeight: 1,
      }}
    >
      {open ? "▼" : "▶"}
    </button>
  );
}

function JsonNode({ value, depth = 0 }: { value: unknown; depth?: number }) {
  const [open, setOpen] = useState(depth < 2);
  const toggle = useCallback(() => setOpen((v) => !v), []);

  if (value === null) return <span style={U}>null</span>;
  if (value === undefined) return <span style={U}>undefined</span>;
  if (typeof value === "boolean") return <span style={B}>{String(value)}</span>;
  if (typeof value === "number") return <span style={N}>{value}</span>;
  if (typeof value === "string") return <span style={S}>"{value}"</span>;

  if (Array.isArray(value)) {
    if (value.length === 0) return <span style={P}>[]</span>;
    return (
      <span>
        <CollapseBtn open={open} onClick={toggle} />
        <span style={P}>[</span>
        {!open ? (
          <span style={{ color: "#777", cursor: "pointer" }} onClick={toggle}>
            …{value.length}
          </span>
        ) : (
          <div style={{ marginLeft: 16 }}>
            {value.map((item, i) => (
              <div key={i}>
                <JsonNode value={item} depth={depth + 1} />
                {i < value.length - 1 && <span style={P}>,</span>}
              </div>
            ))}
          </div>
        )}
        <span style={P}>]</span>
      </span>
    );
  }

  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return <span style={P}>{"{}"}</span>;
    return (
      <span>
        <CollapseBtn open={open} onClick={toggle} />
        <span style={P}>{"{"}</span>
        {!open ? (
          <span style={{ color: "#777", cursor: "pointer" }} onClick={toggle}>
            …{entries.length}
          </span>
        ) : (
          <div style={{ marginLeft: 16 }}>
            {entries.map(([key, val], i) => (
              <div key={key}>
                <span style={K}>"{key}"</span>
                <span style={P}>: </span>
                <JsonNode value={val} depth={depth + 1} />
                {i < entries.length - 1 && <span style={P}>,</span>}
              </div>
            ))}
          </div>
        )}
        <span style={P}>{"}"}</span>
      </span>
    );
  }

  return null;
}

// ─── Presets ──────────────────────────────────────────────────────────────────

interface QueryPreset {
  id: string;
  name: string;
  description: string;
  query: string;
  variables: string;
}

const queryPresets: QueryPreset[] = [
  {
    id: "hpn-discount",
    name: "HPN discount",
    description: "Find the migration discount and read its metafield config.",
    variables: "{}",
    query: `query HpnMigrationDiscount {
  discountNodes(first: 10, query: "title:'HPN Scripts Migration Discounts'") {
    nodes {
      id
      metafield(namespace: "hpn_scripts", key: "function_configuration") {
        namespace
        key
        value
        updatedAt
      }
      discount {
        __typename
        ... on DiscountAutomaticApp {
          discountId
          title
          status
          startsAt
          endsAt
        }
      }
    }
  }
}`,
  },
  {
    id: "active-discounts",
    name: "Active discounts",
    description: "List active automatic discounts currently visible to Admin API.",
    variables: "{}",
    query: `query ActiveAutomaticDiscounts {
  discountNodes(first: 25, query: "status:active") {
    nodes {
      id
      discount {
        __typename
        ... on DiscountAutomaticApp {
          discountId
          title
          status
          startsAt
          endsAt
        }
        ... on DiscountAutomaticBasic {
          title
          status
          startsAt
          endsAt
        }
        ... on DiscountAutomaticBxgy {
          title
          status
          startsAt
          endsAt
        }
        ... on DiscountAutomaticFreeShipping {
          title
          status
          startsAt
          endsAt
        }
      }
    }
  }
}`,
  },
  {
    id: "shopify-functions",
    name: "Shopify functions",
    description: "Confirm the product discount function installed in this store.",
    variables: "{}",
    query: `query ShopifyFunctions {
  shopifyFunctions(first: 25) {
    nodes {
      id
      title
      apiType
      app {
        title
      }
    }
  }
}`,
  },
];

// ─── Console ──────────────────────────────────────────────────────────────────

export function GraphqlConsole() {
  const [query, setQuery] = useState(queryPresets[0].query);
  const [variables, setVariables] = useState(queryPresets[0].variables);
  const [result, setResult] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmMutation, setConfirmMutation] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState(queryPresets[0].id);
  const [toast, setToast] = useState(false);

  const showToast = useCallback(() => setToast(true), []);

  const isMutation = useCallback((q: string) => {
    return /^\s*mutation\s+/im.test(q);
  }, []);

  const resultText = useMemo(() => {
    if (error) return error;
    if (result === null) return "No result yet.";
    return JSON.stringify(result, null, 2);
  }, [error, result]);

  function loadPreset(preset: QueryPreset) {
    setSelectedPreset(preset.id);
    setQuery(preset.query);
    setVariables(preset.variables);
    setResult(null);
    setError(null);
    setConfirmMutation(false);
  }

  function formatVariables() {
    try {
      setVariables(JSON.stringify(JSON.parse(variables), null, 2));
      setError(null);
    } catch {
      setError("Invalid JSON in variables field.");
    }
  }

  function clearConsole() {
    setQuery("");
    setVariables("{}");
    setResult(null);
    setError(null);
    setConfirmMutation(false);
    setSelectedPreset("");
  }

  async function executeQuery() {
    if (!query.trim()) return;

    if (isMutation(query) && !confirmMutation) {
      setError("Please check the confirmation box to execute mutations.");
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      let parsedVariables = {};
      try {
        parsedVariables = JSON.parse(variables);
      } catch {
        setError("Invalid JSON in variables field.");
        setLoading(false);
        return;
      }

      const response = await fetch("/app/graphql/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, variables: parsedVariables }),
      });

      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.includes("application/json")) {
        throw new Error(
          "The GraphQL proxy returned HTML instead of JSON. Refresh the app and try again.",
        );
      }

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.errors?.[0]?.message || data?.error || `HTTP ${response.status}`,
        );
      }

      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "GraphQL execution failed");
    } finally {
      setLoading(false);
      setConfirmMutation(false);
    }
  }

  return (
    <div className="section-grid">
      {toast && <Toast onDone={() => setToast(false)} />}

      <div className="alert alert--warning">
        <strong>Internal Dev Console</strong> - all queries execute server-side
        through the authenticated Admin API proxy.
      </div>

      <div className="graphql-layout">
        {/* Left column — editor */}
        <div className="section-grid">
          <section className="card">
            <div className="card__header">
              <div>
                <h2 className="card__title">Query editor</h2>
                <p className="card__subtitle">
                  Run read queries freely. Mutations require confirmation.
                </p>
              </div>
            </div>

            <div className="card__body section-grid">
              <div className="form-group">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                  <label htmlFor="gql-query" className="form-label" style={{ margin: 0 }}>
                    GraphQL query
                  </label>
                  <CopyButton getText={() => query} onCopy={showToast} />
                </div>
                <textarea
                  id="gql-query"
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setSelectedPreset("");
                  }}
                  className="editor-textarea"
                  placeholder="query { shop { name } }"
                />
              </div>

              <div className="form-group">
                <label htmlFor="gql-variables" className="form-label">
                  Variables JSON
                </label>
                <textarea
                  id="gql-variables"
                  value={variables}
                  onChange={(event) => setVariables(event.target.value)}
                  className="variables-textarea"
                  placeholder='{"query": "PA7"}'
                />
              </div>

              {isMutation(query) && (
                <div className="alert alert--warning">
                  <label className="checkbox-row">
                    <input
                      type="checkbox"
                      checked={confirmMutation}
                      onChange={(event) =>
                        setConfirmMutation(event.target.checked)
                      }
                    />
                    <span>
                      I confirm this is a mutation and I want to execute it.
                    </span>
                  </label>
                </div>
              )}

              <div className="btn-row">
                <button
                  type="button"
                  onClick={executeQuery}
                  disabled={loading || !query.trim()}
                  className="btn btn--primary"
                >
                  {loading ? "Executing…" : "Execute query"}
                </button>
                <button
                  type="button"
                  onClick={formatVariables}
                  className="btn"
                >
                  Format variables
                </button>
                <button type="button" onClick={clearConsole} className="btn">
                  Clear
                </button>
              </div>
            </div>
          </section>
        </div>

        {/* Right column — presets + result */}
        <aside className="section-grid">
          <section className="card">
            <div className="card__header">
              <div>
                <h2 className="card__title">Preset queries</h2>
                <p className="card__subtitle">
                  Common checks for discount and function status.
                </p>
              </div>
            </div>

            <div className="card__body">
              <div className="preset-list">
                {queryPresets.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => loadPreset(preset)}
                    className="btn preset-button"
                    aria-pressed={selectedPreset === preset.id}
                  >
                    <span>
                      <strong>{preset.name}</strong>
                      <span className="cell-muted cell-block">
                        {preset.description}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section className="card result-panel">
            <div className="card__header">
              <div>
                <h2 className="card__title">Result</h2>
                <p className="card__subtitle">
                  Response body from the Admin API proxy.
                </p>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {result !== null && (
                  <CopyButton getText={() => resultText} onCopy={showToast} />
                )}
                {error ? (
                  <span className="status-badge status-badge--error">Error</span>
                ) : result !== null ? (
                  <span className="status-badge status-badge--active">Ready</span>
                ) : (
                  <span className="status-badge status-badge--inactive">Idle</span>
                )}
              </div>
            </div>

            <div className="card__body">
              {error || result === null ? (
                <pre className="code-block code-block--light">{resultText}</pre>
              ) : (
                <pre
                  className="code-block"
                  style={{ fontSize: 12, lineHeight: 1.6, overflowX: "auto" }}
                >
                  <JsonNode value={result} depth={0} />
                </pre>
              )}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
