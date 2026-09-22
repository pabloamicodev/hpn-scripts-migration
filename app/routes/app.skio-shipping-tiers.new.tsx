import { useState } from "react";
import { useNavigate } from "react-router";
import type { ActionFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { authenticate } from "~/shopify.server";
import { makeGraphqlProxy } from "~/lib/graphqlProxy.server";
import {
  loadSkioShippingTiersConfig,
  saveSkioShippingTiersConfig,
  upsertTier,
} from "~/lib/skioShippingTiersConfig.server";
import { skioShippingTierSchema, type SkioShippingTier } from "~/lib/skioShippingTiers";
import { actionError, shopifyUserErrors } from "~/lib/actionError.server";
import type { ActionError } from "~/lib/actionError.server";
import { SkioShippingTierForm } from "~/components/SkioShippingTierForm";

export async function action({ request }: ActionFunctionArgs) {
  try {
    const { admin } = await authenticate.admin(request);
    const proxy = makeGraphqlProxy(admin);

    const body = await request.text();
    let tier: SkioShippingTier;

    try {
      const parsed = skioShippingTierSchema.safeParse(JSON.parse(body));
      if (!parsed.success) {
        return actionError("Tier validation failed", {
          operation: "createSkioShippingTier",
          details: parsed.error.issues.map((i) => `${i.path.join(".") || "field"}: ${i.message}`),
          hint: "Check all required fields and value ranges.",
        });
      }
      tier = parsed.data;
    } catch {
      return actionError("Invalid tier payload", {
        operation: "createSkioShippingTier",
        details: ["The request body could not be parsed as JSON."],
        hint: "This is likely a client-side serialization bug — check SkioShippingTierForm.handleSubmit.",
      });
    }

    const loaded = await loadSkioShippingTiersConfig(proxy);
    if (!loaded.configValid) {
      return actionError("Stored configuration is invalid", {
        operation: "createSkioShippingTier",
        details: [loaded.configError ?? "unknown"],
        hint: "Repair the metafield value directly before adding tiers.",
      });
    }

    if (loaded.config.tiers.some((t) => t.id === tier.id)) {
      return actionError("Tier ID already exists", {
        operation: "createSkioShippingTier",
        details: [`A tier with ID "${tier.id}" already exists.`],
        hint: "Edit the existing tier from the list instead of creating a new one.",
      });
    }

    const result = await saveSkioShippingTiersConfig(proxy, upsertTier(loaded.config, tier));
    if (result.userErrors.length) {
      return actionError("Shopify rejected the tier save", {
        operation: "createSkioShippingTier",
        details: shopifyUserErrors(result.userErrors),
      });
    }

    return redirect("/app/skio-shipping-tiers");
  } catch (err) {
    return actionError("Unexpected server error while creating tier", {
      operation: "createSkioShippingTier",
      cause: err,
      hint: "Check Vercel function logs for the full stack trace.",
    });
  }
}

export default function NewSkioShippingTierPage() {
  const navigate = useNavigate();
  const [submissionError, setSubmissionError] = useState<ActionError | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function handleSubmit(tier: SkioShippingTier) {
    setSubmissionError(null);
    setIsSubmitting(true);
    fetch("/app/skio-shipping-tiers/new", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(tier),
    })
      .then(async (res) => {
        if (res.redirected) {
          navigate("/app/skio-shipping-tiers");
          return;
        }

        const contentType = res.headers.get("content-type") ?? "";
        const data = contentType.includes("application/json") ? await res.json() : null;

        if (data?.error) {
          setSubmissionError(data.error as ActionError);
        } else if (res.ok) {
          navigate("/app/skio-shipping-tiers");
        } else {
          setSubmissionError({
            message: "The tier could not be saved. Review the form and try again.",
            operation: "createSkioShippingTier",
            details: [`HTTP ${res.status} — ${res.statusText}`],
            timestamp: new Date().toISOString(),
          });
        }
      })
      .catch((err) => {
        setSubmissionError({
          message: "The tier could not be saved. Check your connection and try again.",
          operation: "createSkioShippingTier",
          details: [err instanceof Error ? err.message : String(err)],
          timestamp: new Date().toISOString(),
        });
      })
      .finally(() => setIsSubmitting(false));
  }

  return (
    <div className="app-page">
      <button type="button" onClick={() => navigate("/app/skio-shipping-tiers")} className="btn btn--plain">
        Back to Skio Shipping Tiers
      </button>

      <SkioShippingTierForm
        submissionError={submissionError}
        isSubmitting={isSubmitting}
        onSubmit={handleSubmit}
        onCancel={() => navigate("/app/skio-shipping-tiers")}
      />
    </div>
  );
}
