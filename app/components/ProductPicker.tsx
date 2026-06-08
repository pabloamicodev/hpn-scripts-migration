import { useEffect, useMemo, useState } from "react";

interface ProductImage {
  url: string;
  altText?: string | null;
}

interface ProductVariantNode {
  id: string;
  title: string;
  sku?: string | null;
  price: string;
  inventoryQuantity?: number | null;
  image?: ProductImage | null;
}

interface ProductNode {
  id: string;
  title: string;
  handle: string;
  vendor?: string | null;
  featuredImage?: ProductImage | null;
  variants: {
    nodes: ProductVariantNode[];
  };
}

export interface ProductPickerSelection {
  productId: string;
  productTitle: string;
  productHandle: string;
  vendor?: string | null;
  variantId: string;
  variantTitle: string;
  sku?: string | null;
  price: string;
  imageUrl?: string;
  imageAlt?: string | null;
}

interface ProductPickerProps {
  onSelect: (selection: ProductPickerSelection) => void;
  onClose: () => void;
}

function getGidTail(gid: string) {
  return gid.split("/").pop() ?? gid;
}

function getProductImage(product: ProductNode, variant?: ProductVariantNode) {
  return variant?.image ?? product.featuredImage ?? null;
}

export function ProductPicker({ onSelect, onClose }: ProductPickerProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProductNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const normalizedQuery = query.trim();

  useEffect(() => {
    if (normalizedQuery.length < 2) {
      setResults([]);
      setError(null);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(
          `/app/api/products?query=${encodeURIComponent(normalizedQuery)}&first=12`,
          { signal: controller.signal },
        );

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data?.error || "Product search failed.");
        }

        setResults(data.products || []);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Failed to search products.");
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [normalizedQuery]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  const resultCount = useMemo(() => {
    return results.reduce(
      (count, product) => count + (product.variants?.nodes?.length ?? 0),
      0,
    );
  }, [results]);

  function selectVariant(product: ProductNode, variant: ProductVariantNode) {
    const image = getProductImage(product, variant);

    onSelect({
      productId: product.id,
      productTitle: product.title,
      productHandle: product.handle,
      vendor: product.vendor,
      variantId: variant.id,
      variantTitle: variant.title,
      sku: variant.sku,
      price: variant.price,
      imageUrl: image?.url,
      imageAlt: image?.altText,
    });
  }

  return (
    <div className="picker-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="picker-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="product-picker-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="picker-header">
          <div>
            <h2 id="product-picker-title" className="picker-title">
              Select product
            </h2>
            <p className="picker-subtitle">
              Search Shopify products and choose the exact variant to add.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="btn btn--small"
            aria-label="Close product picker"
          >
            Close
          </button>
        </header>

        <div className="picker-search">
          <label htmlFor="product-picker-search" className="form-label">
            Search products
          </label>
          <div className="search-field">
            <input
              id="product-picker-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by product name, handle, or SKU"
              autoFocus
            />
          </div>
        </div>

        <div className="picker-body">
          {normalizedQuery.length < 2 && (
            <div className="picker-empty">
              <strong>Start with at least 2 characters.</strong>
              <span>Try PA7, NAD3, C2, T5, pouch, or a product handle.</span>
            </div>
          )}

          {loading && (
            <div className="picker-empty">
              <strong>Searching products...</strong>
              <span>Looking through Shopify Admin products.</span>
            </div>
          )}

          {error && (
            <div className="alert alert--critical">
              <strong>Search failed</strong>
              <pre style={{ margin: "8px 0 0", whiteSpace: "pre-wrap" }}>
                {error}
              </pre>
            </div>
          )}

          {!loading &&
            !error &&
            normalizedQuery.length >= 2 &&
            results.length === 0 && (
              <div className="picker-empty">
                <strong>No products found.</strong>
                <span>Try a different title, handle, SKU, or product keyword.</span>
              </div>
            )}

          {!loading && results.length > 0 && (
            <div className="picker-results">
              <div className="picker-results__meta">
                {results.length} products · {resultCount} variants
              </div>

              <div className="product-picker-grid">
                {results.map((product) => {
                  const variants = product.variants?.nodes ?? [];
                  const image = getProductImage(product, variants[0]);

                  return (
                    <article key={product.id} className="product-picker-card">
                      <div className="product-picker-card__media">
                        {image?.url ? (
                          <img
                            src={image.url}
                            alt={image.altText || product.title}
                            loading="lazy"
                          />
                        ) : (
                          <span>{product.title.slice(0, 2).toUpperCase()}</span>
                        )}
                      </div>

                      <div className="product-picker-card__content">
                        <div>
                          <h3>{product.title}</h3>
                          <p>
                            {product.vendor ? `${product.vendor} · ` : ""}
                            /{product.handle}
                          </p>
                          <p className="mono">{getGidTail(product.id)}</p>
                        </div>

                        <div className="variant-choice-list">
                          {variants.map((variant) => (
                            <button
                              key={variant.id}
                              type="button"
                              onClick={() => selectVariant(product, variant)}
                              className="variant-choice"
                            >
                              <span>
                                <strong>{variant.title}</strong>
                                <span>
                                  {variant.sku ? `SKU ${variant.sku}` : "No SKU"}
                                </span>
                              </span>
                              <span className="variant-choice__price">
                                ${variant.price}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
