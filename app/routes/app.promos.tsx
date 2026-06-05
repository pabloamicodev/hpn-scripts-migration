import { useLoaderData, useNavigate, useFetcher, useRevalidator } from "react-router";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { authenticate } from "~/shopify.server";
import {
  loadActiveDiscount,
  saveConfig,
  pauseRule,
  resumeRule,
  deleteRule,
  type GraphQLProxy,
} from "~/lib/hpnPromoConfig.server";
import { PromoRulesTable } from "~/components/PromoRulesTable";

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
  return { ...loaded };
}

export async function action({ request }: ActionFunctionArgs) {
  const { admin } = await authenticate.admin(request);
  const proxy = makeProxy(admin);

  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");
  const ruleId = String(formData.get("ruleId") ?? "");
  const discountId = String(formData.get("discountId") ?? "");

  if (!discountId) {
    return { error: "No active discount found. Create one first from the Discount page." };
  }

  if (intent === "pause") {
    const result = await saveConfig(proxy, discountId, (c) => pauseRule(c, ruleId));
    if (result.userErrors.length) {
      return { error: result.userErrors.map((e) => e.message).join(", ") };
    }
  } else if (intent === "resume") {
    const result = await saveConfig(proxy, discountId, (c) => resumeRule(c, ruleId));
    if (result.userErrors.length) {
      return { error: result.userErrors.map((e) => e.message).join(", ") };
    }
  } else if (intent === "delete") {
    const result = await saveConfig(proxy, discountId, (c) => deleteRule(c, ruleId));
    if (result.userErrors.length) {
      return { error: result.userErrors.map((e) => e.message).join(", ") };
    }
  }

  return { ok: true };
}

export default function PromosPage() {
  const { config, discountId, status } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const fetcher = useFetcher();
  const { revalidate } = useRevalidator();

  const isPending = fetcher.state !== "idle";

  function submitIntent(intent: string, ruleId: string) {
    if (!discountId) return;
    fetcher.submit(
      { intent, ruleId, discountId },
      { method: "post" }
    );
  }

  const actionError =
    fetcher.data && "error" in fetcher.data ? fetcher.data.error : null;

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "1.5rem",
        }}
      >
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700 }}>Promo Rules</h1>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          {status && (
            <span
              style={{
                fontSize: "0.75rem",
                fontWeight: 600,
                padding: "0.25rem 0.75rem",
                borderRadius: "9999px",
                backgroundColor: status === "ACTIVE" ? "#dcfce7" : "#fef3c7",
                color: status === "ACTIVE" ? "#166534" : "#92400e",
              }}
            >
              Discount {status}
            </span>
          )}
          <button
            type="button"
            onClick={() => navigate("/app/promos/new")}
            disabled={!discountId}
            style={{
              padding: "0.5rem 1rem",
              backgroundColor: discountId ? "#0f172a" : "#9ca3af",
              color: "#fff",
              border: "none",
              borderRadius: "0.375rem",
              cursor: discountId ? "pointer" : "not-allowed",
              fontWeight: 600,
              fontSize: "0.875rem",
            }}
          >
            Add Rule
          </button>
        </div>
      </div>

      {!discountId && (
        <div
          style={{
            padding: "1rem",
            backgroundColor: "#fef3c7",
            border: "1px solid #fde68a",
            borderRadius: "0.375rem",
            marginBottom: "1rem",
            color: "#92400e",
          }}
        >
          No active discount found.{" "}
          <button
            type="button"
            onClick={() => navigate("/app/discount")}
            style={{
              color: "#92400e",
              fontWeight: 600,
              textDecoration: "underline",
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 0,
            }}
          >
            Create one first.
          </button>
        </div>
      )}

      {actionError && (
        <div
          style={{
            padding: "0.75rem",
            backgroundColor: "#fef2f2",
            border: "1px solid #fecaca",
            borderRadius: "0.375rem",
            marginBottom: "1rem",
            color: "#991b1b",
          }}
        >
          {actionError}
        </div>
      )}

      {config && (
        <PromoRulesTable
          rules={config.rules}
          onPause={(ruleId) => submitIntent("pause", ruleId)}
          onResume={(ruleId) => submitIntent("resume", ruleId)}
          onDelete={(ruleId) => {
            if (window.confirm("Delete this promo rule? This cannot be undone.")) {
              submitIntent("delete", ruleId);
            }
          }}
        />
      )}

      {isPending && (
        <p style={{ marginTop: "1rem", color: "#6b7280", fontSize: "0.875rem" }}>
          Saving changes...
        </p>
      )}
    </div>
  );
}
