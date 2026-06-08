import { JSXElementConstructor, ReactElement, ReactNode, ReactPortal, useMemo, useState } from "react";

import {
  evaluateConfig,
  type CartLine,
} from "../lib/hpnPromoEvaluator";

import type { HpnPromoConfig } from "../lib/validations";

interface CartSimulatorProps {
  config: HpnPromoConfig;
  activeRuleId?: string;
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
// ID is not important for the rule evaluation.
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
): CartLine {
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
  };
}

const fixtures: Record<string, CartLine[]> = {
  "pa7-c2-qty-1": [
    createCartLine(
      "l1",
      PA7_PRODUCT_ID,
      "gid://shopify/ProductVariant/1313973239892",
    ),
    createCartLine(
      "l2",
      C2_PRODUCT_ID,
      "gid://shopify/ProductVariant/1319321763924",
    ),
  ],

  "pa7-c2-qty-2": [
    createCartLine(
      "l1",
      PA7_PRODUCT_ID,
      "gid://shopify/ProductVariant/1313973239892",
    ),
    createCartLine(
      "l2",
      C2_PRODUCT_ID,
      "gid://shopify/ProductVariant/1319321763924",
      2,
    ),
  ],

  "planta-all-present": [
    createCartLine(
      "l1",
      "gid://shopify/Product/placeholder-nad3-single",
      NAD3_SINGLE_VARIANT_ID,
    ),
    createCartLine(
      "l2",
      "gid://shopify/Product/placeholder-planta-pb",
      PLANTA_PB_SAMPLE_VARIANT_ID,
    ),
    createCartLine(
      "l3",
      "gid://shopify/Product/placeholder-planta-cacao",
      PLANTA_CACAO_SAMPLE_VARIANT_ID,
    ),
  ],

  "pouches-all-present": [
    createCartLine(
      "l1",
      NAD3_240_PRODUCT_ID,
      NAD3_240_PLACEHOLDER_VARIANT_ID,
    ),
    createCartLine(
      "l2",
      "gid://shopify/Product/placeholder-s9-pouch",
      S9_1WK_POUCH_VARIANT_ID,
    ),
    createCartLine(
      "l3",
      "gid://shopify/Product/placeholder-n4-pouch",
      N4_1WK_POUCH_VARIANT_ID,
    ),
  ],

  "pouches-qty-2-and-3": [
    createCartLine(
      "l1",
      NAD3_240_PRODUCT_ID,
      NAD3_240_PLACEHOLDER_VARIANT_ID,
    ),
    createCartLine(
      "l2",
      "gid://shopify/Product/placeholder-s9-pouch",
      S9_1WK_POUCH_VARIANT_ID,
      2,
    ),
    createCartLine(
      "l3",
      "gid://shopify/Product/placeholder-n4-pouch",
      N4_1WK_POUCH_VARIANT_ID,
      3,
    ),
  ],
};

