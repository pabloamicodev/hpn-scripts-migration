# HPN Scripts Migration App — DeepSeek V4 Pro Prompt & Technical Guide

**Project:** `hpn-scripts-migration`  
**Goal:** migrate HPN legacy Shopify Scripts discounts into a separate internal Shopify app powered by Shopify Discount Functions.  
**Assistant model:** DeepSeek V4 Pro  
**Architecture:** Shopify React Router app + Rust Discount Function + mini dashboard + Admin GraphQL tooling.

---

## 1. Mission

Build a dedicated internal Shopify app that replaces the current HPN legacy Shopify Scripts discount logic with a Shopify Discount Function.

This project is **not** the BOGOS clone. It is a smaller, focused migration app for existing legacy Scripts discounts.

The app must allow internal users to:

- Create the HPN automatic app discount.
- Update the discount JSON configuration.
- Pause/resume individual promo rules.
- Pause/resume the global automatic app discount.
- Delete the automatic app discount.
- Edit product/variant IDs.
- Validate the configuration before saving.
- Test rules with a cart simulator.
- Optionally run authenticated Admin GraphQL queries through a protected internal GraphQL console.

Important architecture rule:

```txt
GraphQL administers discounts.
Rust Discount Function executes discounts.
The dashboard edits configuration.
Shopify checkout/cart calculation remains authoritative.
```

The dashboard does **not** dynamically create Rust Functions. The Rust Function is deployed as a Shopify app extension. The dashboard creates and manages automatic app discount instances and their JSON config.

---

## 2. Current HPN legacy Script rules

### 2.1 PA7 Cross-Sell Discount

Numeric IDs:

```txt
PA7_PRODUCT_ID = 1313973239892
C2_PRODUCT_ID  = 1319321763924
T5_PRODUCT_ID  = 1313557741652
```

GIDs:

```txt
PA7_PRODUCT_ID = gid://shopify/Product/1313973239892
C2_PRODUCT_ID  = gid://shopify/Product/1319321763924
T5_PRODUCT_ID  = gid://shopify/Product/1313557741652
```

Rule:

```txt
When PA7 is in the cart,
C2 or T5 gets 10% off,
but only when the C2/T5 line item quantity is exactly 1.
```

Message:

```txt
Congratulations! 10% Off (when purchased with PA7)
```

Acceptance cases:

- PA7 + C2 quantity 1 -> C2 gets 10% off.
- PA7 + T5 quantity 1 -> T5 gets 10% off.
- PA7 + C2 quantity 2 -> no discount for that C2 line.
- PA7 + C2 quantity 1 + T5 quantity 1 -> both target lines get 10% off.
- C2/T5 without PA7 -> no discount.
- Multiple separate C2/T5 lines with quantity 1 should be evaluated independently.

---

### 2.2 NAD3 Single + Planta Samples Bundle

Numeric IDs:

```txt
NAD3_SINGLE_VARIANT_ID     = 21174522675284
PLANTA_SAMPLE_VARIANT_ID_1 = 40608348438665
PLANTA_SAMPLE_VARIANT_ID_2 = 40608348373129
```

GIDs:

```txt
NAD3_SINGLE_VARIANT_ID     = gid://shopify/ProductVariant/21174522675284
PLANTA_SAMPLE_VARIANT_ID_1 = gid://shopify/ProductVariant/40608348438665
PLANTA_SAMPLE_VARIANT_ID_2 = gid://shopify/ProductVariant/40608348373129
```

Rule:

```txt
When all 3 are present:
- NAD3 Single
- Planta PB Sample
- Planta Cacao Sample

Both Planta samples become free.
```

Message:

```txt
Free Planta Samples - NAD3 Subscription
```

Acceptance cases:

- NAD3 Single only -> no discount.
- NAD3 Single + one Planta sample -> no discount.
- Both Planta samples without NAD3 Single -> no discount.
- NAD3 Single + both Planta samples -> both Planta samples free.
- For MVP, all quantity on Planta sample target lines can be discounted unless the existing Script proves it only discounts 1 unit.

