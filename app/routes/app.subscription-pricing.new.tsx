import { useState } from "react";
import { useNavigate } from "react-router";
import type { ActionFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { authenticate } from "~/shopify.server";
import { makeGraphqlProxy } from "~/lib/graphqlProxy.server";
import { createCyclePricingPlan } from "~/lib/subscriptionCyclePricing.server";
import {
  subscriptionCyclePricingPlanInputSchema,
  type SubscriptionCyclePricingPlanInput,
} from "~/lib/subscriptionCyclePricing";
import { actionError, shopifyUserErrors } from "~/lib/actionError.server";
import type { ActionError } from "~/lib/actionError.server";
import { SubscriptionCyclePricingForm } from "~/components/SubscriptionCyclePricingForm";

export async function action({ request }: ActionFunctionArgs) {
  try {
    const { admin } = await authenticate.admin(request);
    const proxy = makeGraphqlProxy(admin);

    const body = await request.text();
    let input: SubscriptionCyclePricingPlanInput;

    try {
      const parsed = subscriptionCyclePricingPlanInputSchema.safeParse(JSON.parse(body));
      if (!parsed.success) {
        return actionError("Plan validation failed", {
          operation: "createCyclePricingPlan",
          details: parsed.error.issues.map((i) => `${i.path.join(".") || "field"}: ${i.message}`),
          hint: "Check all required fields and value ranges.",
        });
      }
      input = parsed.data;
    } catch {
      return actionError("Invalid plan payload", {
        operation: "createCyclePricingPlan",
        details: ["The request body could not be parsed as JSON."],
        hint: "This is likely a client-side serialization bug — check SubscriptionCyclePricingForm.handleSubmit.",
      });
    }

    const result = await createCyclePricingPlan(proxy, input);
    if (result.userErrors.length) {
      return actionError("Shopify rejected the plan", {
        operation: "createCyclePricingPlan",
        details: shopifyUserErrors(result.userErrors),
        hint: "Check that the products aren't already attached to a conflicting selling plan group.",
      });
    }

    return redirect("/app/subscription-pricing");
  } catch (err) {
    return actionError("Unexpected server error while creating plan", {
      operation: "createCyclePricingPlan",
      cause: err,
      hint: "Check Vercel function logs for the full stack trace.",
    });
  }
}

export default function NewSubscriptionCyclePricingPage() {
  const navigate = useNavigate();
  const [submissionError, setSubmissionError] = useState<ActionError | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function handleSubmit(input: SubscriptionCyclePricingPlanInput) {
    setSubmissionError(null);
    setIsSubmitting(true);
    fetch("/app/subscription-pricing/new", {
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
            operation: "createCyclePricingPlan",
            details: [`HTTP ${res.status} — ${res.statusText}`],
            timestamp: new Date().toISOString(),
          });
        }
      })
      .catch((err) => {
        setSubmissionError({
          message: "The plan could not be saved. Check your connection and try again.",
          operation: "createCyclePricingPlan",
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
        submissionError={submissionError}
        isSubmitting={isSubmitting}
        onSubmit={handleSubmit}
        onCancel={() => navigate("/app/subscription-pricing")}
      />
    </div>
  );
}
