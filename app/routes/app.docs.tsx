export default function DocsPage() {
  return (
    <div className="app-page app-page--wide">
      <header className="page-header">
        <div>
          <h1 className="page-title">Rule Types & Configuration</h1>
          <p className="page-subtitle">
            Reference guide for every discount rule type and condition available
            in this app.
          </p>
        </div>
      </header>

      {/* ------------------------------------------------------------------ */}
      {/* Rule types                                                          */}
      {/* ------------------------------------------------------------------ */}

      <section className="form-section settings-card">
        <h2 className="form-section__title">Rule Types</h2>

        <DocsCard
          id="pa7_cross_sell"
          title="Trigger Product → Same % off targets"
          type="pa7_cross_sell"
          description="When a trigger product is in the cart and a target product is present with exactly the configured quantity, applies a flat discount percentage to that target line."
          fields={[
            { name: "triggerProductId", type: "Product GID", desc: "Product that must be in cart to activate the discount." },
            { name: "targetProductIds", type: "Product GID[]", desc: "Products that receive the discount when the trigger is present." },
            { name: "targetLineQuantityEquals", type: "integer ≥ 1", desc: "The target line must have exactly this quantity. Lines with a different quantity are ignored." },
            { name: "discountPercentage", type: "number 1–100", desc: "Percentage discount applied to all matching target lines." },
            { name: "message", type: "string", desc: "Customer-facing message shown at checkout." },
          ]}
          example="PA7 in cart + C2 qty 1 → 10% off C2."
        />

        <DocsCard
          id="required_variants_free_variants"
          title="Required Variants → Discounted Variants"
          type="required_variants_free_variants"
          description="All required variants must be present in the cart. When they are, applies a discount to each configured free variant line. Useful for subscription sample bundles."
          fields={[
            { name: "requiredVariantIds", type: "Variant GID[]", desc: "ALL of these variants must be in the cart for the rule to fire." },
            { name: "freeVariantIds", type: "Variant GID[]", desc: "Variants that receive the discount when all required variants are present." },
            { name: "freeQuantityPerLine", type: "integer ≥ 1", desc: "How many units per free variant line are discounted." },
            { name: "discountPercentage", type: "number 1–100", desc: "Percentage discount on each free variant (100 = free)." },
            { name: "message", type: "string", desc: "Customer-facing message shown at checkout." },
          ]}
          example="NAD3 Single + Planta PB sample + Planta Cacao sample in cart → both Planta samples become free."
        />

        <DocsCard
          id="required_product_with_free_variants"
          title="Required Product + Variants → Discounted Variants"
          type="required_product_with_free_variants"
          description="A trigger product AND all required variants must be in the cart. When both conditions are met, applies a discount to each free variant line with an optional quantity cap."
          fields={[
            { name: "triggerProductId", type: "Product GID", desc: "Product that must be in cart alongside the required variants." },
            { name: "requiredVariantIds", type: "Variant GID[]", desc: "ALL of these variants must also be in the cart." },
            { name: "freeVariantIds", type: "Variant GID[]", desc: "Variants that receive the discount." },
            { name: "freeQuantityPerLine", type: "integer ≥ 1", desc: "Maximum units discounted per free variant line." },
            { name: "discountPercentage", type: "number 1–100", desc: "Percentage discount on each free variant (100 = free)." },
            { name: "message", type: "string", desc: "Customer-facing message shown at checkout." },
          ]}
          example="NAD3 240 + S9 pouch + N4 pouch in cart → 1 unit of each pouch becomes free."
        />

        <DocsCard
          id="trigger_product_discounted_targets"
          title="Trigger Product → Discounted Targets (per-product %)"
          type="trigger_product_discounted_targets"
          description="When the trigger product is in the cart, applies an individual discount percentage to each configured target product. Each target can have a different discount. Ideal for landing page bundles."
          fields={[
            { name: "triggerProductId", type: "Product GID", desc: "Product that activates the discount for all targets." },
            { name: "targets", type: "Array<{ productId, discountPercentage }>", desc: "List of target products, each with its own discount percentage." },
            { name: "message", type: "string", desc: "Customer-facing message shown at checkout (shared by all targets)." },
          ]}
          example="Main product in cart → Gift A at 100% off, Gift B at 50% off, Gift C at 30% off."
        />

        <DocsCard
          id="loyalty_tier"
          title="Loyalty Tier — discount by customer order count"
          type="loyalty_tier"
          description="Applies tiered discounts to target products based on how many past orders the logged-in customer has. The highest matching tier wins. Guests are skipped silently."
          fields={[
            { name: "targetProductIds", type: "Product GID[]", desc: "Products that receive the loyalty discount." },
            { name: "tiers", type: "Array<{ minOrders, discountPercentage }>", desc: "Tiers sorted by minOrders descending at runtime. The first tier where customer.numberOfOrders ≥ minOrders is applied." },
            { name: "message", type: "string", desc: "Customer-facing message shown at checkout." },
          ]}
          example="0 orders → no discount. 1+ orders → 5% off. 5+ orders → 15% off. 10+ orders → 25% off."
        />
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Global conditions                                                   */}
      {/* ------------------------------------------------------------------ */}

      <section className="form-section settings-card">
        <h2 className="form-section__title">Global Conditions</h2>
        <p className="page-subtitle">
          Every rule type supports these optional conditions. If any condition
          fails, the rule is skipped entirely for that checkout.
        </p>

        <table className="docs-table">
          <thead>
            <tr>
              <th>Field</th>
              <th>Type</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><code>minimumCartSubtotal</code></td>
              <td>number (dollars)</td>
              <td>Rule is skipped if the cart subtotal is below this amount.</td>
            </tr>
            <tr>
              <td><code>requiredCartAttributeKey</code></td>
              <td>string</td>
              <td>
                Rule fires only if the cart has an attribute with this key.
                Combine with <code>requiredCartAttributeValue</code> to also
                match the value.
              </td>
            </tr>
            <tr>
              <td><code>requiredCartAttributeValue</code></td>
              <td>string (optional)</td>
              <td>
                If set, the cart attribute value must exactly match this string.
              </td>
            </tr>
            <tr>
              <td><code>requiresSubscriptionInCart</code></td>
              <td>boolean</td>
              <td>
                Rule fires only if at least one cart line has a selling plan
                (subscription).
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Landing page integration                                            */}
      {/* ------------------------------------------------------------------ */}

      <section className="form-section settings-card">
        <h2 className="form-section__title">Landing Page Integration</h2>
        <p className="page-subtitle">
          Use cart attributes to trigger rules only when a customer arrives
          through a specific landing page.
        </p>

        <ol className="docs-steps">
          <li>
            <strong>On your landing page</strong>, after the customer adds the
            main product, call the Storefront API to set a cart attribute:
            <pre className="alert__pre">{`const mutation = \`
  mutation cartAttributesUpdate($cartId: ID!, $attributes: [AttributeInput!]!) {
    cartAttributesUpdate(cartId: $cartId, attributes: $attributes) {
      cart { id }
    }
  }
\`;

fetch('/api/2024-01/graphql.json', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-Shopify-Storefront-Access-Token': TOKEN },
  body: JSON.stringify({
    query: mutation,
    variables: {
      cartId: cart.id,
      attributes: [{ key: 'source', value: 'landing-page-supplement-x' }]
    }
  })
});`}</pre>
          </li>
          <li>
            <strong>In this app</strong>, create any rule and set the Additional
            Conditions:
            <ul>
              <li>Required cart attribute key: <code>source</code></li>
              <li>Required cart attribute value: <code>landing-page-supplement-x</code></li>
            </ul>
          </li>
          <li>
            <strong>At checkout</strong>, Shopify calls the discount function.
            The function checks the cart attribute and only applies the discount
            to carts that came through that landing page.
          </li>
        </ol>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Limitations                                                         */}
      {/* ------------------------------------------------------------------ */}

      <section className="form-section settings-card">
        <h2 className="form-section__title">Limitations</h2>

        <ul className="docs-steps">
          <li>
            <strong>No time-based discounts inside the function.</strong> The
            function has no access to the current time. Implement date windows
            by enabling/disabling rules from this app.
          </li>
          <li>
            <strong>Cannot add products to the cart.</strong> Discount functions
            only apply discounts to existing cart lines. Auto-adding products
            requires a Cart Transform function or storefront JavaScript.
          </li>
          <li>
            <strong>No inventory access.</strong> The function cannot check
            stock levels.
          </li>
          <li>
            <strong>Loyalty tier requires login.</strong> Guest customers
            have no order history — loyalty_tier rules are silently skipped
            for guests.
          </li>
          <li>
            <strong>One discount per cart line.</strong> If multiple rules
            target the same line, the function applies only the highest
            percentage (selection strategy: ALL picks the best candidate per
            line).
          </li>
        </ul>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface FieldDoc {
  name: string;
  type: string;
  desc: string;
}

function DocsCard({
  id,
  title,
  type,
  description,
  fields,
  example,
}: {
  id: string;
  title: string;
  type: string;
  description: string;
  fields: FieldDoc[];
  example: string;
}) {
  return (
    <div className="docs-rule-card" id={id}>
      <div className="docs-rule-card__header">
        <div>
          <h3 className="docs-rule-card__title">{title}</h3>
          <code className="docs-rule-card__type">{type}</code>
        </div>
      </div>

      <p className="docs-rule-card__desc">{description}</p>

      <table className="docs-table">
        <thead>
          <tr>
            <th>Field</th>
            <th>Type</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          {fields.map((f) => (
            <tr key={f.name}>
              <td><code>{f.name}</code></td>
              <td className="cell-muted">{f.type}</td>
              <td>{f.desc}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="docs-rule-card__example">
        <strong>Example: </strong>{example}
      </p>
    </div>
  );
}