---

### 2.3 NAD3 240 + S9/N4 1-Week Pouches Bundle

Numeric IDs:

```txt
NAD3_240_PRODUCT_ID     = 6784435060873
S9_1WK_POUCH_VARIANT_ID = 44633124995209
N4_1WK_POUCH_VARIANT_ID = 44633124864137
```

GIDs:

```txt
NAD3_240_PRODUCT_ID     = gid://shopify/Product/6784435060873
S9_1WK_POUCH_VARIANT_ID = gid://shopify/ProductVariant/44633124995209
N4_1WK_POUCH_VARIANT_ID = gid://shopify/ProductVariant/44633124864137
```

Rule:

```txt
When all 3 are present:
- NAD3 240 product
- S9 1-Week Pouch
- N4 1-Week Pouch

The pouch variants get discounted.
Only 1 unit is free per pouch line item, even if the customer has quantity 2+.
```

Message:

```txt
Free 1-Week Pouches - NAD3 240 Bundle
```

Acceptance cases:

- NAD3 240 only -> no discount.
- NAD3 240 + S9 only -> no discount.
- NAD3 240 + N4 only -> no discount.
- S9 + N4 without NAD3 240 -> no discount.
- NAD3 240 + S9 + N4 -> both pouches get free discount.
- S9 quantity 2 -> only 1 unit free.
- N4 quantity 3 -> only 1 unit free.
- NAD3 240 qualifies by product ID, so any variant of that product should trigger unless the legacy Script proves otherwise.

---

## 3. Recommended stack

### App

```txt
Shopify React Router app template
TypeScript
Node.js runtime
React Router loaders/actions
Shopify App Bridge
Polaris Web Components
Admin GraphQL API
```

Do **not** use:

```txt
@shopify/polaris
```

Use Polaris Web Components instead of deprecated Polaris React components.

### Discount execution

```txt
Rust Shopify Discount Function
Target: cart.lines.discounts.generate.run
Config source: automatic app discount metafield JSON
```

### UI and validation

```txt
zod
react-hook-form
@tanstack/react-table
@shopify/polaris-types
```

### GraphQL console

```txt
graphiql
graphql
```

The GraphQL console must call a server-side authenticated route. Never expose Shopify Admin API tokens to the browser.

### Testing

```txt
vitest
@playwright/test
```

### Persistence

MVP:

```txt
No database.
Use automatic app discount metafield JSON.
```

Optional later:

```txt
PostgreSQL + Prisma/Drizzle
```

Only add a DB if you need audit logs, config history, or reporting.

---

## 4. Dependency install

```bash
npm install zod react-hook-form @tanstack/react-table graphiql graphql date-fns @shopify/polaris-types
npm install -D vitest @playwright/test eslint prettier typescript
```

Do not install:

```bash
npm install @shopify/polaris
```

---

## 5. Shopify scopes

Start with:

```toml
scopes = "write_discounts,read_products"
```

Optional later:

```toml
scopes = "write_discounts,read_products,read_inventory,read_markets"
```

Do not request extra scopes until the app actually uses them.

---

## 6. Routes

Implement:

```txt
/app
/app/promos
/app/promos/new
/app/promos/:id
/app/promos/:id/test
/app/discount
/app/graphql
/app/settings
```

### `/app`

Home dashboard:

- Automatic app discount status.
- Active rules count.
- Paused rules count.
- Last config update.
- Quick actions.

### `/app/promos`

Promo rules table.

Columns:

```txt
Name
Type
Enabled
Trigger
Targets
Discount
Message
Actions
```

Actions:

```txt
Edit
Pause
Resume
Delete
Test
```

### `/app/promos/new`

Create promo rule.

### `/app/promos/:id`

Edit promo rule.

### `/app/promos/:id/test`

Cart simulator for the selected rule.

### `/app/discount`

Automatic app discount management:

