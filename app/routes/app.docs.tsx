import { useState, useEffect, type ReactNode } from "react";
import {
  ArrowLeftRight,
  Gift,
  Package,
  Crosshair,
  TrendingUp,
  ShoppingCart,
  MapPin,
  RefreshCw,
  Calendar,
  UserX,
  Shield,
  Boxes,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Jump nav with scroll-spy
// ---------------------------------------------------------------------------

const NAV_ITEMS = [
  { id: "rule-pa7", label: "Cross-sell" },
  { id: "rule-planta", label: "Free samples" },
  { id: "rule-pouches", label: "Bundle unlock" },
  { id: "rule-landing", label: "Landing page offer" },
  { id: "rule-loyalty", label: "Loyalty rewards" },
];

function DocsNav() {
  const [active, setActive] = useState("rule-pa7");

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) setActive(e.target.id);
        });
      },
      { rootMargin: "-15% 0px -75% 0px" },
    );

    NAV_ITEMS.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, []);

  return (
    <nav className="docs-tabs" aria-label="Jump to rule type">
      {NAV_ITEMS.map(({ id, label }) => (
        <a
          key={id}
          href={`#${id}`}
          className={active === id ? "docs-tab is-active" : "docs-tab"}
        >
          {label}
        </a>
      ))}
    </nav>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function DocsPage() {
  return (
    <div className="app-page app-page--wide">
      <header className="page-header">
        <div>
          <h1 className="page-title">How your discount rules work</h1>
          <p className="page-subtitle">
            Rules fire automatically at checkout — no coupons, no manual work.
            Pick the type that fits what you want customers to experience.
          </p>
        </div>
      </header>

      {/* ── Rule types ─────────────────────────────────────── */}
      <section className="form-section settings-card docs-section">
        <DocsNav />

        <h2 className="form-section__title">Rule types</h2>

        <Rule
          id="rule-pa7"
          n={1}
          icon={<ArrowLeftRight size={15} aria-hidden="true" />}
          name="Reward buying your hero product"
          typeName="pa7_cross_sell"
          description="When a trigger product is in the cart, a complementary product gets a flat percentage off — but only if it's present at the exact quantity you specify. Useful when the cross-sell only makes sense for a single unit."
          config={[
            "Trigger product — the item that activates everything",
            "Target products — what gets discounted",
            "Exact quantity the target must have (e.g. exactly 1 unit)",
            "Discount percentage",
          ]}
          example="PA7® Mediator mTOR Elevation is in the cart. C2 Pürest Creatine™ is also there at exactly 1 unit — it gets 10% off, automatically."
        />

        <Rule
          id="rule-planta"
          n={2}
          icon={<Gift size={15} aria-hidden="true" />}
          name="Include samples when the full set is there"
          typeName="required_variants_free_variants"
          description="You define a required set of product variants that must all be in the cart at the same time. Once the full set is there, the variants you specify drop to a price you choose — including zero. Great for sample packs where the giveaway is part of the offer."
          config={[
            "Required variants — every single one must be in the cart",
            "Free variants — what gets discounted when conditions are met",
            "How many units per line to discount",
            "Discount percentage (100 = fully free)",
          ]}
          example="NAD3 Single, Planta PB Sample, and Planta Cacao Sample are all in the cart together — both Planta samples drop to $0. Remove any one of them and the discount doesn't fire."
        />

        <Rule
          id="rule-pouches"
          n={3}
          icon={<Package size={15} aria-hidden="true" />}
          name="Unlock free add-ons with a complete bundle"
          typeName="required_product_with_free_variants"
          description="Similar to the samples rule, but the trigger is a product rather than a variant. A specific product and a set of variants must all be in the cart together before the free items unlock. Use this when the add-on only makes sense alongside a particular product line."
          config={[
            "Trigger product — activates the rule",
            "Required variants — all of these must also be in the cart",
            "Free variants — what becomes free once conditions are met",
            "Maximum units per line to discount",
          ]}
          example="NAD3 240, S9 1-Week Pouch, and N4 1-Week Pouch all added to the cart — both pouches become free, one unit each."
        />

        <Rule
          id="rule-landing"
          n={4}
          icon={<Crosshair size={15} aria-hidden="true" />}
          name="One hero product, multiple different offers"
          typeName="trigger_product_discounted_targets"
          description="When a main product lands in the cart, every target product you've added gets its own discount — and each can be a different percentage. Built for landing page campaigns where you're bundling several products around a headline item."
          config={[
            "Trigger product — the main item customers are buying",
            "Target products — one or more, each with its own discount %",
          ]}
          example="Main supplement lands in the cart. Gift A drops to free (100% off). Gift B goes 50% off. Gift C goes 30% off. Each tracks independently."
        />

        <Rule
          id="rule-loyalty"
          n={5}
          icon={<TrendingUp size={15} aria-hidden="true" />}
          name="The more they've ordered, the better the deal"
          typeName="loyalty_tier"
          description="Returning customers automatically see bigger discounts based on how many times they've ordered — no codes needed. You define the tiers. The highest one the customer qualifies for is what they get. Guests who aren't logged in are quietly skipped."
          config={[
            "Target products — what gets discounted",
            "Tiers — each one has a minimum order count and a discount %",
          ]}
          example="On their 7th order a customer automatically gets 15% off (your '5+ orders' tier). A first-time visitor sees nothing. A 12-order customer gets your top tier: 25% off."
        />
      </section>

      {/* ── Conditions ─────────────────────────────────────── */}
      <section className="form-section settings-card">
        <h2 className="form-section__title">Limit when a rule applies</h2>
        <p className="docs-lede">
          Any rule can have optional restrictions layered on top. All must pass
          for the discount to fire — fail one, and the rule is skipped for that
          cart. Leave them blank and the rule applies to everyone.
        </p>

        <dl className="docs-row-list">
          <CondRow icon={<ShoppingCart size={14} aria-hidden="true" />} label="Minimum cart total">
            Only fires when the cart total is at or above a dollar amount you
            set. Good for "spend $X to unlock" promotions.
          </CondRow>
          <CondRow icon={<MapPin size={14} aria-hidden="true" />} label="Landing page source">
            Only fires for customers who clicked through a specific landing
            page. The page sets a hidden label on the cart; this condition
            checks for it.
          </CondRow>
          <CondRow icon={<RefreshCw size={14} aria-hidden="true" />} label="Subscription in cart">
            Only fires when at least one item in the cart is a subscription.
            Perfect for "subscribe and save" offers that shouldn't apply to
            one-time purchases.
          </CondRow>
        </dl>
      </section>

      {/* ── Landing page setup ─────────────────────────────── */}
      <section className="form-section settings-card">
        <h2 className="form-section__title">Targeting landing page visitors</h2>
        <p className="docs-lede">
          Any rule can be restricted to customers who arrived through a
          specific landing page. Here's how the three pieces connect.
        </p>

        <ol className="docs-row-list docs-row-list--steps">
          <StepRow n={1} title="Your landing page tags the cart">
            When a customer adds a product from your campaign page, the page
            sets a hidden label on their cart — for example,{" "}
            <code>source: supplement-launch</code>. One-time setup per page,
            handled by your developer or theme.
          </StepRow>
          <StepRow n={2} title="You add the condition to a rule">
            Open any rule in this app, scroll to "Additional conditions," and
            enter the label key (<code>source</code>) and value (
            <code>supplement-launch</code>) to match exactly.
          </StepRow>
          <StepRow n={3} title="Only that audience gets the discount">
            At checkout, the discount reads the cart label. Carts from your
            landing page get the offer — everyone else pays full price.
          </StepRow>
        </ol>
      </section>

      {/* ── Notes ─────────────────────────────────────────── */}
      <section className="form-section settings-card">
        <h2 className="form-section__title">Good to know before you start</h2>

        <ul className="docs-row-list docs-row-list--notes">
          <NoteRow icon={<Calendar size={14} aria-hidden="true" />}>
            <strong>Rules don't know what day it is.</strong> For time-limited
            promotions, enable the rule when it starts and disable it when it
            ends.
          </NoteRow>
          <NoteRow icon={<Boxes size={14} aria-hidden="true" />}>
            <strong>
              Discounts apply to items already in the cart — not items you add
              for the customer.
            </strong>{" "}
            The customer still needs to add everything themselves.
          </NoteRow>
          <NoteRow icon={<Package size={14} aria-hidden="true" />}>
            <strong>Stock levels aren't checked.</strong> A rule applies the
            discount regardless of inventory. Watch stock levels on rules that
            make items free.
          </NoteRow>
          <NoteRow icon={<UserX size={14} aria-hidden="true" />}>
            <strong>Loyalty rules require a logged-in customer.</strong> Guests
            have no order history — loyalty tier rules are silently skipped for
            them.
          </NoteRow>
          <NoteRow icon={<Shield size={14} aria-hidden="true" />}>
            <strong>
              If two rules target the same product, the better discount wins.
            </strong>{" "}
            The customer always gets the higher percentage — never both applied
            at once.
          </NoteRow>
        </ul>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rule
// ---------------------------------------------------------------------------

function Rule({
  id,
  n,
  icon,
  name,
  typeName,
  description,
  config,
  example,
}: {
  id: string;
  n: number;
  icon: ReactNode;
  name: string;
  typeName: string;
  description: string;
  config: string[];
  example: string;
}) {
  return (
    <article className="docs-rule" id={id}>
      <span className="docs-rule-n" aria-hidden="true">
        {String(n).padStart(2, "0")}
      </span>

      <div className="docs-rule-body">
        <header className="docs-rule-header">
          <span className="docs-rule-icon">{icon}</span>
          <h3 className="docs-rule-name">{name}</h3>
          <code className="docs-rule-type">{typeName}</code>
        </header>

        <p className="docs-rule-desc">{description}</p>

        <div className="docs-rule-config">
          <p className="docs-config-label">You'll configure</p>
          <ul>
            {config.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>

        <div className="docs-rule-example">
          <p className="docs-example-label">In practice</p>
          <p>{example}</p>
        </div>
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------
// Condition row
// ---------------------------------------------------------------------------

function CondRow({
  icon,
  label,
  children,
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="docs-row">
      <span className="docs-row-icon">{icon}</span>
      <div>
        <dt className="docs-row-label">{label}</dt>
        <dd className="docs-row-body">{children}</dd>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step row
// ---------------------------------------------------------------------------

function StepRow({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: ReactNode;
}) {
  return (
    <li className="docs-row">
      <span className="docs-row-n" aria-hidden="true">{n}</span>
      <div>
        <p className="docs-row-label">{title}</p>
        <p className="docs-row-body">{children}</p>
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Note row
// ---------------------------------------------------------------------------

function NoteRow({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <li className="docs-row">
      <span className="docs-row-icon">{icon}</span>
      <p className="docs-row-body">{children}</p>
    </li>
  );
}
