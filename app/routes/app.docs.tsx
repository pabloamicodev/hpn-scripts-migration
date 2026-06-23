export default function DocsPage() {
  return (
    <div className="app-page app-page--wide">
      <header className="page-header">
        <div>
          <h1 className="page-title">How your discount rules work</h1>
          <p className="page-subtitle">
            Each rule fires automatically at checkout — no coupons, no manual effort.
            Pick the one that matches what you want customers to experience.
          </p>
        </div>
      </header>

      <nav className="docs-nav" aria-label="Jump to rule type">
        <a href="#pa7" className="docs-nav-chip docs-nav-chip--pa7">🤝 Cross-sell</a>
        <a href="#planta" className="docs-nav-chip docs-nav-chip--planta">🎁 Free samples</a>
        <a href="#pouches" className="docs-nav-chip docs-nav-chip--pouches">📦 Bundle unlock</a>
        <a href="#landing" className="docs-nav-chip docs-nav-chip--landing">🎯 Landing page offer</a>
        <a href="#loyalty" className="docs-nav-chip docs-nav-chip--loyalty">⭐ Loyalty rewards</a>
      </nav>

      {/* ── Rule types ─────────────────────────────────────────────────── */}

      <section className="form-section settings-card">
        <h2 className="form-section__title">Rule types</h2>

        <RuleCard
          id="pa7"
          variant="pa7"
          icon="🤝"
          name="Reward buying your hero product"
          pitch="Cross-sell with a flat percentage off"
          description="When a key product is in the cart, a complementary product gets a discount — but only if that product is present at the exact quantity you choose. Works best for cross-sells where the deal only makes sense for a single unit."
          needs={[
            "Trigger product",
            "Target products",
            "Exact target quantity (e.g. 1)",
            "Discount %",
          ]}
          example="A customer adds PA7® Mediator mTOR Elevation. If they also have exactly 1 unit of C2 Pürest Creatine™, the creatine gets 10% off — automatically."
        />

        <RuleCard
          id="planta"
          variant="planta"
          icon="🎁"
          name="Include samples when the full set is there"
          pitch="All required variants in cart → selected variants become free"
          description="You define a required set of product variants that must all be in the cart together. Once the full set is there, other variants you specify drop to your chosen price — or all the way to zero. Great for sample packs and bundles where the giveaway is part of the offer."
          needs={[
            "Required variants (every one must be in cart)",
            "Variants to discount",
            "How many units per line",
            "Discount % — set 100 to make them fully free",
          ]}
          example="NAD3 Single, Planta PB Sample, and Planta Cacao Sample are all in the cart — both Planta samples drop to $0. Any one missing, and nothing fires."
        />

        <RuleCard
          id="pouches"
          variant="pouches"
          icon="📦"
          name="Unlock free add-ons with a complete bundle"
          pitch="Specific product + required variants = free extras"
          description="Similar to the samples rule, but the trigger is a product rather than a variant. A specific product and a set of variants must all be in the cart before the free items unlock. Use this when the giveaway only makes sense alongside a particular product line."
          needs={[
            "Trigger product",
            "Required variants (every one must be in cart)",
            "Variants to give free",
            "How many units per line",
          ]}
          example="NAD3 240, S9 1-Week Pouch, and N4 1-Week Pouch all in the cart — both pouches become free, one unit each."
        />

        <RuleCard
          id="landing"
          variant="landing"
          icon="🎯"
          name="One hero product unlocks multiple different offers"
          pitch="Each target product gets its own discount percentage"
          description="When a main product lands in the cart, other products you've added each get their own discount — and every target can be a different rate. Built for landing page campaigns where you're bundling several items with a headline product."
          needs={[
            "Trigger product",
            "Target products, each with its own %",
          ]}
          example="Main supplement in the cart → Gift A drops to free, Gift B goes 50% off, Gift C goes 30% off. Each target tracks its own percentage."
        />

        <RuleCard
          id="loyalty"
          variant="loyalty"
          icon="⭐"
          name="The more they've ordered, the better the deal"
          pitch="Tiered rewards based on a customer's order history"
          description="Returning customers automatically see bigger discounts based on how many times they've bought from you — no code, no coupons. You set the tiers: each one has a minimum order count and a discount percentage. The highest tier they qualify for is what they get. Guests who aren't logged in are quietly skipped."
          needs={[
            "Target products",
            "Tiers — minimum order count + discount % for each",
          ]}
          example="On their 7th order, a customer automatically gets 15% off (your '5+ orders' tier). A first-time visitor sees nothing. A 12-order customer gets your top tier: 25% off."
        />
      </section>

      {/* ── Conditions ─────────────────────────────────────────────────── */}

      <section className="form-section settings-card">
        <h2 className="form-section__title">Limit when a rule applies</h2>
        <p className="docs-section-intro">
          Every rule can have optional restrictions added to it. All of them must pass for
          the discount to fire. Leave them blank to apply the rule to everyone.
        </p>

        <div className="docs-cond-grid">
          <div className="docs-cond-card">
            <span className="docs-cond-icon">💰</span>
            <h3 className="docs-cond-name">Minimum cart total</h3>
            <p className="docs-cond-desc">
              Only apply the discount when the cart total is at or above a dollar amount you set.
              Good for "spend $X to unlock" promotions.
            </p>
          </div>

          <div className="docs-cond-card">
            <span className="docs-cond-icon">🔖</span>
            <h3 className="docs-cond-name">Landing page source</h3>
            <p className="docs-cond-desc">
              Only apply to customers who arrived through a specific landing page.
              The page sets a hidden tag on the cart — this condition checks for it.
            </p>
          </div>

          <div className="docs-cond-card">
            <span className="docs-cond-icon">🔁</span>
            <h3 className="docs-cond-name">Subscription in cart</h3>
            <p className="docs-cond-desc">
              Only fire when at least one item in the cart is a subscription.
              Perfect for "subscribe and save" offers that don't apply to one-time purchases.
            </p>
          </div>
        </div>
      </section>

      {/* ── Landing page integration ────────────────────────────────────── */}

      <section className="form-section settings-card">
        <h2 className="form-section__title">Targeting landing page visitors</h2>
        <p className="docs-section-intro">
          You can limit any rule to customers who clicked through a specific landing page.
          Here's how the three pieces connect.
        </p>

        <ol className="docs-steps">
          <li className="docs-step">
            <div className="docs-step-body">
              <h3>Your landing page tags the cart</h3>
              <p>
                When a customer adds a product from a campaign landing page, the page quietly
                adds a label to their cart — for example, <code>source: supplement-launch</code>.
                This is a one-time setup per landing page, done by your developer or theme.
              </p>
            </div>
          </li>
          <li className="docs-step">
            <div className="docs-step-body">
              <h3>You add the condition to a rule</h3>
              <p>
                In this app, open any rule and scroll to "Additional conditions."
                Enter the label key (<code>source</code>) and the value (<code>supplement-launch</code>)
                to match that audience exactly.
              </p>
            </div>
          </li>
          <li className="docs-step">
            <div className="docs-step-body">
              <h3>Only that audience gets the discount</h3>
              <p>
                At checkout, the discount function reads the cart label.
                Carts from your landing page get the deal — everyone else checks out at full price.
              </p>
            </div>
          </li>
        </ol>
      </section>

      {/* ── Notes ─────────────────────────────────────────────────────── */}

      <section className="form-section settings-card">
        <h2 className="form-section__title">Good to know before you start</h2>

        <ul className="docs-notes">
          <li>
            <span className="docs-note-icon">📅</span>
            <span>
              <strong>Dates aren't automatic.</strong>{" "}
              Rules don't know what day it is. For a limited-time promotion,
              enable the rule when it starts and disable it when it ends.
            </span>
          </li>
          <li>
            <span className="docs-note-icon">🛒</span>
            <span>
              <strong>Products won't appear in the cart on their own.</strong>{" "}
              Discounts only apply to items already there — the system can't add products for the customer.
              They still need to add everything themselves.
            </span>
          </li>
          <li>
            <span className="docs-note-icon">📦</span>
            <span>
              <strong>Stock levels aren't checked.</strong>{" "}
              A rule doesn't know if something is out of stock — it applies the discount regardless.
              Watch your inventory on any rule that makes items free.
            </span>
          </li>
          <li>
            <span className="docs-note-icon">🔐</span>
            <span>
              <strong>Loyalty rules need a logged-in customer.</strong>{" "}
              Guest shoppers have no order history, so loyalty tier rules are silently skipped for them.
            </span>
          </li>
          <li>
            <span className="docs-note-icon">🏆</span>
            <span>
              <strong>If two rules target the same product, the better discount wins.</strong>{" "}
              The customer always gets the higher percentage — never both at once, never the lower one.
            </span>
          </li>
        </ul>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// RuleCard
// ---------------------------------------------------------------------------

function RuleCard({
  id,
  variant,
  icon,
  name,
  pitch,
  description,
  needs,
  example,
}: {
  id: string;
  variant: "pa7" | "planta" | "pouches" | "landing" | "loyalty";
  icon: string;
  name: string;
  pitch: string;
  description: string;
  needs: string[];
  example: string;
}) {
  return (
    <div className={`docs-rule docs-rule--${variant}`} id={id}>
      <div className="docs-rule-top">
        <div className="docs-rule-icon" aria-hidden="true">{icon}</div>
        <div>
          <h3 className="docs-rule-name">{name}</h3>
          <p className="docs-rule-pitch">{pitch}</p>
        </div>
      </div>

      <p className="docs-rule-desc">{description}</p>

      <div className="docs-rule-needs">
        <span className="docs-needs-label">You'll configure:</span>
        {needs.map((need) => (
          <span key={need} className="docs-need-chip">{need}</span>
        ))}
      </div>

      <div className="docs-rule-example">
        <p className="docs-example-eyebrow">In practice</p>
        <p className="docs-example-text">{example}</p>
      </div>
    </div>
  );
}
