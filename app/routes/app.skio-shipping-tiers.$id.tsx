import { useState } from "react";
import { useLoaderData, useNavigate } from "react-router";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { authenticate } from "~/shopify.server";
import { makeGraphqlProxy } from "~/lib/graphqlProxy.server";
import {
  loadSkioShippingTiersConfig,
  saveSkioShippingTiersConfig,
  upsertTier,
  deleteTier,
} from "~/lib/skioShippingTiersConfig.server";
import { getVariantById } from "~/lib/shopifyProducts.server";
import { skioShippingTierSchema, type SkioShippingTier } from "~/lib/skioShippingTiers";
import { actionError, loaderError, shopifyUserErrors } from "~/lib/actionError.server";
import type { ActionError } from "~/lib/actionError.server";
import { SkioShippingTierForm } from "~/components/SkioShippingTierForm";
import { ConfirmDialog } from "~/components/ConfirmDialog";

export async function loader({ request, params }: LoaderFunctionArgs) {
  try {
    const { admin } = await authenticate.admin(request);
    const proxy = makeGraphqlProxy(admin);
    const loaded = await loadSkioShippingTiersConfig(proxy);

    if (!loaded.configValid) {
      return loaderError("Stored Skio shipping tiers configuration is invalid", {
        operation: "loadSkioShippingTier",
        details: [loaded.configError ?? "unknown"],
        hint: "Repair the metafield value directly.",
      });
    }

    const tier = loaded.config.tiers.find((t) => t.id === params.id);
    if (!tier) {
      return loaderError("Skio shipping tier not found", {
        operation: "loadSkioShippingTier",
        details: [`No tier with ID "${params.id}" exists.`],
        hint: "It may have been deleted from another tab.",
        status: 404,
      });
    }

    const productTitlesById: Record<string, string> = {};
    if (tier.productVariantIds) {
      const variants = await Promise.all(
        tier.productVariantIds.map((id) => getVariantById(proxy, id).catch(() => null)),
      );
      for (const variant of variants) {
        if (variant) {
          productTitlesById[variant.id] = `${variant.product.title} — ${variant.title}`;
        }
      }
    }

    return { tier, productTitlesById };
  } catch (err) {
    return loaderError("Failed to load Skio shipping tier", {
      operation: "loadSkioShippingTier",
      cause: err,
      hint: "Check that the Shopify Admin API is accessible.",
    });
  }
}

export async function action({ request, params }: ActionFunctionArgs) {
  try {
    const { admin } = await authenticate.admin(request);
    const proxy = makeGraphqlProxy(admin);
    const tierId = params.id!;

    const contentType = request.headers.get("content-type") ?? "";

    if (contentType.includes("application/json")) {
      const body = await request.text();
      let tier: SkioShippingTier;

      try {
        const parsed = skioShippingTierSchema.safeParse(JSON.parse(body));
        if (!parsed.success) {
          return actionError("Tier validation failed", {
            operation: "updateSkioShippingTier",
            details: parsed.error.issues.map((i) => `${i.path.join(".") || "field"}: ${i.message}`),
            hint: "Check all required fields and value ranges.",
          });
        }
        tier = parsed.data;
      } catch {
        return actionError("Invalid tier payload", {
          operation: "updateSkioShippingTier",
          details: ["The request body could not be parsed as JSON."],
          hint: "This is likely a client-side serialization bug — check SkioShippingTierForm.handleSubmit.",
        });
      }

      const loaded = await loadSkioShippingTiersConfig(proxy);
      if (!loaded.configValid) {
        return actionError("Stored configuration is invalid", {
          operation: "updateSkioShippingTier",
          details: [loaded.configError ?? "unknown"],
          hint: "Repair the metafield value directly before editing tiers.",
        });
      }

      const result = await saveSkioShippingTiersConfig(proxy, upsertTier(loaded.config, { ...tier, id: tierId }));
      if (result.userErrors.length) {
        return actionError("Shopify rejected the tier update", {
          operation: "updateSkioShippingTier",
          details: shopifyUserErrors(result.userErrors),
          hint: `Tier ID: "${tierId}"`,
        });
      }

      return redirect("/app/skio-shipping-tiers");
    }

    const formData = await request.formData();
    const intent = String(formData.get("intent") ?? "");

    if (intent === "delete") {
      const loaded = await loadSkioShippingTiersConfig(proxy);
      if (!loaded.configValid) {
        return actionError("Stored configuration is invalid", {
          operation: "deleteSkioShippingTier",
          details: [loaded.configError ?? "unknown"],
        });
      }

      const result = await saveSkioShippingTiersConfig(proxy, deleteTier(loaded.config, tierId));
      if (result.userErrors.length) {
        return actionError("Shopify rejected the delete request", {
          operation: "deleteSkioShippingTier",
          details: shopifyUserErrors(result.userErrors),
          hint: `Tier ID: "${tierId}"`,
        });
      }
      return redirect("/app/skio-shipping-tiers");
    }

    return actionError("Unrecognized intent", {
      operation: "skioShippingTierAction",
      details: [`Received intent: "${intent}"`],
      hint: "Expected intent: delete — this is likely a UI bug.",
    });
  } catch (err) {
    return actionError("Unexpected server error in Skio shipping tier action", {
      operation: "skioShippingTierAction",
      cause: err,
      hint: "Check Vercel function logs for the full stack trace.",
    });
  }
}

export default function EditSkioShippingTierPage() {
  const { tier, productTitlesById } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const [submissionError, setSubmissionError] = useState<ActionError | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  function handleSubmit(nextTier: SkioShippingTier) {
    setSubmissionError(null);
    setIsSubmitting(true);
    fetch(`/app/skio-shipping-tiers/${encodeURIComponent(tier.id)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(nextTier),
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
            operation: "updateSkioShippingTier",
            details: [`HTTP ${res.status} — ${res.statusText}`],
            timestamp: new Date().toISOString(),
          });
        }
      })
      .catch((err) => {
        setSubmissionError({
          message: "The tier could not be saved. Check your connection and try again.",
          operation: "updateSkioShippingTier",
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
    fetch(`/app/skio-shipping-tiers/${encodeURIComponent(tier.id)}`, {
      method: "POST",
      body: formData,
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
            message: "The tier could not be deleted. Try again.",
            operation: "deleteSkioShippingTier",
            details: [`HTTP ${res.status} — ${res.statusText}`],
            timestamp: new Date().toISOString(),
          });
        }
      })
      .catch((err) => {
        setSubmissionError({
          message: "The tier could not be deleted. Check your connection and try again.",
          operation: "deleteSkioShippingTier",
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
        defaultValues={tier}
        productTitlesById={productTitlesById}
        submissionError={submissionError}
        isSubmitting={isSubmitting}
        onSubmit={handleSubmit}
        onCancel={() => navigate("/app/skio-shipping-tiers")}
      />

      <div className="btn-row">
        <button type="button" className="btn btn--danger" onClick={() => setConfirmingDelete(true)}>
          Delete Tier
        </button>
      </div>

      <ConfirmDialog
        open={confirmingDelete}
        tone="danger"
        title="Delete Skio Shipping Tier"
        description="This removes the tier from the configuration. It does not revert any shipping price Skio already has set for subscriptions that matched it. This cannot be undone."
        confirmLabel="Continue"
        pending={isSubmitting}
        onClose={() => setConfirmingDelete(false)}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
