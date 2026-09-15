import { useState } from "react";
import { useLoaderData, useNavigate } from "react-router";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { authenticate } from "~/shopify.server";
import { makeGraphqlProxy } from "~/lib/graphqlProxy.server";
import {
  getCyclePricingPlan,
  updateCyclePricingPlan,
  deleteCyclePricingPlan,
} from "~/lib/subscriptionCyclePricing.server";
import {
  subscriptionCyclePricingPlanInputSchema,
  type SubscriptionCyclePricingPlanInput,
} from "~/lib/subscriptionCyclePricing";
import {
  actionError,
  loaderError,
  shopifyUserErrors,
} from "~/lib/actionError.server";
import type { ActionError } from "~/lib/actionError.server";
import { SubscriptionCyclePricingForm } from "~/components/SubscriptionCyclePricingForm";
import { ConfirmDialog } from "~/components/ConfirmDialog";

export async function loader({ request, params }: LoaderFunctionArgs) {
  try {
    const { admin } = await authenticate.admin(request);
    const proxy = makeGraphqlProxy(admin);
    const plan = await getCyclePricingPlan(proxy, params.id!);

    if (!plan) {
      return loaderError("Subscription pricing plan not found", {
        operation: "loadCyclePricingPlan",
        details: [`No plan with ID "${params.id}" exists.`],
        hint: "It may have been deleted from another tab.",
        status: 404,
      });
    }

    return { plan };
  } catch (err) {
    return loaderError("Failed to load subscription pricing plan", {
      operation: "loadCyclePricingPlan",
      cause: err,
      hint: "Check that the Shopify Admin API is accessible.",
    });
  }
}

export async function action({ request, params }: ActionFunctionArgs) {
  try {
    const { admin } = await authenticate.admin(request);
    const proxy = makeGraphqlProxy(admin);
    const planId = params.id!;

    const contentType = request.headers.get("content-type") ?? "";

    if (contentType.includes("application/json")) {
      const body = await request.text();
      let input: SubscriptionCyclePricingPlanInput;

      try {
        const parsed = subscriptionCyclePricingPlanInputSchema.safeParse(JSON.parse(body));
        if (!parsed.success) {
          return actionError("Plan validation failed", {
            operation: "updateCyclePricingPlan",
            details: parsed.error.issues.map((i) => `${i.path.join(".") || "field"}: ${i.message}`),
            hint: "Check all required fields and value ranges.",
          });
        }
        input = parsed.data;
      } catch {
        return actionError("Invalid plan payload", {
          operation: "updateCyclePricingPlan",
          details: ["The request body could not be parsed as JSON."],
          hint: "This is likely a client-side serialization bug — check SubscriptionCyclePricingForm.handleSubmit.",
        });
      }

      const existing = await getCyclePricingPlan(proxy, planId);
      if (!existing) {
        return actionError("Plan not found", {
          operation: "updateCyclePricingPlan",
          details: [`No plan with ID "${planId}" exists.`],
          hint: "Reload the page — the plan may have been deleted from another tab.",
        });
      }

      const result = await updateCyclePricingPlan(proxy, existing, input);
      if (result.userErrors.length) {
        return actionError("Shopify rejected the plan update", {
          operation: "updateCyclePricingPlan",
          details: shopifyUserErrors(result.userErrors),
          hint: `Plan ID: "${planId}"`,
        });
      }

      return redirect("/app/subscription-pricing");
    }

    const formData = await request.formData();
    const intent = String(formData.get("intent") ?? "");

    if (intent === "delete") {
      const result = await deleteCyclePricingPlan(proxy, planId);
      if (result.userErrors.length) {
        return actionError("Shopify rejected the delete request", {
          operation: "deleteCyclePricingPlan",
          details: shopifyUserErrors(result.userErrors),
          hint: `Plan ID: "${planId}"`,
        });
      }
      return redirect("/app/subscription-pricing");
    }

    return actionError("Unrecognized intent", {
      operation: "cyclePricingAction",
      details: [`Received intent: "${intent}"`],
      hint: "Expected intent: delete — this is likely a UI bug.",
    });
  } catch (err) {
    return actionError("Unexpected server error in subscription pricing action", {
      operation: "cyclePricingAction",
      cause: err,
      hint: "Check Vercel function logs for the full stack trace.",
    });
  }
}

