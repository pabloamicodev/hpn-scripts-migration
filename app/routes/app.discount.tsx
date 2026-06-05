import { useLoaderData, useFetcher } from "react-router";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { authenticate } from "~/shopify.server";
import {
  loadActiveDiscount,
  DISCOUNT_TITLE,
  FUNCTION_ID_ENV,
} from "~/lib/hpnPromoConfig.server";
import { defaultHpnPromoConfig } from "~/lib/hpnPromoDefaults";
import {
  createAutomaticDiscount,
  activateDiscount,
  deactivateDiscount,
  deleteDiscount,
  findHpnFunctionId,
} from "~/lib/shopifyDiscounts.server";
import { StatusBadge } from "~/components/StatusBadge";

function makeProxy(admin: any) {
  return async (q: string, v?: Record<string, unknown>) => {
    const res = await admin.graphql(q, { variables: v });
    return res.json();
  };
}

export async function loader({ request }: LoaderFunctionArgs) {
  const { admin } = await authenticate.admin(request);
  const proxy = makeProxy(admin);
  const [loaded, functionId] = await Promise.all([
    loadActiveDiscount(proxy),
    findHpnFunctionId(proxy),
  ]);
  return { ...loaded, functionId };
}

export async function action({ request }: ActionFunctionArgs) {
  const { admin } = await authenticate.admin(request);
  const proxy = makeProxy(admin);

  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");

  if (intent === "create") {
    const functionId = await findHpnFunctionId(proxy);
    if (!functionId) {
      return {
        error: `No se encontró la Shopify Function. Asegurate de que la app esté instalada en esta store y que la función esté deployada.`,
      };
    }

    const startsAt = new Date().toISOString();
    const result = await createAutomaticDiscount(
      proxy,
      DISCOUNT_TITLE,
      functionId,
      startsAt,
      defaultHpnPromoConfig,
      defaultHpnPromoConfig.combinesWith
    );

    if (result?.userErrors?.length) {
      return { error: result.userErrors.map((e: any) => e.message).join(", ") };
    }
    return { ok: true, message: "Discount created and activated." };
  }

  const loaded = await loadActiveDiscount(proxy);

  if (!loaded.discountId) {
    return { error: "No active discount found." };
  }

  if (intent === "activate") {
    const result = await activateDiscount(proxy, loaded.discountId);
    if (result?.userErrors?.length) {
      return { error: result.userErrors.map((e: any) => e.message).join(", ") };
    }
    return { ok: true, message: "Discount activated." };
  }

  if (intent === "deactivate") {
    const result = await deactivateDiscount(proxy, loaded.discountId);
    if (result?.userErrors?.length) {
      return { error: result.userErrors.map((e: any) => e.message).join(", ") };
    }
    return { ok: true, message: "Discount deactivated." };
  }

  if (intent === "delete") {
    const result = await deleteDiscount(proxy, loaded.discountId);
    if (result?.userErrors?.length) {
      return { error: result.userErrors.map((e: any) => e.message).join(", ") };
    }
    return { ok: true, message: "Discount deleted." };
  }

  return { error: "Unknown action." };
}

