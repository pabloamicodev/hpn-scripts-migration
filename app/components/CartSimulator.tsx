import { useMemo, useState } from "react";

import {
  evaluateConfig,
  type CartLine,
  type DiscountAction,
} from "../lib/hpnPromoEvaluator";
import type { HpnPromoConfig, HpnPromoRule } from "../lib/validations";
import {
  ProductPicker,
  type ProductPickerSelection,
} from "./ProductPicker";

interface CartSimulatorProps {
  config: HpnPromoConfig;
  activeRuleId?: string;
}

interface SimulatorCartLine extends CartLine {
  productTitle?: string;
  productHandle?: string;
  variantTitle?: string;
  sku?: string | null;
  price?: string;
  imageUrl?: string;
  imageAlt?: string | null;
}

interface Fixture {
  id: string;
  name: string;
  description: string;
  lines: SimulatorCartLine[];
}

const PA7_PRODUCT_ID = "gid://shopify/Product/1313973239892";
const C2_PRODUCT_ID = "gid://shopify/Product/1319321763924";

const NAD3_SINGLE_VARIANT_ID = "gid://shopify/ProductVariant/21174522675284";
const PLANTA_PB_SAMPLE_VARIANT_ID =
  "gid://shopify/ProductVariant/40608348438665";
const PLANTA_CACAO_SAMPLE_VARIANT_ID =
  "gid://shopify/ProductVariant/40608348373129";

const NAD3_240_PRODUCT_ID = "gid://shopify/Product/6784435060873";
const S9_1WK_POUCH_VARIANT_ID =
  "gid://shopify/ProductVariant/44633124995209";
const N4_1WK_POUCH_VARIANT_ID =
  "gid://shopify/ProductVariant/44633124864137";

// Placeholder variant used only for simulator trigger lines when the real variant
// ID is not important for local rule evaluation.
const NAD3_240_PLACEHOLDER_VARIANT_ID =
  "gid://shopify/ProductVariant/6784435060873";

function getGidTail(gid: string) {
  return gid.split("/").pop() ?? gid;
}

function createCartLine(
  id: string,
  productId: string,
  variantId: string,
  quantity = 1,
  metadata: Partial<SimulatorCartLine> = {},
): SimulatorCartLine {
  return {
    id,
    quantity,
    merchandise: {
      __typename: "ProductVariant",
      id: variantId,
      product: {
        id: productId,
      },
    },
    ...metadata,
  };
}