export default function EditSubscriptionCyclePricingPage() {
  const { plan } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const [submissionError, setSubmissionError] = useState<ActionError | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  function handleSubmit(input: SubscriptionCyclePricingPlanInput) {
    setSubmissionError(null);
    setIsSubmitting(true);
    fetch(`/app/subscription-pricing/${encodeURIComponent(plan.id)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    })
      .then(async (res) => {
        if (res.redirected) {
          navigate("/app/subscription-pricing");
          return;
        }

        const contentType = res.headers.get("content-type") ?? "";
        const data = contentType.includes("application/json") ? await res.json() : null;

        if (data?.error) {
          setSubmissionError(data.error as ActionError);
        } else if (res.ok) {
          navigate("/app/subscription-pricing");
        } else {
          setSubmissionError({
            message: "The plan could not be saved. Review the form and try again.",
            operation: "updateCyclePricingPlan",
            details: [`HTTP ${res.status} — ${res.statusText}`],
            timestamp: new Date().toISOString(),
          });
        }
      })
      .catch((err) => {
        setSubmissionError({
          message: "The plan could not be saved. Check your connection and try again.",
          operation: "updateCyclePricingPlan",
          details: [err instanceof Error ? err.message : String(err)],
          timestamp: new Date().toISOString(),
        });
      })
      .finally(() => setIsSubmitting(false));
  }

  function confirmDelete() {
    setConfirmingDelete(false);
    setSubmissionError(null);
    setIsSubmitting(true);
    const formData = new FormData();
    formData.set("intent", "delete");
    fetch(`/app/subscription-pricing/${encodeURIComponent(plan.id)}`, {
      method: "POST",
      body: formData,
    })
      .then(async (res) => {
        if (res.redirected) {
          navigate("/app/subscription-pricing");
          return;
        }

        // actionError() responses come back as HTTP 200 with an `{ error }`
        // body (see actionError.server.ts) — res.ok alone can't tell a
        // rejected delete apart from a successful one. Checking only
        // res.ok/res.redirected here previously navigated away as if the
        // delete had succeeded even when Shopify rejected it.
        const contentType = res.headers.get("content-type") ?? "";
        const data = contentType.includes("application/json") ? await res.json() : null;

        if (data?.error) {
          setSubmissionError(data.error as ActionError);
        } else if (res.ok) {
          navigate("/app/subscription-pricing");
        } else {
          setSubmissionError({
            message: "The plan could not be deleted. Try again.",
            operation: "deleteCyclePricingPlan",
            details: [`HTTP ${res.status} — ${res.statusText}`],
            timestamp: new Date().toISOString(),
          });
        }
      })
      .catch((err) => {
        setSubmissionError({
          message: "The plan could not be deleted. Check your connection and try again.",
          operation: "deleteCyclePricingPlan",
          details: [err instanceof Error ? err.message : String(err)],
          timestamp: new Date().toISOString(),
        });
      })
      .finally(() => setIsSubmitting(false));
  }

  return (
    <div className="app-page">
      <button type="button" onClick={() => navigate("/app/subscription-pricing")} className="btn btn--plain">
        Back to Subscription Pricing
      </button>

      <SubscriptionCyclePricingForm
        defaultValues={plan}
        submissionError={submissionError}
        isSubmitting={isSubmitting}
        onSubmit={handleSubmit}
        onCancel={() => navigate("/app/subscription-pricing")}
      />

      <div className="btn-row">
        <button
          type="button"
          className="btn btn--danger"
          onClick={() => setConfirmingDelete(true)}
        >
          Delete Plan
        </button>
      </div>

      <ConfirmDialog
        open={confirmingDelete}
        tone="danger"
        title="Delete Subscription Pricing Plan"
        description="This deletes the Selling Plan Group from Shopify. Existing subscription contracts already using it are unaffected, but it can no longer be selected for new signups. This cannot be undone."
        confirmLabel="Continue"
        pending={isSubmitting}
        onClose={() => setConfirmingDelete(false)}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
