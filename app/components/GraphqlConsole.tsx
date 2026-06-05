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

      const response = await fetch("/app/graphql/execute", {
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
    <div className="graphql-console" style={{ maxWidth: "900px" }}>
      <div style={{
        backgroundColor: "#fef3c7", padding: "0.75rem 1rem", borderRadius: "0.375rem",
        marginBottom: "1rem", border: "1px solid #fde68a",
      }}>
        <strong style={{ color: "#92400e" }}>Internal Dev Console</strong> — All queries execute server-side via authenticated proxy.
      </div>

      <div className="form-group" style={{ marginBottom: "1rem" }}>
        <label htmlFor="gql-query" style={{ display: "block", fontWeight: 600, marginBottom: "0.25rem" }}>
          GraphQL Query
        </label>
        <textarea
          id="gql-query"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          rows={10}
          placeholder={`# Example:\nquery SearchProducts($query: String!) {\n  products(first: 10, query: $query) {\n    nodes {\n      id\n      title\n    }\n  }\n}`}
          style={{
            width: "100%", padding: "0.75rem", border: "1px solid #d1d5db",
            borderRadius: "0.375rem", fontFamily: "monospace", fontSize: "0.85rem",
            resize: "vertical",
          }}
        />
      </div>

      <div className="form-group" style={{ marginBottom: "1rem" }}>
        <label htmlFor="gql-variables" style={{ display: "block", fontWeight: 600, marginBottom: "0.25rem" }}>
          Variables (JSON)
        </label>
        <textarea
          id="gql-variables"
          value={variables}
          onChange={(e) => setVariables(e.target.value)}
          rows={4}
          placeholder='{"query": "PA7"}'
          style={{
            width: "100%", padding: "0.5rem", border: "1px solid #d1d5db",
            borderRadius: "0.375rem", fontFamily: "monospace", fontSize: "0.85rem",
            resize: "vertical",
          }}
        />
      </div>

      {isMutation(query) && (
        <div style={{ marginBottom: "1rem", backgroundColor: "#fef3c7", padding: "0.75rem", borderRadius: "0.375rem" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={confirmMutation}
              onChange={(e) => setConfirmMutation(e.target.checked)}
            />
            <span style={{ color: "#92400e", fontWeight: 600 }}>
              I confirm this is a mutation (write operation) and I want to execute it.
            </span>
          </label>
        </div>
      )}

      <button
        onClick={executeQuery}
        disabled={loading || !query.trim()}
        style={{
          padding: "0.625rem 1.5rem",
          backgroundColor: loading ? "#9ca3af" : "#0f172a",
          color: "#fff",
          border: "none",
          borderRadius: "0.375rem",
          cursor: loading ? "not-allowed" : "pointer",
          fontWeight: 600,
          marginBottom: "1.5rem",
        }}
      >
        {loading ? "Executing..." : "Execute Query"}
      </button>

      {error && (
        <div style={{
          backgroundColor: "#fef2f2", padding: "1rem", borderRadius: "0.375rem",
          border: "1px solid #fecaca", marginBottom: "1rem",
        }}>
          <strong style={{ color: "#991b1b" }}>Error:</strong>
          <pre style={{ color: "#7f1d1d", whiteSpace: "pre-wrap", fontSize: "0.85rem", marginTop: "0.5rem" }}>{error}</pre>
        </div>
      )}

    {result !== null && (
        <div style={{
          backgroundColor: "#f0fdf4", padding: "1rem", borderRadius: "0.375rem",
          border: "1px solid #bbf7d0",
        }}>
          <strong style={{ color: "#166534" }}>Result:</strong>
          <pre style={{
            color: "#14532d", whiteSpace: "pre-wrap",
            fontSize: "0.8rem", marginTop: "0.5rem",
            maxHeight: "400px", overflow: "auto",
          }}>
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