- Create.
- Update.
- Activate.
- Deactivate.
- Delete.

### `/app/graphql`

Protected internal GraphQL console.

### `/app/settings`

Settings:

- Discount title.
- `startsAt`.
- Combination rules.
- Enable GraphQL console.
- Debug mode.

---

## 7. App navigation

Use App Bridge app nav so the menu appears nested under the app name in Shopify Admin.

```tsx
export function AppNav() {
  return (
    <s-app-nav>
      <s-link href="/app" rel="home">
        Home
      </s-link>
      <s-link href="/app/promos">Promos</s-link>
      <s-link href="/app/discount">Discount</s-link>
      <s-link href="/app/graphql">GraphQL</s-link>
      <s-link href="/app/settings">Settings</s-link>
    </s-app-nav>
  );
}
```

---

## 8. File structure

```txt
hpn-scripts-migration/
├── app/
│   ├── routes/
│   │   ├── app.tsx
│   │   ├── app._index.tsx
│   │   ├── app.promos.tsx
│   │   ├── app.promos.new.tsx
│   │   ├── app.promos.$id.tsx
│   │   ├── app.promos.$id.test.tsx
│   │   ├── app.discount.tsx
│   │   ├── app.graphql.tsx
│   │   └── app.settings.tsx
│   ├── components/
│   │   ├── AppNav.tsx
│   │   ├── PromoRulesTable.tsx
│   │   ├── PromoRuleForm.tsx
│   │   ├── ProductPicker.tsx
│   │   ├── VariantPicker.tsx
│   │   ├── GraphqlConsole.tsx
│   │   ├── CartSimulator.tsx
│   │   └── StatusBadge.tsx
│   ├── lib/
│   │   ├── hpnPromoConfig.server.ts
│   │   ├── hpnPromoDefaults.ts
│   │   ├── hpnPromoEvaluator.ts
│   │   ├── shopifyDiscounts.server.ts
│   │   ├── shopifyProducts.server.ts
│   │   ├── graphqlConsole.server.ts
│   │   ├── guards.server.ts
│   │   └── validations.ts
│   └── shopify.server.ts
├── extensions/
│   └── hpn-scripts-discounts/
│       ├── shopify.extension.toml
│       └── src/
│           ├── cart_lines_discounts_generate_run.graphql
│           ├── cart_lines_discounts_generate_run.rs
│           └── config.rs
├── tests/
│   ├── unit/
│   │   ├── hpnPromoEvaluator.test.ts
│   │   └── validations.test.ts
│   ├── function-fixtures/
│   │   ├── pa7-cross-sell.json
│   │   ├── planta-samples.json
│   │   └── nad3-240-pouches.json
│   └── e2e/
│       └── promos.spec.ts
├── shopify.app.toml
└── package.json
```

---

## 9. Config schema

Create `app/lib/validations.ts`.

