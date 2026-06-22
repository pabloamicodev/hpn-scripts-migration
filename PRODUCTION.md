# Production rollout

## Required environment

- `SHOPIFY_API_KEY`
- `SHOPIFY_API_SECRET`
- `SHOPIFY_APP_URL`
- `SHOPIFY_APP_HANDLE`
- `SHOPIFY_DISCOUNT_FUNCTION_ID`
- `DATABASE_URL` using the pooled Neon connection
- `ENABLE_GRAPHQL_CONSOLE=false`

## Release gates

Run before every deploy:

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm audit --audit-level=moderate
```

Then deploy the Shopify extension before the web application:

```bash
pnpm shopify:deploy
```

Copy the deployed Function GID into `SHOPIFY_DISCOUNT_FUNCTION_ID`, deploy
the Vercel application, and run:

```bash
E2E_BASE_URL=https://hpn-scripts-migration.vercel.app pnpm test:e2e
```

For authenticated admin checks, launch a dedicated Chrome profile with remote
debugging, complete Shopify login and 2FA, leave the app open, then connect the
test to that browser:

```bash
E2E_CDP_URL=http://127.0.0.1:9223 \
pnpm test:e2e:shopify
```

## Merchant acceptance matrix

Verify in a development store and again in production with test checkouts:

- PA7 + C2 quantity 1: C2 receives 10%.
- PA7 + T5 quantity 1: T5 receives 10%.
- PA7 + target quantity 2: target receives no discount.
- NAD3 Single + both Planta samples: both samples are free.
- Missing any required Planta variant: no Planta discount.
- NAD3 240 + S9 + N4: one unit of each pouch is free.
- Pouch quantity greater than one: exactly one unit is free.
- Multiple eligible rules: no cart line receives duplicate candidates.
- Missing or invalid metafield: no discount is applied and the admin UI reports
  the invalid configuration.
- Combination settings match the intended stacking policy.

## Cutover

1. Keep the legacy Shopify Scripts enabled.
2. Deploy the Function and create the automatic app discount in a development
   store.
3. Complete the acceptance matrix and compare totals against the legacy Script.
4. Schedule a low-traffic production window.
5. Create and validate the Function discount while the legacy Script remains
   available.
6. Disable the legacy Script only after production checkout totals match.
7. Monitor Vercel errors, Shopify Function run details, discount usage, and
   customer support reports for at least 24 hours.

## Rollback

1. Deactivate the automatic app discount from `/app/discount`.
2. Re-enable the legacy Shopify Script.
3. Preserve the invalid configuration and logs for diagnosis; do not delete the
   discount unless rollback is confirmed.
4. If the metafield alone is corrupt, use **Restore validated defaults** and
   re-run the acceptance matrix before reactivation.

## Security operations

- Increase the HSTS `max-age` in `vercel.json` from 300 seconds only after the
  production domain and redirects have been stable.
- Keep the GraphQL console disabled in production.
- Rotate Shopify and database credentials immediately if they appear in logs.
- `APP_UNINSTALLED` removes all sessions for the shop.
- Compliance webhooks are acknowledged because the app does not persist
  customer, order, cart, or checkout records.