const fixtures: Fixture[] = [
  {
    id: "pa7-c2-qty-1",
    name: "PA7 + C2 qty 1",
    description: "Should apply the 10% cross-sell discount.",
    lines: [
      createCartLine(
        "line-pa7",
        PA7_PRODUCT_ID,
        "gid://shopify/ProductVariant/1313973239892",
        1,
        {
          productTitle: "PA7 Mediator mTOR Elevation",
          variantTitle: "Trigger product",
        },
      ),
      createCartLine(
        "line-c2",
        C2_PRODUCT_ID,
        "gid://shopify/ProductVariant/1319321763924",
        1,
        {
          productTitle: "C2 Ultrapure Premium Creapure",
          variantTitle: "Target product",
        },
      ),
    ],
  },
  {
    id: "pa7-c2-qty-2",
    name: "PA7 + C2 qty 2",
    description: "Should not discount because the target quantity is 2.",
    lines: [
      createCartLine(
        "line-pa7",
        PA7_PRODUCT_ID,
        "gid://shopify/ProductVariant/1313973239892",
        1,
        {
          productTitle: "PA7 Mediator mTOR Elevation",
          variantTitle: "Trigger product",
        },
      ),
      createCartLine(
        "line-c2",
        C2_PRODUCT_ID,
        "gid://shopify/ProductVariant/1319321763924",
        2,
        {
          productTitle: "C2 Ultrapure Premium Creapure",
          variantTitle: "Target quantity 2",
        },
      ),
    ],
  },
  {
    id: "planta-all-present",
    name: "NAD3 + Planta samples",
    description: "Should make both Planta sample variants free.",
    lines: [
      createCartLine(
        "line-nad3-single",
        "gid://shopify/Product/placeholder-nad3-single",
        NAD3_SINGLE_VARIANT_ID,
        1,
        {
          productTitle: "NAD3 Single Bottle",
          variantTitle: "Required variant",
        },
      ),
      createCartLine(
        "line-planta-pb",
        "gid://shopify/Product/placeholder-planta-pb",
        PLANTA_PB_SAMPLE_VARIANT_ID,
        1,
        {
          productTitle: "Planta PB Sample",
          variantTitle: "Free sample",
        },
      ),
      createCartLine(
        "line-planta-cacao",
        "gid://shopify/Product/placeholder-planta-cacao",
        PLANTA_CACAO_SAMPLE_VARIANT_ID,
        1,
        {
          productTitle: "Planta Cacao Sample",
          variantTitle: "Free sample",
        },
      ),
    ],
  },
  {
    id: "pouches-all-present",
    name: "NAD3 240 + pouches",
    description: "Should make both pouch variants free.",
    lines: [
      createCartLine(
        "line-nad3-240",
        NAD3_240_PRODUCT_ID,
        NAD3_240_PLACEHOLDER_VARIANT_ID,
        1,
        {
          productTitle: "NAD3 240",
          variantTitle: "Trigger product",
        },
      ),
      createCartLine(
        "line-s9-pouch",
        "gid://shopify/Product/placeholder-s9-pouch",
        S9_1WK_POUCH_VARIANT_ID,
        1,
        {
          productTitle: "S9 1-Week Pouch",
          variantTitle: "Free pouch",
        },
      ),
      createCartLine(
        "line-n4-pouch",
        "gid://shopify/Product/placeholder-n4-pouch",
        N4_1WK_POUCH_VARIANT_ID,
        1,
        {
          productTitle: "N4 1-Week Pouch",
          variantTitle: "Free pouch",
        },
      ),
    ],
  },
  {
    id: "pouches-qty-2-and-3",
    name: "Pouches qty 2 and 3",
    description: "Should discount only one unit per pouch line.",
    lines: [
      createCartLine(
        "line-nad3-240",
        NAD3_240_PRODUCT_ID,
        NAD3_240_PLACEHOLDER_VARIANT_ID,
        1,
        {
          productTitle: "NAD3 240",
          variantTitle: "Trigger product",
        },
      ),
      createCartLine(
        "line-s9-pouch",
        "gid://shopify/Product/placeholder-s9-pouch",
        S9_1WK_POUCH_VARIANT_ID,
        2,
        {
          productTitle: "S9 1-Week Pouch",
          variantTitle: "Quantity 2",
        },
      ),
      createCartLine(
        "line-n4-pouch",
        "gid://shopify/Product/placeholder-n4-pouch",
        N4_1WK_POUCH_VARIANT_ID,
        3,
        {
          productTitle: "N4 1-Week Pouch",
          variantTitle: "Quantity 3",
        },
      ),
    ],
  },
];