```ts
import { z } from "zod";

const productGidSchema = z.string().startsWith("gid://shopify/Product/");
const variantGidSchema = z.string().startsWith("gid://shopify/ProductVariant/");

export const pa7CrossSellRuleSchema = z.object({
  id: z.literal("pa7-cross-sell"),
  type: z.literal("pa7_cross_sell"),
  enabled: z.boolean(),
  triggerProductId: productGidSchema,
  targetProductIds: z.array(productGidSchema).min(1),
  targetLineQuantityEquals: z.number().int().positive(),
  discountPercentage: z.number().positive().max(100),
  message: z.string().min(1),
});

export const requiredVariantsFreeVariantsRuleSchema = z.object({
  id: z.literal("nad3-single-planta-samples"),
  type: z.literal("required_variants_free_variants"),
  enabled: z.boolean(),
  requiredVariantIds: z.array(variantGidSchema).min(1),
  freeVariantIds: z.array(variantGidSchema).min(1),
  freeQuantityPerLine: z.number().int().positive().nullable(),
  message: z.string().min(1),
});

export const requiredProductWithFreeVariantsRuleSchema = z.object({
  id: z.literal("nad3-240-pouches"),
  type: z.literal("required_product_with_free_variants"),
  enabled: z.boolean(),
  triggerProductId: productGidSchema,
  requiredVariantIds: z.array(variantGidSchema).min(1),
  freeVariantIds: z.array(variantGidSchema).min(1),
  freeQuantityPerLine: z.literal(1),
  message: z.string().min(1),
});

export const hpnPromoRuleSchema = z.discriminatedUnion("type", [
  pa7CrossSellRuleSchema,
  requiredVariantsFreeVariantsRuleSchema,
  requiredProductWithFreeVariantsRuleSchema,
]);

export const hpnPromoConfigSchema = z.object({
  version: z.literal(1),
  rules: z.array(hpnPromoRuleSchema).min(1),
  combinesWith: z.object({
    orderDiscounts: z.boolean(),
    productDiscounts: z.boolean(),
    shippingDiscounts: z.boolean(),
  }),
});

export type HpnPromoConfig = z.infer<typeof hpnPromoConfigSchema>;
export type HpnPromoRule = z.infer<typeof hpnPromoRuleSchema>;
```

---

## 10. Default config

Create `app/lib/hpnPromoDefaults.ts`.

```ts
import type { HpnPromoConfig } from "./validations";

export const defaultHpnPromoConfig: HpnPromoConfig = {
  version: 1,
  rules: [
    {
      id: "pa7-cross-sell",
      type: "pa7_cross_sell",
      enabled: true,
      triggerProductId: "gid://shopify/Product/1313973239892",
      targetProductIds: [
        "gid://shopify/Product/1319321763924",
        "gid://shopify/Product/1313557741652",
      ],
      targetLineQuantityEquals: 1,
      discountPercentage: 10,
      message: "Congratulations! 10% Off (when purchased with PA7)",
    },
    {
      id: "nad3-single-planta-samples",
      type: "required_variants_free_variants",
      enabled: true,
      requiredVariantIds: [
        "gid://shopify/ProductVariant/21174522675284",
        "gid://shopify/ProductVariant/40608348438665",
        "gid://shopify/ProductVariant/40608348373129",
      ],
      freeVariantIds: [
        "gid://shopify/ProductVariant/40608348438665",
        "gid://shopify/ProductVariant/40608348373129",
      ],
      freeQuantityPerLine: null,
      message: "Free Planta Samples - NAD3 Subscription",
    },
    {
      id: "nad3-240-pouches",
      type: "required_product_with_free_variants",
      enabled: true,
      triggerProductId: "gid://shopify/Product/6784435060873",
      requiredVariantIds: [
        "gid://shopify/ProductVariant/44633124995209",
        "gid://shopify/ProductVariant/44633124864137",
      ],
      freeVariantIds: [
        "gid://shopify/ProductVariant/44633124995209",
        "gid://shopify/ProductVariant/44633124864137",
      ],
      freeQuantityPerLine: 1,
      message: "Free 1-Week Pouches - NAD3 240 Bundle",
    },
  ],
  combinesWith: {
    orderDiscounts: true,
    productDiscounts: true,
    shippingDiscounts: true,
  },
};
```

---

## 11. Discount metafield

Use this metafield on the automatic app discount:

```txt
namespace: hpn_scripts
key: function_configuration
type: json
```

---

## 12. Admin GraphQL operations

### Create automatic app discount

```graphql
mutation CreateHpnDiscount($automaticAppDiscount: DiscountAutomaticAppInput!) {
  discountAutomaticAppCreate(automaticAppDiscount: $automaticAppDiscount) {
    automaticAppDiscount {
      discountId
      title
      status
      startsAt
    }
    userErrors {
      field
      message
    }
  }
}
```

Variables shape:

