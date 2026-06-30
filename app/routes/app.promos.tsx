import { useState } from "react";
import { useLoaderData, useNavigate, useFetcher } from "react-router";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { authenticate } from "~/shopify.server";
import {
  loadActiveDiscount,
  saveConfig,
  pauseRule,
  resumeRule,
  deleteRule,
} from "~/lib/hpnPromoConfig.server";
import { makeGraphqlProxy } from "~/lib/graphqlProxy.server";
import {
  actionError,
  loaderError,
  shopifyUserErrors,
} from "~/lib/actionError.server";
import type { ActionError } from "~/lib/actionError.server";
import { DevErrorBanner } from "~/components/DevErrorBanner";
import { PromoRulesTable } from "~/components/PromoRulesTable";
import { ConfirmDialog } from "~/components/ConfirmDialog";

type PendingRuleAction = {
  intent: "pause" | "delete";
  ruleId: string;
} | null;

export async function loader({ request }: LoaderFunctionArgs) {
  try {
    const { admin, session } = await authenticate.admin(request);
    const proxy = makeGraphqlProxy(admin);
    const loaded = await loadActiveDiscount(proxy, session.shop);
    return { ...loaded };
  } catch (err) {
    return loaderError("Failed to load promo rules", {
      operation: "loadPromos",
      cause: err,
      hint: "Check that the Shopify Admin API is accessible and the discount metafield is valid JSON.",
    });
  }
}

export async function action({ request }: ActionFunctionArgs) {
  try {
    const { admin, session } = await authenticate.admin(request);
    const proxy = makeGraphqlProxy(admin);

    const formData = await request.formData();
    const intent = String(formData.get("intent") ?? "");
    const ruleId = String(formData.get("ruleId") ?? "");
    const loaded = await loadActiveDiscount(proxy, session.shop);

    if (!loaded.discountId) {
      return actionError("No active discount found", {
        operation: intent || "promoAction",
        details: ["The automatic app discount has not been created yet."],
        hint: "Go to Discount management and create the discount before editing rules.",
      });
    }

    if (!loaded.config.rules.some((rule) => rule.id === ruleId)) {
      return actionError(`Rule not found`, {
        operation: intent || "promoAction",
        details: [`No rule with ID "${ruleId}" exists in the current config.`],
        hint: "Reload the page — the rule list may be stale.",
      });
    }

    if (intent === "pause") {
      const result = await saveConfig(
        proxy,
        session.shop,
        loaded.discountId,
        loaded.config,
        loaded.configRevision,
        (c) => pauseRule(c, ruleId),
      );
      if (result.userErrors.length) {
        return actionError("Shopify rejected the pause request", {
          operation: "pauseRule",
          details: shopifyUserErrors(result.userErrors),
          hint: `Rule ID: "${ruleId}". Discount ID: ${loaded.discountId}`,
        });
      }
    } else if (intent === "resume") {
      const result = await saveConfig(
        proxy,
        session.shop,
        loaded.discountId,
        loaded.config,
        loaded.configRevision,
        (c) => resumeRule(c, ruleId),
      );
      if (result.userErrors.length) {
        return actionError("Shopify rejected the resume request", {
          operation: "resumeRule",
          details: shopifyUserErrors(result.userErrors),
          hint: `Rule ID: "${ruleId}"`,
        });
      }
    } else if (intent === "delete") {
      const result = await saveConfig(
        proxy,
        session.shop,
        loaded.discountId,
        loaded.config,
        loaded.configRevision,
        (c) => deleteRule(c, ruleId),
      );
      if (result.userErrors.length) {
        return actionError("Shopify rejected the delete request", {
          operation: "deleteRule",
          details: shopifyUserErrors(result.userErrors),
          hint: `Rule ID: "${ruleId}"`,
        });
      }
    } else {
      return actionError("Unrecognized intent", {
        operation: "promoAction",
        details: [`Received intent: "${intent}"`],
        hint: "Expected one of: pause | resume | delete — this is likely a UI bug.",
      });
    }

    return { ok: true };
  } catch (err) {
    return actionError("Unexpected server error in promo action", {
      operation: "promoAction",
      cause: err,
      hint: "Check Vercel function logs for the full stack trace.",
    });
  }
}

export default function PromosPage() {
  const { config, discountId, status, configValid, configError } =
    useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const fetcher = useFetcher();
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

  const actionErr =
    fetcher.data && "error" in fetcher.data
      ? (fetcher.data.error as ActionError)
      : null;

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
            disabled={!discountId || !configValid}
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
      {discountId && !configValid && (
        <div className="alert alert--critical" role="alert">
          {configError} Rule mutations are disabled until the configuration is
          repaired from Discount management.
        </div>
      )}

      <DevErrorBanner error={actionErr} />

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