export function CartSimulator({ config, activeRuleId }: CartSimulatorProps) {
  const [cartLines, setCartLines] = useState<CartLine[]>([]);
  const [newProductId, setNewProductId] = useState("");
  const [newVariantId, setNewVariantId] = useState("");
  const [newQuantity, setNewQuantity] = useState(1);

  const testConfig = useMemo(() => {
    if (!activeRuleId) {
      return config;
    }

    const activeRule = config.rules.find((rule: { id: string; }) => rule.id === activeRuleId);

    if (!activeRule) {
      return config;
    }

    return {
      ...config,
      rules: [activeRule],
    };
  }, [activeRuleId, config]);

  const results = useMemo(() => {
    if (cartLines.length === 0) {
      return [];
    }

    return evaluateConfig(testConfig, cartLines);
  }, [cartLines, testConfig]);

  function addCartLine() {
    const productId = newProductId.trim();
    const variantId = newVariantId.trim();

    if (!productId || !variantId) {
      return;
    }

    const nextLine = createCartLine(
      `line-${Date.now()}`,
      productId,
      variantId,
      Math.max(1, newQuantity),
    );

    setCartLines((currentLines) => [...currentLines, nextLine]);
    setNewProductId("");
    setNewVariantId("");
    setNewQuantity(1);
  }

  function removeCartLine(lineId: string) {
    setCartLines((currentLines) =>
      currentLines.filter((line) => line.id !== lineId),
    );
  }

  function clearCart() {
    setCartLines([]);
  }

  function loadFixture(fixtureName: string) {
    const fixture = fixtures[fixtureName];

    if (!fixture) {
      return;
    }

    setCartLines(fixture);
  }

  async function copyFixtureJson() {
    const fixture = JSON.stringify(
      {
        lines: cartLines,
        results,
      },
      null,
      2,
    );

    await navigator.clipboard.writeText(fixture);
  }

  return (
    <div className="app-page app-page--wide">
      <header className="page-header">
        <div>
          <h2 className="page-title">
            {activeRuleId ? `Testing: ${activeRuleId}` : "Cart simulator"}
          </h2>
          <p className="page-subtitle">
            Load fixtures or compose cart lines to test rule evaluation.
          </p>
        </div>
      </header>

      <section className="form-section">
        <h3 className="form-section__title">Add item to cart</h3>

        <div className="simulator-grid">
          <div className="form-group">
            <label
              htmlFor="cart-simulator-product-id"
              className="form-label"
            >
              Product GID
            </label>

            <input
              id="cart-simulator-product-id"
              type="text"
              value={newProductId}
              onChange={(event) => setNewProductId(event.target.value)}
              placeholder="gid://shopify/Product/..."
            />
          </div>

          <div className="form-group">
            <label
              htmlFor="cart-simulator-variant-id"
              className="form-label"
            >
              Variant GID
            </label>

            <input
              id="cart-simulator-variant-id"
              type="text"
              value={newVariantId}
              onChange={(event) => setNewVariantId(event.target.value)}
              placeholder="gid://shopify/ProductVariant/..."
            />
          </div>

          <div className="form-group">
            <label
              htmlFor="cart-simulator-quantity"
              className="form-label"
            >
              Qty
            </label>

            <input
              id="cart-simulator-quantity"
              type="number"
              min={1}
              value={newQuantity}
              onChange={(event) => {
                setNewQuantity(Number.parseInt(event.target.value, 10) || 1);
              }}
            />
          </div>

          <button
            type="button"
            onClick={addCartLine}
            className="btn btn--primary"
          >
            Add
          </button>
        </div>
      </section>

      <section className="form-section">
        <label
          htmlFor="cart-simulator-fixture"
          className="form-label"
        >
          Load fixture
        </label>

        <select
          id="cart-simulator-fixture"
          onChange={(event) => loadFixture(event.target.value)}
          defaultValue=""
        >
          <option value="" disabled>
            Select a fixture...
          </option>
          <option value="pa7-c2-qty-1">
            PA7 + C2 qty 1 - Should discount
          </option>
          <option value="pa7-c2-qty-2">
            PA7 + C2 qty 2 - No discount
          </option>
          <option value="planta-all-present">
            Planta all present - Both free
          </option>
          <option value="pouches-all-present">
            Pouches all present - Both free
          </option>
          <option value="pouches-qty-2-and-3">
            Pouches qty 2 and 3 - Only 1 free each
          </option>
        </select>
      </section>

      <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>Line ID</th>
            <th>Product GID</th>
            <th>Variant GID</th>
            <th>Quantity</th>
            <th>Actions</th>
          </tr>
        </thead>

        <tbody>
          {cartLines.map((line) => (
            <tr key={line.id}>
              <td className="cell-muted">
                {line.id}
              </td>

              <td
                title={line.merchandise.product.id}
                className="cell-muted truncate"
              >
                {getGidTail(line.merchandise.product.id)}
              </td>

              <td
                title={line.merchandise.id}
                className="cell-muted truncate"
              >
                {getGidTail(line.merchandise.id)}
              </td>

              <td>{line.quantity}</td>

              <td>
                <button
                  type="button"
                  onClick={() => removeCartLine(line.id)}
                  className="btn btn--small btn--danger"
                >
                  Remove
                </button>
              </td>
            </tr>
          ))}

          {cartLines.length === 0 && (
            <tr>
              <td
                colSpan={5}
                className="muted"
                style={{ padding: "32px", textAlign: "center" }}
              >
                No items in cart. Add products or load a fixture.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      </div>

      {cartLines.length > 0 && (
        <button
          type="button"
          onClick={clearCart}
          className="btn"
          style={{ justifySelf: "start" }}
        >
          Clear Cart
        </button>
      )}

      {results.length > 0 && (
        <section className="alert alert--success">
          <h3 className="form-section__title" style={{ marginBottom: "10px" }}>
            Discounts Applied ({results.length})
          </h3>

          {results.map((action: { variantId: string; percentageOff: string | number | bigint | boolean | ReactElement<unknown, string | JSXElementConstructor<any>> | Iterable<ReactNode> | ReactPortal | Promise<string | number | bigint | boolean | ReactPortal | ReactElement<unknown, string | JSXElementConstructor<any>> | Iterable<ReactNode> | null | undefined> | null | undefined; discountedQuantity: string | number | bigint | boolean | ReactElement<unknown, string | JSXElementConstructor<any>> | Iterable<ReactNode> | ReactPortal | Promise<string | number | bigint | boolean | ReactPortal | ReactElement<unknown, string | JSXElementConstructor<any>> | Iterable<ReactNode> | null | undefined> | null | undefined; message: string | number | bigint | boolean | ReactElement<unknown, string | JSXElementConstructor<any>> | Iterable<ReactNode> | ReactPortal | Promise<string | number | bigint | boolean | ReactPortal | ReactElement<unknown, string | JSXElementConstructor<any>> | Iterable<ReactNode> | null | undefined> | null | undefined; }, index: any) => (
            <div
              key={`${action.variantId}-${index}`}
              className="card"
              style={{ padding: "10px", marginTop: "8px" }}
            >
              <strong>{action.percentageOff}% Off</strong> on{" "}
              {getGidTail(action.variantId)}

              <span
                className="cell-muted"
                style={{ display: "block" }}
              >
                Qty discounted: {action.discountedQuantity} | {action.message}
              </span>
            </div>
          ))}
        </section>
      )}

      {cartLines.length > 0 && results.length === 0 && (
        <section className="alert alert--critical">
          <p style={{ margin: 0, fontWeight: 650 }}>
            No discounts applied
          </p>

          <p style={{ margin: "4px 0 0" }}>
            The current cart configuration does not trigger any discounts for
            the active rules.
          </p>
        </section>
      )}

      {cartLines.length > 0 && (
        <div>
          <button
            type="button"
            onClick={copyFixtureJson}
            className="btn"
          >
            Copy Fixture JSON
          </button>
        </div>
      )}
    </div>
  );
}