```json
{
  "automaticAppDiscount": {
    "title": "HPN Scripts Migration Discounts",
    "functionId": "FUNCTION_ID_FROM_DEPLOY",
    "startsAt": "2026-06-04T00:00:00Z",
    "combinesWith": {
      "orderDiscounts": true,
      "productDiscounts": true,
      "shippingDiscounts": true
    },
    "metafields": [
      {
        "namespace": "hpn_scripts",
        "key": "function_configuration",
        "type": "json",
        "value": "{...CONFIG_JSON_STRING...}"
      }
    ]
  }
}
```

### Update automatic app discount

Use:

```txt
discountAutomaticAppUpdate
```

Update:

- title
- startsAt
- endsAt if needed
- combinesWith
- metafield config

### Activate/deactivate/delete

Use:

```txt
discountAutomaticActivate
discountAutomaticDeactivate
discountAutomaticDelete
```

### Search products

```graphql
query SearchProducts($query: String!) {
  products(first: 20, query: $query) {
    nodes {
      id
      title
      handle
      variants(first: 20) {
        nodes {
          id
          title
          sku
        }
      }
    }
  }
}
```

---

## 13. Rust Function input query

Create:

```txt
extensions/hpn-scripts-discounts/src/cart_lines_discounts_generate_run.graphql
```

Use:

```graphql
query CartLinesDiscountsGenerateRunInput {
  discount {
    metafield(namespace: "hpn_scripts", key: "function_configuration") {
      value
    }
  }
  cart {
    lines {
      id
      quantity
      merchandise {
        __typename
        ... on ProductVariant {
          id
          product {
            id
          }
        }
      }
    }
  }
}
```

---

## 14. Rust Function behavior

The function must:

- Read `discount.metafield.value`.
- Parse JSON into config structs.
- If missing config, return no discount operations.
- If invalid JSON, return no discount operations.
- Index cart lines by product ID and variant ID.
- Evaluate enabled rules only.
- Generate product discount operations.

### PA7 rule

```txt
hasTrigger = cart contains product PA7
for each cart line:
  if line product is C2 or T5
  and line quantity exactly 1
  apply 10% discount to that line
```

### Planta samples rule

```txt
hasAllRequiredVariants = cart contains NAD3 Single, Planta PB, Planta Cacao
if true:
  apply 100% discount to Planta PB line
  apply 100% discount to Planta Cacao line
```

If `freeQuantityPerLine` is null, discount all quantity.  
If not null, discount only that quantity.

### Pouches rule

```txt
hasTriggerProduct = cart contains NAD3 240 product
hasAllRequiredVariants = cart contains S9 and N4 variants
if true:
  apply 100% discount to S9 line, quantity 1
  apply 100% discount to N4 line, quantity 1
```

---

## 15. GraphQL console

Build an internal GraphQL console using `graphiql`.

Hard guards:

- Hidden unless `ENABLE_GRAPHQL_CONSOLE=true`.
- Server-side authenticated proxy only.
- Never expose Admin API token.
- All requests use `authenticate.admin(request)`.
- Mutations require explicit confirm checkbox.
- Log mutation names.
- Enforce timeout.
- Limit result size if possible.

Server route behavior:

```ts
const { admin } = await authenticate.admin(request);
const response = await admin.graphql(query, { variables });
```

---

## 16. Guards

### Global app guards

- [ ] All `/app/*` routes require Shopify embedded admin auth.
- [ ] No Admin API token exposed to browser.
- [ ] No GraphQL console in production unless explicitly enabled.
- [ ] No SQL executor in P0.
- [ ] No deprecated `@shopify/polaris`.
- [ ] No direct browser calls to Shopify Admin GraphQL.

### Config guards

- [ ] Validate config with Zod before saving.
- [ ] Validate product IDs exist before saving.
- [ ] Validate variant IDs exist before saving.
- [ ] Validate rule IDs are unique.
- [ ] Validate required arrays are not empty.
- [ ] Validate percentage between 1 and 100.
- [ ] Validate quantity caps are positive integers.
- [ ] Validate message is not empty.
- [ ] Preserve previous config before update.