export default function DiscountPage() {
  const { discountId, status, title, startsAt, functionId } =
    useLoaderData<typeof loader>();
  const fetcher = useFetcher();

  const isPending = fetcher.state !== "idle";
  const actionError =
    fetcher.data && "error" in fetcher.data ? fetcher.data.error : null;
  const actionMessage =
    fetcher.data && "message" in fetcher.data ? fetcher.data.message : null;

  const isActive = status === "ACTIVE";

  return (
    <div style={{ maxWidth: "640px" }}>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "1.5rem" }}>
        Discount Management
      </h1>

      {!functionId && (
        <div
          style={{
            padding: "1rem",
            backgroundColor: "#fef3c7",
            border: "1px solid #fde68a",
            borderRadius: "0.375rem",
            marginBottom: "1.5rem",
            color: "#92400e",
            fontSize: "0.875rem",
          }}
        >
          <strong>Function no encontrada.</strong> Instalá la app en esta store.
          La función se detecta automáticamente una vez instalada.
        </div>
      )}

      <div
        style={{
          padding: "1.25rem",
          backgroundColor: "#f9fafb",
          border: "1px solid #e5e7eb",
          borderRadius: "0.5rem",
          marginBottom: "1.5rem",
        }}
      >
        <h2 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "1rem" }}>
          Current Discount
        </h2>

        {discountId ? (
          <dl style={{ display: "grid", gridTemplateColumns: "max-content 1fr", gap: "0.5rem 1rem" }}>
            <dt style={{ fontWeight: 600, color: "#6b7280", fontSize: "0.875rem" }}>Title</dt>
            <dd style={{ margin: 0 }}>{title}</dd>

            <dt style={{ fontWeight: 600, color: "#6b7280", fontSize: "0.875rem" }}>Status</dt>
            <dd style={{ margin: 0 }}>
              <StatusBadge status={isActive ? "active" : "inactive"} />
            </dd>

            <dt style={{ fontWeight: 600, color: "#6b7280", fontSize: "0.875rem" }}>Started</dt>
            <dd style={{ margin: 0 }}>
              {startsAt ? new Date(startsAt).toLocaleString() : "—"}
            </dd>

            <dt style={{ fontWeight: 600, color: "#6b7280", fontSize: "0.875rem" }}>ID</dt>
            <dd style={{ margin: 0, fontSize: "0.8rem", color: "#6b7280" }}>
              {discountId}
            </dd>
          </dl>
        ) : (
          <p style={{ color: "#6b7280" }}>No discount exists yet.</p>
        )}
      </div>

      {actionError && (
        <div
          style={{
            padding: "0.75rem",
            backgroundColor: "#fef2f2",
            border: "1px solid #fecaca",
            borderRadius: "0.375rem",
            marginBottom: "1rem",
            color: "#991b1b",
            fontSize: "0.875rem",
          }}
        >
          {actionError}
        </div>
      )}

      {actionMessage && (
        <div
          style={{
            padding: "0.75rem",
            backgroundColor: "#f0fdf4",
            border: "1px solid #bbf7d0",
            borderRadius: "0.375rem",
            marginBottom: "1rem",
            color: "#166534",
            fontSize: "0.875rem",
          }}
        >
          {actionMessage}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        {!discountId && (
          <fetcher.Form method="post">
            <input type="hidden" name="intent" value="create" />
            <button
              type="submit"
              disabled={isPending || !functionId}
              style={{
                width: "100%",
                padding: "0.75rem",
                backgroundColor: functionId ? "#0f172a" : "#9ca3af",
                color: "#fff",
                border: "none",
                borderRadius: "0.375rem",
                cursor: functionId && !isPending ? "pointer" : "not-allowed",
                fontWeight: 600,
              }}
            >
              {isPending ? "Creating..." : "Create Discount with Default Config"}
            </button>
          </fetcher.Form>
        )}

        {discountId && !isActive && (
          <fetcher.Form method="post">
            <input type="hidden" name="intent" value="activate" />
            <button
              type="submit"
              disabled={isPending}
              style={{
                width: "100%",
                padding: "0.75rem",
                backgroundColor: "#16a34a",
                color: "#fff",
                border: "none",
                borderRadius: "0.375rem",
                cursor: isPending ? "not-allowed" : "pointer",
                fontWeight: 600,
              }}
            >
              {isPending ? "Activating..." : "Activate Discount"}
            </button>
          </fetcher.Form>
        )}

        {discountId && isActive && (
          <fetcher.Form method="post">
            <input type="hidden" name="intent" value="deactivate" />
            <button
              type="submit"
              disabled={isPending}
              style={{
                width: "100%",
                padding: "0.75rem",
                backgroundColor: "#d97706",
                color: "#fff",
                border: "none",
                borderRadius: "0.375rem",
                cursor: isPending ? "not-allowed" : "pointer",
                fontWeight: 600,
              }}
            >
              {isPending ? "Deactivating..." : "Deactivate Discount"}
            </button>
          </fetcher.Form>
        )}

        {discountId && (
          <fetcher.Form
            method="post"
            onSubmit={(e) => {
              if (!window.confirm("Delete this discount permanently? All rules will be lost.")) {
                e.preventDefault();
              }
            }}
          >
            <input type="hidden" name="intent" value="delete" />
            <button
              type="submit"
              disabled={isPending}
              style={{
                width: "100%",
                padding: "0.75rem",
                backgroundColor: "#fff",
                color: "#dc2626",
                border: "1px solid #fecaca",
                borderRadius: "0.375rem",
                cursor: isPending ? "not-allowed" : "pointer",
                fontWeight: 600,
              }}
            >
              {isPending ? "Deleting..." : "Delete Discount"}
            </button>
          </fetcher.Form>
        )}
      </div>
    </div>
  );
}
