import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";

interface ProductVariantCardProps {
  productId: string;
  productTitle: string;
  imageUrl?: string;
  imageAlt?: string | null;
  summary: string;
  children: ReactNode;
}

export function ProductVariantCard({
  productId,
  productTitle,
  imageUrl,
  imageAlt,
  summary,
  children,
}: ProductVariantCardProps) {
  return (
    <details className="product-variant-group">
      <summary className="product-variant-group__toggle">
        <span className="selection-summary__media">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={imageAlt || productTitle}
              loading="lazy"
            />
          ) : (
            <span>{productTitle.slice(0, 2).toUpperCase()}</span>
          )}
        </span>
        <span className="selection-summary__body">
          <strong>{productTitle}</strong>
          <span className="product-variant-group__meta">
            Product ID {productId.split("/").pop()}
          </span>
          <span className="product-variant-group__count">{summary}</span>
        </span>
        <ChevronDown
          className="product-variant-group__chevron"
          size={18}
          aria-hidden="true"
        />
      </summary>
      <ul className="product-variant-group__list">{children}</ul>
    </details>
  );
}
