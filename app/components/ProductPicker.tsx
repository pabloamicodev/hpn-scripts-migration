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
  description?: string | null;
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
  productVariants: Array<{
    id: string;
    title: string;
    sku?: string | null;
    price: string;
    imageUrl?: string;
    imageAlt?: string | null;
  }>;
}

interface ProductPickerProps {
  onSelect: (selection: ProductPickerSelection) => void;
  onClose: () => void;
  selectionMode?: "product" | "variant";
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

function getProductImages(product: ProductNode) {
  const images = [
    product.featuredImage,
    ...product.variants.nodes.map((variant) => variant.image),
  ];
  const seenUrls = new Set<string>();

  return images.filter((image): image is ProductImage => {
    if (!image?.url || seenUrls.has(image.url)) return false;
    seenUrls.add(image.url);
    return true;
  });
}

function getProductOptions(variants: ProductVariantNode[]) {
  const options = new Map<string, string[]>();

  for (const variant of variants) {
    for (const option of variant.selectedOptions ?? []) {
      if (
        !option.name ||
        !option.value ||
        option.value.toLowerCase() === "default title"
      )
        continue;
      const values = options.get(option.name) ?? [];
      if (!values.includes(option.value)) values.push(option.value);
      options.set(option.name, values);
    }
  }

  return Array.from(options, ([name, values]) => ({ name, values }));
}

function ProductGallery({
  product,
  selectedVariant,
}: {
  product: ProductNode;
  selectedVariant: ProductVariantNode | null;
}) {
  const images = getProductImages(product);
  const selectedImage = getProductImage(product, selectedVariant ?? undefined);
  const initialImageIndex = Math.max(
    0,
    images.findIndex((image) => image.url === selectedImage?.url),
  );
  const [activeImageIndex, setActiveImageIndex] = useState(initialImageIndex);
  const [scrollState, setScrollState] = useState({
    canScrollLeft: false,
    canScrollRight: false,
  });
  const carouselRef = useRef<HTMLUListElement>(null);
  const activeImage = images[activeImageIndex] ?? selectedImage;

  useEffect(() => {
    const carousel = carouselRef.current;
    if (!carousel) return;

    function updateScrollState() {
      if (!carousel) return;
      const maxScrollLeft = carousel.scrollWidth - carousel.clientWidth;
      setScrollState({
        canScrollLeft: carousel.scrollLeft > 2,
        canScrollRight: carousel.scrollLeft < maxScrollLeft - 2,
      });
    }

    updateScrollState();
    const resizeObserver = new ResizeObserver(updateScrollState);
    resizeObserver.observe(carousel);
    carousel.addEventListener("scroll", updateScrollState, { passive: true });

    return () => {
      resizeObserver.disconnect();
      carousel.removeEventListener("scroll", updateScrollState);
    };
  }, [images.length]);

  function scrollCarousel(direction: -1 | 1) {
    carouselRef.current?.scrollBy({
      left: direction * 220,
      behavior: "smooth",
    });
  }

  return (
    <div className="product-gallery">
      <div className="product-gallery__main">
        {activeImage?.url ? (
          <img
            src={activeImage.url}
            alt={activeImage.altText || `${product.title} product image`}
            width={900}
            height={900}
            loading="lazy"
          />
        ) : (
          <span aria-hidden="true">
            {product.title.slice(0, 2).toUpperCase()}
          </span>
        )}
      </div>

      {images.length > 1 ? (
        <div className="product-gallery__carousel">
          {scrollState.canScrollLeft ? (
            <button
              type="button"
              className="product-gallery__arrow product-gallery__arrow--left"
              aria-label={`Show previous images for ${product.title}`}
              onClick={() => scrollCarousel(-1)}
            >
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <path d="m12.5 4-6 6 6 6" />
              </svg>
            </button>
          ) : null}

          <ul
            ref={carouselRef}
            className="product-gallery__thumbnails"
            aria-label={`Images for ${product.title}`}
          >
            {images.map((image, index) => (
              <li key={image.url}>
                <button
                  type="button"
                  className={`product-gallery__thumbnail${index === activeImageIndex ? " is-active" : ""}`}
                  aria-label={`View image ${index + 1} of ${images.length}`}
                  aria-pressed={index === activeImageIndex}
                  onClick={() => setActiveImageIndex(index)}
                >
                  <img
                    src={image.url}
                    alt=""
                    width={112}
                    height={112}
                    loading="lazy"
                  />
                </button>
              </li>
            ))}
          </ul>

          {scrollState.canScrollRight ? (
            <button
              type="button"
              className="product-gallery__arrow product-gallery__arrow--right"
              aria-label={`Show more images for ${product.title}`}
              onClick={() => scrollCarousel(1)}
            >
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <path d="m7.5 4 6 6-6 6" />
              </svg>
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function ProductPicker({
  onSelect,
  onClose,
  selectionMode = "variant",
}: ProductPickerProps) {
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

        const response = await fetch(`/app/api/products?${params.toString()}`, {
          signal: controller.signal,
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data?.error || "Product search failed.");
        }

        setResults(data.products || []);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(
          err instanceof Error ? err.message : "Failed to search products.",
        );
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
      productVariants: product.variants.nodes.map((productVariant, index) => {
        const variantImage = getProductImage(product, productVariant);
        return {
          id: productVariant.id,
          title: formatVariantName(productVariant, index),
          sku: productVariant.sku,
          price: productVariant.price,
          imageUrl: variantImage?.url,
          imageAlt: variantImage?.altText,
        };
      }),
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
              {selectionMode === "product"
                ? "Choose the gift product. All of its variants will become customer-selectable options."
                : "Search Shopify products and choose the exact variant to add."}
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
              <span>
                Search by title, handle, SKU, or keyword to narrow the list.
              </span>
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
              <pre className="alert__pre">{error}</pre>
            </div>
          )}

          {!loading &&
            !error &&
            normalizedQuery.length > 0 &&
            results.length === 0 && (
              <div className="picker-empty">
                <strong>No products found.</strong>
                <span>
                  Try a different title, handle, SKU, or product keyword.
                </span>
              </div>
            )}

          {!loading && results.length > 0 && (
            <div className="picker-results">
              <div className="picker-results__bar">
                <div>
                  <strong>{results.length} products</strong>
                  <span>{resultCount} variants available</span>
                </div>
                {normalizedQuery && (
                  <span className="picker-results__query">
                    "{normalizedQuery}"
                  </span>
                )}
              </div>

              <div className="product-picker-grid">
                {results.map((product) => {
                  const variants = product.variants?.nodes ?? [];
                  const selectedVariant = getSelectedVariant(product);
                  const productOptions = getProductOptions(variants);
                  const variantSelectId = `product-variant-${getGidTail(product.id)}`;

                  return (
                    <article key={product.id} className="product-picker-card">
                      <ProductGallery
                        key={selectedVariant?.id ?? product.id}
                        product={product}
                        selectedVariant={selectedVariant}
                      />

                      <div className="product-picker-card__details">
                        <div className="product-picker-card__summary">
                          {product.vendor ? (
                            <span className="product-picker-card__vendor">
                              {product.vendor}
                            </span>
                          ) : null}
                          <h3>{product.title}</h3>
                          <p className="product-picker-card__description">
                            {product.description?.trim() ||
                              "No product description has been added in Shopify yet."}
                          </p>
                          <div className="product-picker-meta">
                            <span>/{product.handle}</span>
                            <span>
                              {variants.length} variant
                              {variants.length === 1 ? "" : "s"}
                            </span>
                          </div>
                        </div>

                        <div className="variant-choice-panel">
                          {productOptions.map((option) => {
                            const optionSelectId = `product-option-${getGidTail(product.id)}-${option.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
                            const selectedValue =
                              selectedVariant?.selectedOptions?.find(
                                (selectedOption) =>
                                  selectedOption.name === option.name,
                              )?.value ?? option.values[0];

                            return (
                              <div
                                className="variant-select-field"
                                key={option.name}
                              >
                                <label htmlFor={optionSelectId}>
                                  Choose your {option.name}
                                </label>
                                <select
                                  id={optionSelectId}
                                  value={selectedValue}
                                  onChange={(event) => {
                                    const nextValue = event.target.value;
                                    const currentOptions = new Map(
                                      selectedVariant?.selectedOptions?.map(
                                        (selectedOption) => [
                                          selectedOption.name,
                                          selectedOption.value,
                                        ],
                                      ),
                                    );
                                    currentOptions.set(option.name, nextValue);
                                    const nextVariant =
                                      variants.find((variant) =>
                                        Array.from(currentOptions).every(
                                          ([name, value]) =>
                                            variant.selectedOptions?.some(
                                              (selectedOption) =>
                                                selectedOption.name === name &&
                                                selectedOption.value === value,
                                            ),
                                        ),
                                      ) ??
                                      variants.find((variant) =>
                                        variant.selectedOptions?.some(
                                          (selectedOption) =>
                                            selectedOption.name ===
                                              option.name &&
                                            selectedOption.value === nextValue,
                                        ),
                                      );

                                    if (nextVariant) {
                                      setSelectedVariantByProductId(
                                        (current) => ({
                                          ...current,
                                          [product.id]: nextVariant.id,
                                        }),
                                      );
                                    }
                                  }}
                                >
                                  {option.values.map((value) => (
                                    <option key={value} value={value}>
                                      {value}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            );
                          })}

                          <div className="variant-select-field">
                            <label htmlFor={variantSelectId}>
                              Select variant
                            </label>
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
                                {selectedVariant
                                  ? `$${selectedVariant.price}`
                                  : "No variant"}
                              </strong>
                              <span>
                                {selectedVariant
                                  ? formatInventory(
                                      selectedVariant.inventoryQuantity,
                                    )
                                  : "This product has no variants available"}
                              </span>
                            </div>
                            <button
                              type="button"
                              className="btn btn--primary"
                              disabled={!selectedVariant}
                              onClick={() => {
                                if (selectedVariant)
                                  selectVariant(product, selectedVariant);
                              }}
                            >
                              {selectionMode === "product"
                                ? "Select product"
                                : "Select variant"}
                            </button>
                          </div>
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
