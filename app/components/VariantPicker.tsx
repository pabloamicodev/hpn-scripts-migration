import { useState } from "react";

interface VariantNode {
  id: string;
  title: string;
  sku?: string;
  price: string;
  product: {
    id: string;
    title: string;
  };
}

interface VariantPickerProps {
  onSelect: (variantId: string, variantTitle: string) => void;
  onClose: () => void;
}

export function VariantPicker({ onSelect, onClose }: VariantPickerProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<VariantNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSearch(q: string) {
    setQuery(q);
    if (q.length < 2) {
      setResults([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/app/api/variants?query=${encodeURIComponent(q)}`);
      if (!response.ok) throw new Error("Search failed");
      const data = await response.json();
      setResults(data.variants || []);
    } catch (err) {
      setError("Failed to search variants");
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="variant-picker-overlay" style={{
      position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.4)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 1001,
    }}>
      <div className="variant-picker" style={{
        backgroundColor: "#fff", borderRadius: "0.5rem", padding: "1.5rem",
        width: "90%", maxWidth: "500px", maxHeight: "80vh", overflow: "auto",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1rem" }}>
          <h3>Select Variant</h3>
          <button onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", cursor: "pointer", fontSize: "1.5rem" }}>×</button>
        </div>

        <input
          type="text"
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Search by SKU, variant title, or product name..."
          style={{ width: "100%", padding: "0.5rem", marginBottom: "1rem", border: "1px solid #d1d5db", borderRadius: "0.375rem" }}
          autoFocus
        />

        {loading && <p>Searching...</p>}
        {error && <p style={{ color: "#dc2626" }}>{error}</p>}

        <div className="variant-results">
          {results.map((variant) => (
            <div
              key={variant.id}
              className="variant-result-item"
              onClick={() => onSelect(variant.id, `${variant.product.title} - ${variant.title}`)}
              style={{
                padding: "0.75rem", border: "1px solid #e5e7eb", borderRadius: "0.375rem",
                marginBottom: "0.5rem", cursor: "pointer",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#f9fafb")}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#fff")}
            >
              <strong>{variant.title}</strong>
              <span style={{ color: "#6b7280", marginLeft: "0.5rem", fontSize: "0.8rem" }}>
                {variant.sku ? `SKU: ${variant.sku}` : "No SKU"}
              </span>
              <div style={{ fontSize: "0.75rem", color: "#9ca3af" }}>{variant.product.title}</div>
              <div style={{ fontSize: "0.75rem", color: "#6b7280" }}>{variant.id}</div>
            </div>
          ))}
        </div>

        {!loading && results.length === 0 && query.length >= 2 && (
          <p style={{ color: "#6b7280", textAlign: "center" }}>No variants found</p>
        )}
      </div>
    </div>
  );
}
