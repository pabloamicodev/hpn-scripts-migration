import { useLoaderData, useFetcher } from "react-router";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { authenticate } from "~/shopify.server";
import { loadActiveDiscount, DISCOUNT_TITLE, FUNCTION_ID_ENV, type GraphQLProxy } from "~/lib/hpnPromoConfig.server";
import { updateAutomaticDiscount } from "~/lib/shopifyDiscounts.server";
import { CartSimulator } from "~/components/CartSimulator";
import { defaultHpnPromoConfig } from "~/lib/hpnPromoDefaults";

function makeProxy(admin: any): GraphQLProxy {
  return async (q: string, v?: Record<string, unknown>) => {
    const res = await admin.graphql(q, { variables: v });
    return res.json();
  };
}

export async function loader({ request }: LoaderFunctionArgs) {
  const { admin } = await authenticate.admin(request);
  const proxy = makeProxy(admin);
  const loaded = await loadActiveDiscount(proxy);
  return {
    ...loaded,
    functionId: process.env[FUNCTION_ID_ENV] ?? null,
    graphqlConsoleEnabled: process.env.ENABLE_GRAPHQL_CONSOLE === "true",
  };
}

export async function action({ request }: ActionFunctionArgs) {
  const { admin } = await authenticate.admin(request);
  const proxy = makeProxy(admin);

  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");

  const loaded = await loadActiveDiscount(proxy);
  if (!loaded.discountId) {
    return { error: "No active discount to update." };
  }

  if (intent === "update-combines-with") {
    const combinesWith = {
      orderDiscounts: formData.get("orderDiscounts") === "true",
      productDiscounts: formData.get("productDiscounts") === "true",
      shippingDiscounts: formData.get("shippingDiscounts") === "true",
    };

    const result = await updateAutomaticDiscount(proxy, loaded.discountId, {
      combinesWith,
      config: { ...loaded.config, combinesWith },
    });

    if (result?.userErrors?.length) {
      return { error: result.userErrors.map((e: any) => e.message).join(", ") };
    }
    return { ok: true };
  }

  return { error: "Unknown intent." };
}

export default function SettingsPage() {
  const { config, discountId, functionId, graphqlConsoleEnabled } =
    useLoaderData<typeof loader>();
  const fetcher = useFetcher();

  const combinesWith = config?.combinesWith ?? defaultHpnPromoConfig.combinesWith;

  const actionError =
    fetcher.data && "error" in fetcher.data ? fetcher.data.error : null;
  const actionOk =
    fetcher.data && "ok" in fetcher.data ? fetcher.data.ok : false;

  return (
    <div style={{ maxWidth: "720px" }}>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "1.5rem" }}>
        Settings
      </h1>

      <section
        style={{
          padding: "1.25rem",
          backgroundColor: "#f9fafb",
          border: "1px solid #e5e7eb",
          borderRadius: "0.5rem",
          marginBottom: "1.5rem",
        }}
      >
        <h2 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "0.75rem" }}>
          Environment
        </h2>
        <dl style={{ display: "grid", gridTemplateColumns: "max-content 1fr", gap: "0.5rem 1rem", fontSize: "0.875rem" }}>
          <dt style={{ fontWeight: 600, color: "#6b7280" }}>Function ID</dt>
          <dd style={{ margin: 0 }}>
            {functionId ? (
              <code style={{ color: "#166534" }}>{functionId}</code>
            ) : (
              <span style={{ color: "#dc2626" }}>Not set — deploy function first</span>
            )}
          </dd>

          <dt style={{ fontWeight: 600, color: "#6b7280" }}>GraphQL Console</dt>
          <dd style={{ margin: 0 }}>
            <code>{graphqlConsoleEnabled ? "Enabled" : "Disabled"}</code>
          </dd>
        </dl>
      </section>

      <section
        style={{
          padding: "1.25rem",
          backgroundColor: "#f9fafb",
          border: "1px solid #e5e7eb",
          borderRadius: "0.5rem",
          marginBottom: "1.5rem",
        }}
      >
        <h2 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "0.75rem" }}>
          Combines With
        </h2>
        {!discountId ? (
          <p style={{ color: "#6b7280", fontSize: "0.875rem" }}>
            No active discount to configure.
          </p>
        ) : (
          <fetcher.Form method="post">
            <input type="hidden" name="intent" value="update-combines-with" />

            {(["orderDiscounts", "productDiscounts", "shippingDiscounts"] as const).map(
              (key) => (
                <label
                  key={key}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    marginBottom: "0.5rem",
                    fontSize: "0.875rem",
                  }}
                >
                  <input
                    type="hidden"
                    name={key}
                    value={String(!!combinesWith[key])}
                  />
                  <input
                    type="checkbox"
                    defaultChecked={!!combinesWith[key]}
                    onChange={(e) => {
                      const hidden = e.currentTarget.previousElementSibling as HTMLInputElement;
                      hidden.value = String(e.currentTarget.checked);
                    }}
                  />
                  {key === "orderDiscounts" && "Combines with Order Discounts"}
                  {key === "productDiscounts" && "Combines with Product Discounts"}
                  {key === "shippingDiscounts" && "Combines with Shipping Discounts"}
                </label>
              )
            )}

            {actionError && (
              <p style={{ color: "#dc2626", fontSize: "0.875rem", marginTop: "0.5rem" }}>
                {actionError}
              </p>
            )}
            {actionOk && (
              <p style={{ color: "#16a34a", fontSize: "0.875rem", marginTop: "0.5rem" }}>
                Saved.
              </p>
            )}

            <button
              type="submit"
              disabled={fetcher.state !== "idle"}
              style={{
                marginTop: "1rem",
                padding: "0.5rem 1.25rem",
                backgroundColor: "#0f172a",
                color: "#fff",
                border: "none",
                borderRadius: "0.375rem",
                cursor: "pointer",
                fontWeight: 600,
                fontSize: "0.875rem",
              }}
            >
              {fetcher.state !== "idle" ? "Saving..." : "Save"}
            </button>
          </fetcher.Form>
        )}
      </section>

      <section>
        <h2 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "0.75rem" }}>
          Cart Simulator
        </h2>
        <CartSimulator config={config ?? defaultHpnPromoConfig} />
      </section>
    </div>
  );
}