### Function guards

- [ ] Missing config = no discounts.
- [ ] Invalid config JSON = no discounts.
- [ ] Non-product-variant lines are ignored.
- [ ] Disabled rules are ignored.
- [ ] PA7 rule applies only when target quantity exactly equals 1.
- [ ] Planta rule requires all required variants.
- [ ] Pouches rule requires NAD3 240 product plus both pouch variants.
- [ ] Pouches rule discounts only 1 unit per pouch line.
- [ ] Never discount unintended products.
- [ ] Never produce discount greater than 100%.

### Discount management guards

- [ ] Do not create duplicate active discounts with same title.
- [ ] If discount exists, update it instead of creating a duplicate.
- [ ] Delete requires confirmation.
- [ ] Deactivate requires confirmation.
- [ ] Store discount ID if using DB.
- [ ] If no DB, fetch/search existing discount by title.

---

## 17. Tests

### Unit tests

- [ ] Zod config validation.
- [ ] GID validation.
- [ ] TypeScript cart simulator PA7.
- [ ] TypeScript cart simulator Planta.
- [ ] TypeScript cart simulator Pouches.
- [ ] Duplicate rule validation.
- [ ] Product/variant picker parsing.

### Rust Function tests

Fixtures:

```txt
pa7-c2-qty-1.json
pa7-c2-qty-2.json
pa7-c2-t5-qty-1.json
planta-all-present.json
planta-missing-cacao.json
pouches-all-present.json
pouches-qty-2-and-3.json
```

Expected:

- PA7 + C2 qty 1 = discount.
- PA7 + C2 qty 2 = no discount.
- Planta all present = both free.
- Planta missing one sample = no discount.
- Pouches all present = both free.
- Pouches qty 2/3 = only 1 free per line.

### Playwright E2E

- [ ] App loads.
- [ ] Promo table renders.
- [ ] Edit rule.
- [ ] Pause/resume rule.
- [ ] Save config.
- [ ] GraphQL console hidden by default.
- [ ] GraphQL console visible when env enabled.
- [ ] Cart simulator returns expected result.

---

## 18. Execution plan

### P0.0 — Dev Dashboard and app scaffold

- [ ] Create app in Shopify Dev Dashboard.
- [ ] Scaffold Shopify React Router app.
- [ ] Install app on dev store.
- [ ] Confirm `/app` loads.
- [ ] Configure scopes: `write_discounts,read_products`.
- [ ] Add app nav.

### P0.1 — Generate Discount Function

- [ ] Generate discount extension.
- [ ] Select Rust.
- [ ] Configure target `cart.lines.discounts.generate.run`.
- [ ] Add input query.
- [ ] Implement no-op output.
- [ ] Deploy extension.
- [ ] Capture function ID.

### P0.2 — Implement Function logic

- [ ] Implement config structs.
- [ ] Implement JSON parsing.
- [ ] Implement PA7 rule.
- [ ] Implement Planta rule.
- [ ] Implement Pouches rule.
- [ ] Add function fixtures/tests.

### P0.3 — Create automatic app discount

- [ ] Create server helper for `discountAutomaticAppCreate`.
- [ ] Save initial config as JSON metafield.
- [ ] Create discount from `/app/discount`.
- [ ] Confirm discount appears in Shopify Admin.
- [ ] Test real cart/checkout.

### P1 — Dashboard config editing

- [ ] Promo table.
- [ ] Edit form.
- [ ] Pause/resume rule.
- [ ] Delete rule.
- [ ] Save via `discountAutomaticAppUpdate`.
- [ ] Validate with Zod.

### P2 — Cart simulator

- [ ] Build TypeScript evaluator.
- [ ] Add cart line editor.
- [ ] Show results and reasons.
- [ ] Export fixture.

### P3 — GraphQL console

- [ ] Add GraphiQL UI.
- [ ] Add authenticated server proxy.
- [ ] Add env guard.
- [ ] Add mutation confirmation.

