import { useMemo, useState } from "react";

import {
  evaluateConfig,
  type CartLine,
  type CartEvalContext,
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
  context?: {
    hasSubscription?: boolean;
    customerOrders?: number;
    subtotal?: number;
  };
}

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

function simVariant(productId: string, index = 0) {
  return `${productId}-sim-v${index}`;
}

function simProduct(variantId: string, index = 0) {
  return `${variantId}-sim-p${index}`;
}

function getFixturesFromConfig(config: HpnPromoConfig): Fixture[] {
  const result: Fixture[] = [];

  for (const rule of config.rules) {
    if (!rule.enabled) continue;

    if (rule.type === "pa7_cross_sell") {
      rule.targetProductIds.forEach((targetId, i) => {
        result.push({
          id: `${rule.id}-target${i}-match`,
          name: `${rule.id} — target ${i + 1} match`,
          description: `Should apply ${rule.discountPercentage}% off`,
          lines: [
            createCartLine("sim-trigger", rule.triggerProductId, simVariant(rule.triggerProductId), 1, { productTitle: "Trigger product" }),
            createCartLine("sim-target", targetId, simVariant(targetId), rule.targetLineQuantityEquals, { productTitle: `Target product ${i + 1}` }),
          ],
        });
        result.push({
          id: `${rule.id}-target${i}-no-match`,
          name: `${rule.id} — target ${i + 1} qty mismatch`,
          description: `Qty ${rule.targetLineQuantityEquals + 1} should NOT discount`,
          lines: [
            createCartLine("sim-trigger", rule.triggerProductId, simVariant(rule.triggerProductId), 1, { productTitle: "Trigger product" }),
            createCartLine("sim-target", targetId, simVariant(targetId), rule.targetLineQuantityEquals + 1, { productTitle: `Target product ${i + 1}` }),
          ],
        });
      });
    }

    else if (rule.type === "required_variants_free_variants") {
      result.push({
        id: `${rule.id}-all-present`,
        name: `${rule.id} — all present`,
        description: `${rule.discountPercentage}% off free variants should apply`,
        lines: [
          ...rule.requiredVariantIds.map((vid, i) =>
            createCartLine(`sim-req-${i}`, simProduct(vid, i), vid, 1, { productTitle: `Required variant ${i + 1}` })
          ),
          ...rule.freeVariantIds.map((vid, i) =>
            createCartLine(`sim-free-${i}`, simProduct(vid, i + 100), vid, 1, { productTitle: `Free variant ${i + 1}` })
          ),
        ],
      });
      result.push({
        id: `${rule.id}-missing-required`,
        name: `${rule.id} — missing required`,
        description: "Should NOT discount (one required variant absent)",
        lines: [
          ...rule.freeVariantIds.map((vid, i) =>
            createCartLine(`sim-free-${i}`, simProduct(vid, i + 100), vid, 1, { productTitle: `Free variant ${i + 1}` })
          ),
        ],
      });
    }

    else if (rule.type === "required_product_with_free_variants") {
      result.push({
        id: `${rule.id}-all-present`,
        name: `${rule.id} — all present`,
        description: `${rule.discountPercentage}% off free variants should apply`,
        lines: [
          createCartLine("sim-trigger", rule.triggerProductId, simVariant(rule.triggerProductId), 1, { productTitle: "Trigger product" }),
          ...rule.requiredVariantIds.map((vid, i) =>
            createCartLine(`sim-req-${i}`, simProduct(vid, i), vid, 1, { productTitle: `Required variant ${i + 1}` })
          ),
          ...rule.freeVariantIds.map((vid, i) =>
            createCartLine(`sim-free-${i}`, simProduct(vid, i + 100), vid, 1, { productTitle: `Free variant ${i + 1}` })
          ),
        ],
      });
    }

    else if (rule.type === "trigger_product_discounted_targets") {
      result.push({
        id: `${rule.id}-all-present`,
        name: `${rule.id} — trigger + targets`,
        description: "Should discount each target at its configured %",
        lines: [
          createCartLine("sim-trigger", rule.triggerProductId, simVariant(rule.triggerProductId), 1, { productTitle: "Trigger product" }),
          ...rule.targets.map((t, i) =>
            createCartLine(`sim-target-${i}`, t.productId, simVariant(t.productId, i), 1, { productTitle: `Target ${i + 1} (${t.discountPercentage}% off)` })
          ),
        ],
      });
    }

    else if (rule.type === "loyalty_tier") {
      const targetId = rule.targetProductIds[0];
      if (targetId) {
        const sorted = [...rule.tiers].sort((a, b) => a.minOrders - b.minOrders);
        for (const tier of sorted) {
          result.push({
            id: `${rule.id}-tier-${tier.minOrders}`,
            name: `${rule.id} — ${tier.minOrders}+ orders`,
            description: `${tier.discountPercentage}% off should apply`,
            lines: [
              createCartLine("sim-target", targetId, simVariant(targetId), 1, { productTitle: "Target product" }),
            ],
            context: { customerOrders: tier.minOrders },
          });
        }
      }
    }

    else if (rule.type === "subscription_bundle_group") {
      const targetId = rule.targetProductIds[0];
      if (targetId) {
        result.push({
          id: `${rule.id}-subscription`,
          name: `${rule.id} — subscription`,
          description: `${rule.discountPercentage}% off up to ${rule.maxUnitsTotal} units`,
          lines: [
            createCartLine("sim-sub", targetId, simVariant(targetId), Math.min(rule.maxUnitsTotal, 2), {
              productTitle: "Target product (subscription)",
              sellingPlanAllocation: { sellingPlan: { id: "gid://shopify/SellingPlan/sim-1" } },
            }),
          ],
          context: { hasSubscription: true },
        });
        result.push({
          id: `${rule.id}-one-time`,
          name: `${rule.id} — one-time (no discount)`,
          description: "Should NOT discount (no selling plan)",
          lines: [
            createCartLine("sim-one-time", targetId, simVariant(targetId, 1), 1, { productTitle: "Target product (one-time)" }),
          ],
          context: { hasSubscription: false },
        });
      }
    }

    // swell_free_product / swell_cart_fixed_amount: no-op in the Function,
    // nothing meaningful to simulate locally.
  }

  return result;
}

