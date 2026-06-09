import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";

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
  selectedOptions?: Array<{
    name: string;
    value: string;
  }>;
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

function formatInventory(quantity?: number | null) {
  if (typeof quantity !== "number") {
    return "Inventory not tracked";
  }

  if (quantity <= 0) {
    return "Out of stock";
  }

  return `${quantity} in stock`;
}

function isDefaultVariantTitle(title: string) {
  return title.trim().toLowerCase() === "default title";
}

function formatVariantName(variant: ProductVariantNode, index = 0) {
  const optionValues =
    variant.selectedOptions
      ?.map((option) => option.value.trim())
      .filter((value) => value && value.toLowerCase() !== "default title") ??
    [];

  if (optionValues.length > 0) {
    return optionValues.join(" / ");
  }

  if (!isDefaultVariantTitle(variant.title)) {
    return variant.title;
  }

  if (variant.sku) {
    return `SKU ${variant.sku}`;
  }

  return `Variant ${index + 1}`;
}

function formatVariantOptionLabel(variant: ProductVariantNode, index: number) {
  return [
    formatVariantName(variant, index),
    variant.sku ? `SKU ${variant.sku}` : null,
    `$${variant.price}`,
    formatInventory(variant.inventoryQuantity),
  ]
    .filter(Boolean)
    .join(" - ");
}

export function ProductPicker({ onSelect, onClose }: ProductPickerProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProductNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedVariantByProductId, setSelectedVariantByProductId] = useState<
    Record<string, string>
  >({});
  const searchInputRef = useRef<HTMLInputElement>(null);
  const previouslyFocusedElement = useRef<Element | null>(null);

  const normalizedQuery = query.trim();

  useEffect(() => {
    previouslyFocusedElement.current = document.activeElement;
    searchInputRef.current?.focus();

    return () => {
      if (previouslyFocusedElement.current instanceof HTMLElement) {
        previouslyFocusedElement.current.focus();
      }
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams({ first: "24" });
        if (normalizedQuery) {
          params.set("query", normalizedQuery);
        }

        const response = await fetch(
          `/app/api/products?${params.toString()}`,
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
    function handleKeyDown(event: globalThis.KeyboardEvent) {
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

  const liveStatus = loading
    ? "Searching products."
    : error
      ? "Product search failed."
      : `${results.length} products and ${resultCount} variants found.`;

  function selectVariant(product: ProductNode, variant: ProductVariantNode) {
    const image = getProductImage(product, variant);
    const variantIndex =
      product.variants?.nodes?.findIndex((node) => node.id === variant.id) ?? 0;

    onSelect({
      productId: product.id,
      productTitle: product.title,
      productHandle: product.handle,
      vendor: product.vendor,
      variantId: variant.id,
      variantTitle: formatVariantName(variant, Math.max(variantIndex, 0)),
      sku: variant.sku,
      price: variant.price,
      imageUrl: image?.url,
      imageAlt: image?.altText,
    });
  }

  function getSelectedVariant(product: ProductNode) {
    const variants = product.variants?.nodes ?? [];
    const selectedVariantId = selectedVariantByProductId[product.id];

    return (
      variants.find((variant) => variant.id === selectedVariantId) ??
      variants[0] ??
      null
    );
  }

  function handleDialogKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.key !== "Tab") return;

    const focusable = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((element) => !element.hasAttribute("disabled"));

    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <div className="picker-backdrop" onMouseDown={onClose}>
      <section
        className="picker-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="product-picker-title"
        aria-describedby="product-picker-subtitle"
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={handleDialogKeyDown}
      >
        <header className="picker-header">
          <div className="picker-heading">
            <span className="picker-kicker">Shopify catalog</span>
            <h2 id="product-picker-title" className="picker-title">
              Select product
            </h2>
            <p id="product-picker-subtitle" className="picker-subtitle">
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
          <div className="picker-search__label-row">
            <label htmlFor="product-picker-search" className="form-label">
              Search products
            </label>
            <span>Title, handle, SKU, or keyword</span>
          </div>
          <div className="search-field">
            <input
              id="product-picker-search"
              ref={searchInputRef}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by product name, handle, or SKU…"
            />
          </div>
        </div>

        <p className="visually-hidden" aria-live="polite">
          {liveStatus}
        </p>

        <div className="picker-body">
          {!loading && normalizedQuery.length === 0 && (
            <div className="picker-empty picker-empty--inline">
              <strong>Showing recent products.</strong>
              <span>Search by title, handle, SKU, or keyword to narrow the list.</span>
            </div>
          )}

          {loading && (
            <div className="picker-empty">
              <strong>Searching products…</strong>
              <span>Looking through Shopify Admin products.</span>
            </div>
          )}

          {error && (
            <div className="alert alert--critical">
              <strong>Search failed</strong>
              <pre className="alert__pre">
                {error}
              </pre>
            </div>
          )}

          {!loading &&
            !error &&
            normalizedQuery.length > 0 &&
            results.length === 0 && (
              <div className="picker-empty">
                <strong>No products found.</strong>
                <span>Try a different title, handle, SKU, or product keyword.</span>
              </div>
            )}

          {!loading && results.length > 0 && (
              <div className="picker-results">
                <div className="picker-results__bar">
                  <div>
                    <strong>{results.length} products</strong>
                    <span>{resultCount} variants available</span>
                  </div>
                  <span className="picker-results__query">"{normalizedQuery}"</span>
                </div>

              <div className="product-picker-grid">
                {results.map((product) => {
                  const variants = product.variants?.nodes ?? [];
                  const selectedVariant = getSelectedVariant(product);
                  const image = getProductImage(
                    product,
                    selectedVariant ?? variants[0],
                  );
                  const variantSelectId = `product-variant-${getGidTail(product.id)}`;

                  return (
                    <article key={product.id} className="product-picker-card">
                      <div className="product-picker-card__top">
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

                        <div className="product-picker-card__summary">
                          <h3>{product.title}</h3>
                          <div className="product-picker-meta">
                            {product.vendor && <span>{product.vendor}</span>}
                            <span>/{product.handle}</span>
                            <span>ID {getGidTail(product.id)}</span>
                          </div>
                          <p className="product-picker-card__variant-count">
                            {variants.length} variant{variants.length === 1 ? "" : "s"}
                          </p>
                        </div>
                      </div>

                      <div className="variant-choice-panel">
                        <div className="variant-select-field">
                          <label htmlFor={variantSelectId}>Variant</label>
                          <select
                            id={variantSelectId}
                            value={selectedVariant?.id ?? ""}
                            disabled={variants.length === 0}
                            onChange={(event) =>
                              setSelectedVariantByProductId((current) => ({
                                ...current,
                                [product.id]: event.target.value,
                              }))
                            }
                          >
                            {variants.map((variant, index) => (
                              <option key={variant.id} value={variant.id}>
                                {formatVariantOptionLabel(variant, index)}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="variant-choice-summary">
                          <div>
                            <strong>
                              {selectedVariant ? `$${selectedVariant.price}` : "No variant"}
                            </strong>
                            <span>
                              {selectedVariant
                                ? formatInventory(selectedVariant.inventoryQuantity)
                                : "This product has no variants available"}
                            </span>
                          </div>
                          <button
                            type="button"
                            className="btn btn--primary"
                            disabled={!selectedVariant}
                            onClick={() => {
                              if (selectedVariant) {
                                selectVariant(product, selectedVariant);
                              }
                            }}
                          >
                            Select
                          </button>
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