### P4 — Production hardening

- [ ] Full regression tests.
- [ ] Compare against legacy Scripts behavior.
- [ ] Document any behavior difference.
- [ ] Activate Function.
- [ ] Disable legacy Script.
- [ ] Keep rollback path.

---

## 19. DeepSeek V4 Pro master prompt

Copy/paste this into DeepSeek V4 Pro at the start of the repo work.

```txt
You are a senior Shopify app architect, Rust Shopify Functions engineer, React Router developer, and technical product owner.

We are building a separate internal Shopify app named hpn-scripts-migration. This is not our BOGOS clone. This app exists only to migrate current HPN legacy Shopify Scripts discounts into Shopify Discount Functions.

Use this stack:
- Shopify React Router app template
- TypeScript
- Node.js runtime
- Shopify Admin GraphQL API
- Shopify App Bridge
- Polaris Web Components
- @shopify/polaris-types
- Rust Shopify Discount Function
- Target: cart.lines.discounts.generate.run
- Zod for validation
- React Hook Form if useful
- TanStack Table for promo tables
- GraphiQL + graphql for an internal dev-only Admin GraphQL console
- Vitest
- Playwright

Do not use deprecated @shopify/polaris React components.

Core architecture:
- The React Router app provides a mini embedded dashboard.
- The dashboard creates, updates, pauses, resumes, and deletes automatic app discounts.
- The dashboard saves function configuration as JSON in the automatic app discount metafield.
- The Rust Discount Function reads that JSON config from the input query.
- The Rust Function evaluates cart lines and returns product discount operations.
- GraphQL administers discounts; Rust Function executes discount logic.
- Never expose Shopify Admin API tokens to the browser.
- All Admin GraphQL requests must run server-side through authenticate.admin(request).

Initial Shopify scopes:
write_discounts,read_products

Metafield config:
namespace: hpn_scripts
key: function_configuration
type: json

Build routes:
- /app
- /app/promos
- /app/promos/new
- /app/promos/:id
- /app/promos/:id/test
- /app/discount
- /app/graphql
- /app/settings

Add App Bridge navigation using s-app-nav so the menu appears nested under the app name in Shopify Admin.

Implement these legacy Script rules exactly:

1. PA7 Cross-Sell Discount
IDs:
PA7_PRODUCT_ID = gid://shopify/Product/1313973239892
C2_PRODUCT_ID = gid://shopify/Product/1319321763924
T5_PRODUCT_ID = gid://shopify/Product/1313557741652

Rule:
When PA7 is in the cart, C2 or T5 gets 10% off, but only when the C2/T5 line item quantity is exactly 1.

Message:
Congratulations! 10% Off (when purchased with PA7)

2. NAD3 Single + Planta Samples Bundle
IDs:
NAD3_SINGLE_VARIANT_ID = gid://shopify/ProductVariant/21174522675284
PLANTA_SAMPLE_VARIANT_ID_1 = gid://shopify/ProductVariant/40608348438665
PLANTA_SAMPLE_VARIANT_ID_2 = gid://shopify/ProductVariant/40608348373129

Rule:
When NAD3 Single, Planta PB Sample, and Planta Cacao Sample are all present, both Planta samples become free.

Message:
Free Planta Samples - NAD3 Subscription

3. NAD3 240 + S9/N4 1-Week Pouches Bundle
IDs:
NAD3_240_PRODUCT_ID = gid://shopify/Product/6784435060873
S9_1WK_POUCH_VARIANT_ID = gid://shopify/ProductVariant/44633124995209
N4_1WK_POUCH_VARIANT_ID = gid://shopify/ProductVariant/44633124864137

Rule:
When NAD3 240, S9 pouch, and N4 pouch are all present, S9 and N4 pouches become free, but only 1 unit is free per pouch line item even if quantity is 2+.

Message:
Free 1-Week Pouches - NAD3 240 Bundle

Implementation requirements:
- Use GIDs, not numeric IDs, in config.
- Create a Zod schema for the config.
- Create default config with the three rules.
- Create server helpers for:
  - discountAutomaticAppCreate
  - discountAutomaticAppUpdate
  - discountAutomaticActivate
  - discountAutomaticDeactivate
  - discountAutomaticDelete
  - product/variant search
- Create a promo table.
- Create promo edit forms.
- Create pause/resume/delete actions.
- Create a cart simulator that mirrors the Function behavior in TypeScript.
- Create a dev-only GraphQL console using GraphiQL and a server-side authenticated proxy.
- Add guards so GraphQL console is hidden unless ENABLE_GRAPHQL_CONSOLE=true.
- Never call Shopify Admin GraphQL directly from the browser.
- Never expose access tokens.

Rust Function requirements:
- Input query must include discount metafield and cart lines.
- Parse the JSON config safely.
- Missing config returns no discounts.
- Invalid config returns no discounts.
- Ignore disabled rules.
- Ignore non-ProductVariant merchandise.
- Index cart lines by product ID and variant ID.
- PA7 rule applies 10% only when target line quantity equals exactly 1.
- Planta rule applies 100% to both Planta sample variants only when all required variants are present.
- Pouches rule applies 100% to S9/N4 pouches only when NAD3 240 product and both pouch variants are present.
- Pouches rule must set discounted quantity to 1 per pouch line.
- Never discount unintended lines.
- Never apply more than 100%.

Testing requirements:
- Unit tests for Zod validation.
- Unit tests for TypeScript cart simulator.
- Rust Function fixtures for each rule.
- Playwright E2E for dashboard flows.
- Test PA7 + C2 qty 1.
- Test PA7 + C2 qty 2.
- Test PA7 + C2 + T5 qty 1.
- Test Planta all-present.
- Test Planta missing one sample.
- Test Pouches all-present.
- Test Pouches quantity 2 and 3 where only 1 unit per pouch is discounted.

Work order:
1. Scaffold app.
2. Add app nav.
3. Generate Rust Discount Function.
4. Add input query.
5. Implement hardcoded/default config.
6. Implement Rust discount logic.
7. Add tests.
8. Add automatic app discount create route.
9. Add dashboard table.
10. Add edit/pause/resume/delete.
11. Add cart simulator.
12. Add GraphQL console.
13. Harden and document rollout.

Be strict, production-oriented, and concrete. Generate files, code, tests, and implementation steps. Do not give vague advice. Ask questions only when blocked. All code comments must be in English.
```

