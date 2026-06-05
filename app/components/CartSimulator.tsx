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
    <div className="cart-simulator" style={{ maxWidth: "900px" }}>
      <h2 style={{ marginBottom: "1rem" }}>
        {activeRuleId ? `Testing: ${activeRuleId}` : "Cart Simulator"}
      </h2>

      <section
        style={{
          backgroundColor: "#f9fafb",
          padding: "1rem",
          borderRadius: "0.5rem",
          marginBottom: "1.5rem",
          border: "1px solid #e5e7eb",
        }}
      >
        <h4 style={{ marginBottom: "0.75rem" }}>Add Item to Cart</h4>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr auto auto",
            gap: "0.5rem",
            alignItems: "end",
          }}
        >
          <div>
            <label
              htmlFor="cart-simulator-product-id"
              style={{ display: "block", fontSize: "0.8rem", fontWeight: 600 }}
            >
              Product GID
            </label>

            <input
              id="cart-simulator-product-id"
              type="text"
              value={newProductId}
              onChange={(event) => setNewProductId(event.target.value)}
              placeholder="gid://shopify/Product/..."
              style={{
                width: "100%",
                padding: "0.375rem",
                border: "1px solid #d1d5db",
                borderRadius: "0.25rem",
              }}
            />
          </div>

          <div>
            <label
              htmlFor="cart-simulator-variant-id"
              style={{ display: "block", fontSize: "0.8rem", fontWeight: 600 }}
            >
              Variant GID
            </label>

            <input
              id="cart-simulator-variant-id"
              type="text"
              value={newVariantId}
              onChange={(event) => setNewVariantId(event.target.value)}
              placeholder="gid://shopify/ProductVariant/..."
              style={{
                width: "100%",
                padding: "0.375rem",
                border: "1px solid #d1d5db",
                borderRadius: "0.25rem",
              }}
            />
          </div>

          <div>
            <label
              htmlFor="cart-simulator-quantity"
              style={{ display: "block", fontSize: "0.8rem", fontWeight: 600 }}
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
              style={{
                width: "70px",
                padding: "0.375rem",
                border: "1px solid #d1d5db",
                borderRadius: "0.25rem",
              }}
            />
          </div>

          <button
            type="button"
            onClick={addCartLine}
            className="btn btn--primary"
            style={{ padding: "0.375rem 1rem", height: "fit-content" }}
          >
            Add
          </button>
        </div>
      </section>

      <section style={{ marginBottom: "1rem" }}>
        <label
          htmlFor="cart-simulator-fixture"
          style={{ fontSize: "0.8rem", fontWeight: 600, marginRight: "0.5rem" }}
        >
          Load Fixture:
        </label>

        <select
          id="cart-simulator-fixture"
          onChange={(event) => loadFixture(event.target.value)}
          defaultValue=""
          style={{
            padding: "0.375rem",
            border: "1px solid #d1d5db",
            borderRadius: "0.25rem",
          }}
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

      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          marginBottom: "1.5rem",
        }}
      >
        <thead>
          <tr style={{ borderBottom: "2px solid #e5e7eb", textAlign: "left" }}>
            <th style={{ padding: "0.5rem" }}>Line ID</th>
            <th style={{ padding: "0.5rem" }}>Product GID</th>
            <th style={{ padding: "0.5rem" }}>Variant GID</th>
            <th style={{ padding: "0.5rem" }}>Quantity</th>
            <th style={{ padding: "0.5rem" }}>Actions</th>
          </tr>
        </thead>

        <tbody>
          {cartLines.map((line) => (
            <tr key={line.id} style={{ borderBottom: "1px solid #e5e7eb" }}>
              <td style={{ padding: "0.5rem", fontSize: "0.8rem" }}>
                {line.id}
              </td>

              <td
                title={line.merchandise.product.id}
                style={{
                  padding: "0.5rem",
                  fontSize: "0.8rem",
                  maxWidth: "200px",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {getGidTail(line.merchandise.product.id)}
              </td>

              <td
                title={line.merchandise.id}
                style={{
                  padding: "0.5rem",
                  fontSize: "0.8rem",
                  maxWidth: "200px",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {getGidTail(line.merchandise.id)}
              </td>

              <td style={{ padding: "0.5rem" }}>{line.quantity}</td>

              <td style={{ padding: "0.5rem" }}>
                <button
                  type="button"
                  onClick={() => removeCartLine(line.id)}
                  className="btn btn--small btn--danger"
                  style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem" }}
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
                style={{
                  padding: "2rem",
                  textAlign: "center",
                  color: "#9ca3af",
                }}
              >
                No items in cart. Add products or load a fixture.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {cartLines.length > 0 && (
        <button
          type="button"
          onClick={clearCart}
          className="btn btn--secondary"
          style={{ marginBottom: "1.5rem" }}
        >
          Clear Cart
        </button>
      )}

      {results.length > 0 && (
        <section
          style={{
            backgroundColor: "#f0fdf4",
            padding: "1rem",
            borderRadius: "0.5rem",
            border: "1px solid #22c55e",
            marginBottom: "1.5rem",
          }}
        >
          <h4 style={{ color: "#166534", marginBottom: "0.75rem" }}>
            Discounts Applied ({results.length})
          </h4>

          {results.map((action: { variantId: string; percentageOff: string | number | bigint | boolean | ReactElement<unknown, string | JSXElementConstructor<any>> | Iterable<ReactNode> | ReactPortal | Promise<string | number | bigint | boolean | ReactPortal | ReactElement<unknown, string | JSXElementConstructor<any>> | Iterable<ReactNode> | null | undefined> | null | undefined; discountedQuantity: string | number | bigint | boolean | ReactElement<unknown, string | JSXElementConstructor<any>> | Iterable<ReactNode> | ReactPortal | Promise<string | number | bigint | boolean | ReactPortal | ReactElement<unknown, string | JSXElementConstructor<any>> | Iterable<ReactNode> | null | undefined> | null | undefined; message: string | number | bigint | boolean | ReactElement<unknown, string | JSXElementConstructor<any>> | Iterable<ReactNode> | ReactPortal | Promise<string | number | bigint | boolean | ReactPortal | ReactElement<unknown, string | JSXElementConstructor<any>> | Iterable<ReactNode> | null | undefined> | null | undefined; }, index: any) => (
            <div
              key={`${action.variantId}-${index}`}
              style={{
                padding: "0.5rem",
                backgroundColor: "#fff",
                borderRadius: "0.25rem",
                marginBottom: "0.5rem",
                border: "1px solid #dcfce7",
              }}
            >
              <strong>{action.percentageOff}% Off</strong> on{" "}
              {getGidTail(action.variantId)}

              <span
                style={{
                  display: "block",
                  fontSize: "0.8rem",
                  color: "#6b7280",
                }}
              >
                Qty discounted: {action.discountedQuantity} | {action.message}
              </span>
            </div>
          ))}
        </section>
      )}

      {cartLines.length > 0 && results.length === 0 && (
        <section
          style={{
            backgroundColor: "#fef2f2",
            padding: "1rem",
            borderRadius: "0.5rem",
            border: "1px solid #ef4444",
            marginBottom: "1.5rem",
          }}
        >
          <p style={{ color: "#991b1b", fontWeight: 600 }}>
            No discounts applied
          </p>

          <p style={{ color: "#7f1d1d", fontSize: "0.85rem" }}>
            The current cart configuration does not trigger any discounts for
            the active rules.
          </p>
        </section>
      )}

      {cartLines.length > 0 && (
        <div style={{ marginTop: "1rem" }}>
          <button
            type="button"
            onClick={copyFixtureJson}
            className="btn btn--secondary"
            style={{ fontSize: "0.8rem" }}
          >
            Copy Fixture JSON
          </button>
        </div>
      )}
    </div>
  );
}
