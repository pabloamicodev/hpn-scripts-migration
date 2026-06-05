import { useState } from "react";

interface ProductNode {
  id: string;
  title: string;
  handle: string;
  variants: {
    nodes: Array<{
      id: string;
      title: string;
      sku?: string;
      price: string;
    }>;
  };
}

interface ProductPickerProps {
  onSelect: (productId: string, productTitle: string) => void;
  onClose: () => void;
  searchFn?: (query: string) => Promise<ProductNode[]>;
}

export function ProductPicker({ onSelect, onClose, searchFn }: ProductPickerProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProductNode[]>([]);
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
      const response = await fetch(`/app/api/products?query=${encodeURIComponent(q)}`);
      if (!response.ok) throw new Error("Search failed");
      const data = await response.json();
      setResults(data.products || []);
    } catch (err) {
      setError("Failed to search products");
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="product-picker-overlay" style={{
      position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.4)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 1000,
    }}>
      <div className="product-picker" style={{
        backgroundColor: "#fff", borderRadius: "0.5rem", padding: "1.5rem",
        width: "90%", maxWidth: "600px", maxHeight: "80vh", overflow: "auto",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1rem" }}>
          <h3>Select Product</h3>
          <button onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", cursor: "pointer", fontSize: "1.5rem" }}>×</button>
        </div>

        <input
          type="text"
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Search by product name, handle, or SKU..."
          style={{ width: "100%", padding: "0.5rem", marginBottom: "1rem", border: "1px solid #d1d5db", borderRadius: "0.375rem" }}
          autoFocus
        />

        {loading && <p>Searching...</p>}
        {error && <p style={{ color: "#dc2626" }}>{error}</p>}

        <div className="product-results">
          {results.map((product) => (
            <div
              key={product.id}
              className="product-result-item"
              onClick={() => onSelect(product.id, product.title)}
              style={{
                padding: "0.75rem", border: "1px solid #e5e7eb", borderRadius: "0.375rem",
                marginBottom: "0.5rem", cursor: "pointer",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#f9fafb")}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#fff")}
            >
              <strong>{product.title}</strong>
              <span style={{ color: "#6b7280", marginLeft: "0.5rem", fontSize: "0.8rem" }}>{product.handle}</span>
              <div style={{ fontSize: "0.75rem", color: "#9ca3af" }}>{product.id}</div>
              {product.variants?.nodes && (
                <div style={{ fontSize: "0.7rem", color: "#6b7280", marginTop: "0.25rem" }}>
                  {product.variants.nodes.length} variant(s)
                </div>
              )}
            </div>
          ))}
        </div>

        {!loading && results.length === 0 && query.length >= 2 && (
          <p style={{ color: "#6b7280", textAlign: "center" }}>No products found</p>
        )}
      </div>
    </div>
  );
}
