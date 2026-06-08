import { useState, useCallback } from "react";

export function GraphqlConsole() {
  const [query, setQuery] = useState("");
  const [variables, setVariables] = useState("{}");
  const [result, setResult] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmMutation, setConfirmMutation] = useState(false);

  const isMutation = useCallback((q: string) => {
    return /^\s*mutation\s+/im.test(q);
  }, []);

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

      const response = await fetch("/app/graphql", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, variables: parsedVariables }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => null);
        throw new Error(errData?.error || `HTTP ${response.status}`);
      }

      const data = await response.json();
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "GraphQL execution failed");
    } finally {
      setLoading(false);
      setConfirmMutation(false);
    }
  }

  return (
    <div className="app-page app-page--wide">
      <div className="alert alert--warning">
        <strong>Internal Dev Console</strong> — All queries execute server-side
        via authenticated proxy.
      </div>

      <div className="form-section">
      <div className="form-group">
        <label htmlFor="gql-query" className="form-label">
          GraphQL Query
        </label>
        <textarea
          id="gql-query"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          rows={10}
          placeholder={`# Example:\nquery SearchProducts($query: String!) {\n  products(first: 10, query: $query) {\n    nodes {\n      id\n      title\n    }\n  }\n}`}
          style={{ fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace" }}
        />
      </div>

      <div className="form-group">
        <label htmlFor="gql-variables" className="form-label">
          Variables (JSON)
        </label>
        <textarea
          id="gql-variables"
          value={variables}
          onChange={(e) => setVariables(e.target.value)}
          rows={4}
          placeholder='{"query": "PA7"}'
          style={{ fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace" }}
        />
      </div>

      {isMutation(query) && (
        <div className="alert alert--warning">
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={confirmMutation}
              onChange={(e) => setConfirmMutation(e.target.checked)}
            />
            <span>
              I confirm this is a mutation (write operation) and I want to execute it.
            </span>
          </label>
        </div>
      )}

      <button
        onClick={executeQuery}
        disabled={loading || !query.trim()}
        className="btn btn--primary"
        style={{ justifySelf: "start" }}
      >
        {loading ? "Executing..." : "Execute Query"}
      </button>
      </div>

      {error && (
        <div className="alert alert--critical">
          <strong>Error:</strong>
          <pre style={{ whiteSpace: "pre-wrap", margin: "8px 0 0" }}>{error}</pre>
        </div>
      )}

    {result !== null && (
        <div className="card">
          <div className="card__body">
          <strong>Result</strong>
          <pre className="code-block">
            {JSON.stringify(result, null, 2)}
          </pre>
          </div>
        </div>
      )}
    </div>
  );
}