export function CartSimulator({ config, activeRuleId }: CartSimulatorProps) {
  const [cartLines, setCartLines] = useState<SimulatorCartLine[]>([]);
  const [selectedItem, setSelectedItem] =
    useState<ProductPickerSelection | null>(null);
  const [newQuantity, setNewQuantity] = useState(1);
  const [lastFixtureId, setLastFixtureId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const activeRule = useMemo(() => {
    if (!activeRuleId) return null;
    return config.rules.find((rule) => rule.id === activeRuleId) ?? null;
  }, [activeRuleId, config.rules]);

  const testConfig = useMemo(() => {
    if (!activeRule) return config;
    return {
      ...config,
      rules: [activeRule] as HpnPromoConfig["rules"],
    };
  }, [activeRule, config]);

  const results = useMemo(() => {
    if (cartLines.length === 0) return [];
    return evaluateConfig(testConfig, cartLines);
  }, [cartLines, testConfig]);

  const totalQuantity = cartLines.reduce((sum, line) => sum + line.quantity, 0);
  const discountedQuantity = results.reduce(
    (sum, action) => sum + action.discountedQuantity,
    0,
  );

  function addSelectedLine() {
    if (!selectedItem) return;

    const nextLine = createCartLine(
      `line-${Date.now()}`,
      selectedItem.productId,
      selectedItem.variantId,
      Math.max(1, newQuantity),
      {
        productTitle: selectedItem.productTitle,
        productHandle: selectedItem.productHandle,
        variantTitle: selectedItem.variantTitle,
        sku: selectedItem.sku,
        price: selectedItem.price,
        imageUrl: selectedItem.imageUrl,
        imageAlt: selectedItem.imageAlt,
      },
    );

    setCartLines((currentLines) => [...currentLines, nextLine]);
    setSelectedItem(null);
    setNewQuantity(1);
    setLastFixtureId(null);
  }

  function removeCartLine(lineId: string) {
    setCartLines((currentLines) =>
      currentLines.filter((line) => line.id !== lineId),
    );
  }

  function clearCart() {
    setCartLines([]);
    setLastFixtureId(null);
  }

  function loadFixture(fixture: Fixture) {
    setCartLines(fixture.lines);
    setLastFixtureId(fixture.id);
    setSelectedItem(null);
  }

  function copyFixtureJson() {
    const fixture = JSON.stringify(
      {
        lines: cartLines,
        results,
      },
      null,
      2,
    );

    void navigator.clipboard.writeText(fixture);
  }

  return (
    <>
      <section className="card card--raised settings-card">
        <div className="card__header">
          <div>
            <h2 className="card__title">Cart simulator</h2>
            <p className="card__subtitle">
              {activeRule
                ? `Testing only ${getRuleName(activeRule)}`
                : "Evaluating all active promo rules"}
            </p>
          </div>
          {activeRuleId && !activeRule && (
            <span className="status-badge status-badge--error">
              Rule not found
            </span>
          )}
        </div>

        <div className="card__body">
          <div className="summary-grid">
            <div className="summary-tile">
              <p className="summary-tile__label">Cart lines</p>
              <p className="summary-tile__value">{cartLines.length}</p>
              <p className="summary-tile__note">{totalQuantity} total units</p>
            </div>
            <div className="summary-tile">
              <p className="summary-tile__label">Discount actions</p>
              <p className="summary-tile__value">{results.length}</p>
              <p className="summary-tile__note">
                {discountedQuantity} units discounted
              </p>
            </div>
            <div className="summary-tile">
              <p className="summary-tile__label">Rules evaluated</p>
              <p className="summary-tile__value">{testConfig.rules.length}</p>
              <p className="summary-tile__note">
                {activeRule ? "Single-rule test" : "Full configuration"}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="form-section form-section--subdued settings-card">
        <div className="card__header" style={{ padding: 0, border: 0 }}>
          <div>
            <h3 className="form-section__title">Add item to cart</h3>
            <p className="card__subtitle">
              Pick a Shopify product and variant instead of typing IDs.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="btn btn--primary"
          >
            Pick product
          </button>
        </div>

        {selectedItem ? (
          <div className="selected-product-card">
            <ProductThumb
              imageUrl={selectedItem.imageUrl}
              title={selectedItem.productTitle}
            />

            <div className="selected-product-card__body">
              <div>
                <h4>{selectedItem.productTitle}</h4>
                <p>
                  {selectedItem.variantTitle}
                  {selectedItem.sku ? ` · SKU ${selectedItem.sku}` : ""}
                </p>
                <p className="mono">
                  Product {getGidTail(selectedItem.productId)} · Variant{" "}
                  {getGidTail(selectedItem.variantId)}
                </p>
              </div>

              <div className="selected-product-card__controls">
                <label className="form-label" htmlFor="cart-line-quantity">
                  Qty
                </label>
                <input
                  id="cart-line-quantity"
                  type="number"
                  min={1}
                  value={newQuantity}
                  onChange={(event) => {
                    setNewQuantity(
                      Number.parseInt(event.target.value, 10) || 1,
                    );
                  }}
                  className="number-field"
                />
                <button
                  type="button"
                  onClick={addSelectedLine}
                  className="btn btn--primary"
                >
                  Add to cart
                </button>
              </div>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="product-picker-trigger"
          >
            <span className="product-picker-trigger__icon">+</span>
            <span>
              <strong>Select a Shopify product</strong>
              <span>
                Search by product name, handle, or SKU and choose a variant.
              </span>
            </span>
          </button>
        )}
      </section>

      <section className="card settings-card">
        <div className="card__header">
          <div>
            <h3 className="card__title">Fixtures</h3>
            <p className="card__subtitle">
              Load known HPN cart scenarios.
            </p>
          </div>
        </div>

        <div className="card__body">
          <div className="fixture-grid">
            {fixtures.map((fixture) => (
              <button
                key={fixture.id}
                type="button"
                onClick={() => loadFixture(fixture)}
                className="btn fixture-button"
                aria-pressed={lastFixtureId === fixture.id}
              >
                <span>
                  <strong>{fixture.name}</strong>
                  <span className="cell-muted" style={{ display: "block" }}>
                    {fixture.description}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="resource-card settings-card">
        <div className="resource-header">
          <div>
            <h3 className="resource-title">Cart lines</h3>
            <p className="resource-meta">
              {cartLines.length} lines · {totalQuantity} units
            </p>
          </div>

          <div className="btn-row btn-row--end">
            <button
              type="button"
              onClick={copyFixtureJson}
              className="btn btn--small"
              disabled={cartLines.length === 0}
            >
              Copy JSON
            </button>
            <button
              type="button"
              onClick={clearCart}
              className="btn btn--small"
              disabled={cartLines.length === 0}
            >
              Clear
            </button>
          </div>
        </div>

        <div className="cart-line-grid">
          {cartLines.map((line) => (
            <article key={line.id} className="cart-line-card">
              <ProductThumb
                imageUrl={line.imageUrl}
                title={getLineProductTitle(line)}
              />

              <div className="cart-line-card__body">
                <div className="cart-line-card__title-row">
                  <div>
                    <h4>{getLineProductTitle(line)}</h4>
                    <p>
                      {line.variantTitle ?? "Variant"} · Qty {line.quantity}
                    </p>
                  </div>
                  {line.price && (
                    <span className="status-badge status-badge--inactive">
                      ${line.price}
                    </span>
                  )}
                </div>

                <div className="cart-line-meta">
                  {line.sku && <span>SKU {line.sku}</span>}
                  <span>Product {getGidTail(line.merchandise.product.id)}</span>
                  <span>Variant {getGidTail(line.merchandise.id)}</span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => removeCartLine(line.id)}
                className="btn btn--small btn--danger"
              >
                Remove
              </button>
            </article>
          ))}

          {cartLines.length === 0 && (
            <div className="cart-line-empty">
              <strong>No cart lines yet.</strong>
              <span>Pick a product or load a fixture to start testing.</span>
            </div>
          )}
        </div>
      </section>

      <section className="card settings-card">
        <div className="card__header">
          <div>
            <h3 className="card__title">Evaluation</h3>
            <p className="card__subtitle">
              Current simulator scope and output.
            </p>
          </div>
        </div>

        <div className="card__body">
          <ul className="detail-list">
            <li>
              <span className="detail-list__label">Scope</span>
              <span className="detail-list__value">
                {activeRule ? getRuleName(activeRule) : "All rules"}
              </span>
            </li>
            <li>
              <span className="detail-list__label">Fixture</span>
              <span className="detail-list__value">
                {lastFixtureId
                  ? fixtures.find((fixture) => fixture.id === lastFixtureId)
                      ?.name
                  : "Custom cart"}
              </span>
            </li>
            <li>
              <span className="detail-list__label">Outcome</span>
              <span className="detail-list__value">
                {cartLines.length === 0
                  ? "Waiting for cart lines"
                  : results.length > 0
                    ? `${results.length} discount action${
                        results.length === 1 ? "" : "s"
                      }`
                    : "No discount"}
              </span>
            </li>
          </ul>
        </div>
      </section>

      {cartLines.length > 0 && results.length > 0 && (
        <section className="alert alert--success settings-card settings-card--full">
          <h3
            className="form-section__title"
            style={{ marginBottom: "10px" }}
          >
            Discounts applied ({results.length})
          </h3>

          <div className="summary-grid">
            {results.map((action: DiscountAction, index) => {
              const line = cartLines.find(
                (cartLine) => cartLine.merchandise.id === action.variantId,
              );

              return (
                <div
                  key={`${action.variantId}-${index}`}
                  className="summary-tile"
                >
                  <p className="summary-tile__label">
                    {formatDiscountAction(action)}
                  </p>
                  <p className="summary-tile__value">
                    {line ? getLineProductTitle(line) : getGidTail(action.variantId)}
                  </p>
                  <p className="summary-tile__note">
                    Qty {action.discountedQuantity} · {action.message}
                  </p>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {cartLines.length > 0 && results.length === 0 && (
        <section className="alert alert--critical settings-card settings-card--full">
          <p style={{ margin: 0, fontWeight: 650 }}>
            No discounts applied
          </p>
          <p style={{ margin: "4px 0 0" }}>
            The current cart configuration does not trigger the evaluated
            rules.
          </p>
        </section>
      )}

      {pickerOpen && (
        <ProductPicker
          onSelect={(selection) => {
            setSelectedItem(selection);
            setPickerOpen(false);
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </>
  );
}

function ProductThumb({
  imageUrl,
  title,
}: {
  imageUrl?: string;
  title: string;
}) {
  return (
    <div className="product-thumb">
      {imageUrl ? (
        <img src={imageUrl} alt={title} loading="lazy" />
      ) : (
        <span>{title.slice(0, 2).toUpperCase()}</span>
      )}
    </div>
  );
}

function getLineProductTitle(line: SimulatorCartLine) {
  return line.productTitle ?? `Product ${getGidTail(line.merchandise.product.id)}`;
}

function getRuleName(rule: HpnPromoRule) {
  switch (rule.id) {
    case "pa7-cross-sell":
      return "PA7 Cross-Sell";
    case "nad3-single-planta-samples":
      return "NAD3 Single + Planta Samples";
    case "nad3-240-pouches":
      return "NAD3 240 + Pouches";
    default:
      return "Custom rule";
  }
}

function formatDiscountAction(action: DiscountAction) {
  return action.percentageOff === 100
    ? "Free item"
    : `${action.percentageOff}% off`;
}
