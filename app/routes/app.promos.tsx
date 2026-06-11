import { useState } from "react";
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
import { ConfirmDialog } from "~/components/ConfirmDialog";

type PendingRuleAction = {
  intent: "pause" | "delete";
  ruleId: string;
} | null;

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
  const loaded = await loadActiveDiscount(proxy);

  if (!loaded.discountId) {
    return { error: "No active discount found. Create one first from the Discount page." };
  }

  if (!loaded.config.rules.some((rule) => rule.id === ruleId)) {
    return { error: `Rule "${ruleId}" was not found.` };
  }

  if (intent === "pause") {
    const result = await saveConfig(proxy, loaded.discountId, (c) => pauseRule(c, ruleId));
    if (result.userErrors.length) {
      return { error: result.userErrors.map((e) => e.message).join(", ") };
    }
  } else if (intent === "resume") {
    const result = await saveConfig(proxy, loaded.discountId, (c) => resumeRule(c, ruleId));
    if (result.userErrors.length) {
      return { error: result.userErrors.map((e) => e.message).join(", ") };
    }
  } else if (intent === "delete") {
    const result = await saveConfig(proxy, loaded.discountId, (c) => deleteRule(c, ruleId));
    if (result.userErrors.length) {
      return { error: result.userErrors.map((e) => e.message).join(", ") };
    }
  } else {
    return { error: "Unknown action." };
  }

  return { ok: true };
}

export default function PromosPage() {
  const { config, discountId, status } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const fetcher = useFetcher();
  const { revalidate } = useRevalidator();
  const [pendingRuleAction, setPendingRuleAction] =
    useState<PendingRuleAction>(null);

  const isPending = fetcher.state !== "idle";

  function submitIntent(intent: string, ruleId: string) {
    if (!discountId) return;
    if (intent === "pause" || intent === "delete") {
      setPendingRuleAction(null);
    }
    fetcher.submit(
      { intent, ruleId },
      { method: "post" }
    );
  }

  const actionError =
    fetcher.data && "error" in fetcher.data ? fetcher.data.error : null;

  return (
    <div className="app-page app-page--wide">
      <header className="page-header">
        <div>
          <h1 className="page-title">Promo rules</h1>
          <p className="page-subtitle">
            Configure which cart combinations trigger migrated HPN discounts.
          </p>
        </div>

        <div className="toolbar">
          {status && (
            <span className={`status-badge status-badge--${status === "ACTIVE" ? "active" : "paused"}`}>
              Discount {status}
            </span>
          )}
          <button
            type="button"
            onClick={() => navigate("/app/promos/new")}
            disabled={!discountId}
            className="btn btn--primary"
          >
            Add Rule
          </button>
        </div>
      </header>

      {!discountId && (
        <div className="alert alert--warning">
          These rules are the default template, but they are not active in
          Shopify yet.{" "}
          <button
            type="button"
            onClick={() => navigate("/app/discount")}
            className="btn btn--plain"
          >
            Create the discount first.
          </button>
        </div>
      )}

      {actionError && (
        <div className="alert alert--critical">
          {actionError}
        </div>
      )}

      {!discountId && (
        <section className="card empty-state">
          <h2>Discount not created yet</h2>
          <p>
            Create the automatic app discount to publish the default HPN promo
            rules to Shopify.
          </p>
          <button
            type="button"
            onClick={() => navigate("/app/discount")}
            className="btn btn--primary"
          >
            Go to Discount
          </button>
        </section>
      )}

      {discountId && config && (
        <PromoRulesTable
          rules={config.rules}
          onPause={(ruleId) => setPendingRuleAction({ intent: "pause", ruleId })}
          onResume={(ruleId) => submitIntent("resume", ruleId)}
          onDelete={(ruleId) => setPendingRuleAction({ intent: "delete", ruleId })}
        />
      )}

      {isPending && (
        <p className="muted inline-status" aria-live="polite">
          Saving changes…
        </p>
      )}

      <ConfirmDialog
        open={Boolean(pendingRuleAction)}
        tone={pendingRuleAction?.intent === "pause" ? "warning" : "danger"}
        title={
          pendingRuleAction?.intent === "pause"
            ? "Pause Promo Rule"
            : "Delete Promo Rule"
        }
        description={
          pendingRuleAction?.intent === "pause"
            ? "This rule will stop applying to matching carts as soon as the discount configuration is saved."
            : "This removes the rule from the published discount configuration. The action cannot be undone."
        }
        confirmLabel="Continue"
        pending={isPending}
        onClose={() => setPendingRuleAction(null)}
        onConfirm={() => {
          if (pendingRuleAction) {
            submitIntent(pendingRuleAction.intent, pendingRuleAction.ruleId);
          }
        }}
      />
    </div>
  );
}
