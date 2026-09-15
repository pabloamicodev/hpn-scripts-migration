import { useState } from "react";
import { useLoaderData, useNavigate, useFetcher } from "react-router";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { authenticate } from "~/shopify.server";
import { makeGraphqlProxy } from "~/lib/graphqlProxy.server";
import {
  listCyclePricingPlans,
  deleteCyclePricingPlan,
} from "~/lib/subscriptionCyclePricing.server";
import {
  actionError,
  loaderError,
  shopifyUserErrors,
} from "~/lib/actionError.server";
import type { ActionError } from "~/lib/actionError.server";
import { DevErrorBanner } from "~/components/DevErrorBanner";
import { SubscriptionCyclePricingTable } from "~/components/SubscriptionCyclePricingTable";
import { ConfirmDialog } from "~/components/ConfirmDialog";

export async function loader({ request }: LoaderFunctionArgs) {
  try {
    const { admin } = await authenticate.admin(request);
    const proxy = makeGraphqlProxy(admin);
    const plans = await listCyclePricingPlans(proxy);
    return { plans };
  } catch (err) {
    return loaderError("Failed to load subscription pricing plans", {
      operation: "loadCyclePricingPlans",
      cause: err,
      hint: "Check that the Shopify Admin API is accessible.",
    });
  }
}

export async function action({ request }: ActionFunctionArgs) {
  try {
    const { admin } = await authenticate.admin(request);
    const proxy = makeGraphqlProxy(admin);

    const formData = await request.formData();
    const intent = String(formData.get("intent") ?? "");
    const planId = String(formData.get("planId") ?? "");

    if (intent !== "delete") {
      return actionError("Unrecognized intent", {
        operation: "cyclePricingAction",
        details: [`Received intent: "${intent}"`],
        hint: "Expected intent: delete — this is likely a UI bug.",
      });
    }

    const result = await deleteCyclePricingPlan(proxy, planId);
    if (result.userErrors.length) {
      return actionError("Shopify rejected the delete request", {
        operation: "deleteCyclePricingPlan",
        details: shopifyUserErrors(result.userErrors),
        hint: `Plan ID: "${planId}"`,
      });
    }

    return { ok: true };
  } catch (err) {
    return actionError("Unexpected server error in subscription pricing action", {
      operation: "cyclePricingAction",
      cause: err,
      hint: "Check Vercel function logs for the full stack trace.",
    });
  }
}

export default function SubscriptionCyclePricingPage() {
  const { plans } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const fetcher = useFetcher();
  const [pendingDeletePlanId, setPendingDeletePlanId] = useState<string | null>(null);

  const isPending = fetcher.state !== "idle";

  function confirmDelete() {
    if (!pendingDeletePlanId) return;
    fetcher.submit(
      { intent: "delete", planId: pendingDeletePlanId },
      { method: "post" },
    );
    setPendingDeletePlanId(null);
  }

  const actionErr =
    fetcher.data && "error" in fetcher.data
      ? (fetcher.data.error as ActionError)
      : null;

  return (
    <div className="app-page app-page--wide">
      <header className="page-header">
        <div>
          <h1 className="page-title">Subscription pricing</h1>
          <p className="page-subtitle">
            Selling Plans priced differently on the first shipment vs. later
            shipments (e.g. full price, then $2 off from the 2nd onward).
          </p>
        </div>

        <div className="toolbar">
          <button
            type="button"
            onClick={() => navigate("/app/subscription-pricing/new")}
            className="btn btn--primary"
          >
            New Plan
          </button>
        </div>
      </header>

      <DevErrorBanner error={actionErr} />

      <SubscriptionCyclePricingTable
        plans={plans}
        onDelete={(planId) => setPendingDeletePlanId(planId)}
      />

      {isPending && (
        <p className="muted inline-status" aria-live="polite">
          Saving changes…
        </p>
      )}

      <ConfirmDialog
        open={Boolean(pendingDeletePlanId)}
        tone="danger"
        title="Delete Subscription Pricing Plan"
        description="This deletes the Selling Plan Group from Shopify. Existing subscription contracts already using it are unaffected, but it can no longer be selected for new signups. This cannot be undone."
        confirmLabel="Continue"
        pending={isPending}
        onClose={() => setPendingDeletePlanId(null)}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