export function CartSimulator({ config, activeRuleId }: CartSimulatorProps) {
  const [cartLines, setCartLines] = useState<SimulatorCartLine[]>([]);
  const [selectedItem, setSelectedItem] =
    useState<ProductPickerSelection | null>(null);
  const [newQuantity, setNewQuantity] = useState(1);
  const [lastFixtureId, setLastFixtureId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">(
    "idle",
  );

  // Simulation context inputs
  const [simSubtotal, setSimSubtotal] = useState("");
  const [simOrders, setSimOrders] = useState("");
  const [simAttributes, setSimAttributes] = useState("");
  const [simHasSub, setSimHasSub] = useState(false);

  const fixtures = useMemo(() => getFixturesFromConfig(config), [config]);

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

  const evalContext = useMemo((): CartEvalContext => {
    const attributes = simAttributes
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => {
        const eq = s.indexOf("=");
        return eq > -1
          ? { key: s.slice(0, eq).trim(), value: s.slice(eq + 1).trim() }
          : { key: s, value: "" };
      });

    return {
      subtotalAmount: simSubtotal ? parseFloat(simSubtotal) : undefined,
      customerNumberOfOrders: simOrders !== "" ? parseInt(simOrders, 10) : undefined,
      attributes: attributes.length ? attributes : undefined,
      hasSubscriptionItem: simHasSub || undefined,
    };
  }, [simSubtotal, simOrders, simAttributes, simHasSub]);

  const results = useMemo(() => {
    if (cartLines.length === 0) return [];
    return evaluateConfig(testConfig, cartLines, evalContext);
  }, [cartLines, testConfig, evalContext]);

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
    setCopyStatus("idle");
  }

  function removeCartLine(lineId: string) {
    setCartLines((currentLines) =>
      currentLines.filter((line) => line.id !== lineId),
    );
    setCopyStatus("idle");
  }

  function clearCart() {
    setCartLines([]);
    setLastFixtureId(null);
    setCopyStatus("idle");
  }

  function loadFixture(fixture: Fixture) {
    setCartLines(fixture.lines);
    setLastFixtureId(fixture.id);
    setSelectedItem(null);
    setCopyStatus("idle");
    if (fixture.context?.hasSubscription != null) setSimHasSub(fixture.context.hasSubscription);
    if (fixture.context?.customerOrders != null) setSimOrders(String(fixture.context.customerOrders));
    if (fixture.context?.subtotal != null) setSimSubtotal(String(fixture.context.subtotal));
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

    try {
      await navigator.clipboard.writeText(fixture);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("failed");
    }
  }

  return (
    <section className="simulator-workspace settings-card settings-card--full">
      <div className="simulator-workspace__header">
        <div>
          <p className="page-kicker">Testing workspace</p>
          <h2 className="page-title">Cart simulator</h2>
          <p className="page-subtitle">
            {activeRule
              ? `Testing only ${getRuleName(activeRule)}`
              : "Evaluate active promo rules against cart scenarios."}
          </p>
        </div>

        {activeRuleId && !activeRule && (
          <span className="status-badge status-badge--error">
            Rule not found
          </span>
        )}
      </div>

      <div className="simulator-metrics">
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

      <div className="simulator-workspace__grid">
        <div className="simulator-workspace__main">
          <section className="form-section form-section--subdued settings-card simulator-panel">
            <div className="card__header card__header--flush">
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

          <section className="resource-card settings-card simulator-panel simulator-panel--grow">
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
                  {copyStatus === "copied"
                    ? "Copied"
                    : copyStatus === "failed"
                      ? "Copy failed"
                      : "Copy JSON"}
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
        </div>

        <aside className="simulator-workspace__side">
          <section className="card settings-card simulator-panel">
            <div className="card__header">
              <div>
                <h3 className="card__title">Fixtures</h3>
                <p className="card__subtitle">
                  Load preset cart scenarios for the active rules.
                </p>
              </div>
            </div>

            <div className="card__body">
              <div className="fixture-grid">
                {fixtures.length === 0 && (
                  <p className="cell-muted">
                    No fixtures available for the active rule types.
                  </p>
                )}
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
                      <span className="cell-muted cell-block">
                        {fixture.description}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section className="card settings-card simulator-panel">
            <div className="card__header">
              <div>
                <h3 className="card__title">Context</h3>
                <p className="card__subtitle">
                  Simulate cart conditions for rule evaluation.
                </p>
              </div>
            </div>

            <div className="card__body">
              <div className="form-group">
                <label className="form-label" htmlFor="sim-subtotal">
                  Cart subtotal ($)
                </label>
                <input
                  id="sim-subtotal"
                  type="number"
                  min={0}
                  step={0.01}
                  value={simSubtotal}
                  onChange={(e) => setSimSubtotal(e.target.value)}
                  className="number-field"
                  placeholder="e.g. 75.00"
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="sim-orders">
                  Customer past orders
                </label>
                <input
                  id="sim-orders"
                  type="number"
                  min={0}
                  value={simOrders}
                  onChange={(e) => setSimOrders(e.target.value)}
                  className="number-field"
                  placeholder="e.g. 3 (blank = guest)"
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="sim-attrs">
                  Cart attributes
                </label>
                <input
                  id="sim-attrs"
                  type="text"
                  value={simAttributes}
                  onChange={(e) => setSimAttributes(e.target.value)}
                  placeholder="source=landing-page-x"
                />
                <p className="field-hint">Comma-separated key=value pairs</p>
              </div>

              <div className="form-group">
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={simHasSub}
                    onChange={(e) => setSimHasSub(e.target.checked)}
                  />
                  <span>Has subscription item in cart</span>
                </label>
              </div>
            </div>
          </section>

          <section className="card settings-card simulator-panel">
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
        </aside>
      </div>

      {cartLines.length > 0 && results.length > 0 && (
        <section className="alert alert--success settings-card settings-card--full simulator-results">
          <h3 className="form-section__title form-section__title--spaced">
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
        <section className="alert alert--critical settings-card settings-card--full simulator-results">
          <p className="alert__title">No discounts applied</p>
          <p className="alert__body">
            The current cart configuration does not trigger the evaluated rules.
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
    </section>
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
  return rule.id;
}

function formatDiscountAction(action: DiscountAction) {
  return action.percentageOff === 100
    ? "Free item"
    : `${action.percentageOff}% off`;
}
