import { useCallback, useMemo, useState } from "react";

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

export function GraphqlConsole() {
  const [query, setQuery] = useState(queryPresets[0].query);
  const [variables, setVariables] = useState(queryPresets[0].variables);
  const [result, setResult] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmMutation, setConfirmMutation] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState(queryPresets[0].id);

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
      <div className="alert alert--warning">
        <strong>Internal Dev Console</strong> - all queries execute server-side
        through the authenticated Admin API proxy.
      </div>

      <div className="graphql-layout">
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
                <label htmlFor="gql-query" className="form-label">
                  GraphQL query
                </label>
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
              {error ? (
                <span className="status-badge status-badge--error">Error</span>
              ) : result !== null ? (
                <span className="status-badge status-badge--active">Ready</span>
              ) : (
                <span className="status-badge status-badge--inactive">Idle</span>
              )}
            </div>

            <div className="card__body">
              <pre
                className={`code-block ${
                  error || result === null ? "code-block--light" : ""
                }`}
              >
                {resultText}
              </pre>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