---

## 20. First prompts to run

After the master prompt, run this:

```txt
Read this guide and create the initial implementation plan for the repo. Then scaffold the exact file structure and implement P0.0 and P0.1 first: App navigation, default config, Zod schema, Discount Function input query, and a no-op Rust function that safely reads config and returns no discount operations.
```

Then:

```txt
Implement P0.2: the Rust discount logic for PA7, Planta samples, and NAD3 240 pouches. Add fixtures and tests for each rule.
```

Then:

```txt
Implement P0.3: Admin GraphQL server helpers and the /app/discount route to create/update/deactivate/delete the automatic app discount with JSON metafield config.
```

---

## 21. Final acceptance criteria

The project is ready to replace Scripts only when:

- [ ] Automatic app discount exists and is active.
- [ ] Function is deployed.
- [ ] Config metafield is saved correctly.
- [ ] PA7 behavior matches legacy Script.
- [ ] Planta samples behavior matches legacy Script.
- [ ] Pouches behavior matches legacy Script, including 1 free unit cap.
- [ ] Dashboard can pause/resume rules.
- [ ] Dashboard can update config.
- [ ] Delete/deactivate actions work.
- [ ] GraphQL console is protected.
- [ ] No `@shopify/polaris` dependency exists.
- [ ] No Admin API tokens are exposed.
- [ ] Tests pass.
- [ ] Real cart/checkout QA passes.
- [ ] Legacy Script can be disabled with rollback plan.
