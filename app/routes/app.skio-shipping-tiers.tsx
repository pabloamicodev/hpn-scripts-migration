import { useState } from "react";
import { useLoaderData, useNavigate, useFetcher } from "react-router";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { authenticate } from "~/shopify.server";
import { makeGraphqlProxy } from "~/lib/graphqlProxy.server";
import {
  loadSkioShippingTiersConfig,
  saveSkioShippingTiersConfig,
  deleteTier,
} from "~/lib/skioShippingTiersConfig.server";
import { actionError, loaderError, shopifyUserErrors } from "~/lib/actionError.server";
import type { ActionError } from "~/lib/actionError.server";
import { DevErrorBanner } from "~/components/DevErrorBanner";
import { SkioShippingTiersTable } from "~/components/SkioShippingTiersTable";
import { ConfirmDialog } from "~/components/ConfirmDialog";

export async function loader({ request }: LoaderFunctionArgs) {
  try {
    const { admin } = await authenticate.admin(request);
    const proxy = makeGraphqlProxy(admin);
    const loaded = await loadSkioShippingTiersConfig(proxy);
    return loaded;
  } catch (err) {
    return loaderError("Failed to load Skio shipping tiers", {
      operation: "loadSkioShippingTiers",
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
    const tierId = String(formData.get("tierId") ?? "");

    if (intent !== "delete") {
      return actionError("Unrecognized intent", {
        operation: "skioShippingTierAction",
        details: [`Received intent: "${intent}"`],
        hint: "Expected intent: delete — this is likely a UI bug.",
      });
    }

    const loaded = await loadSkioShippingTiersConfig(proxy);
    if (!loaded.configValid) {
      return actionError("Stored configuration is invalid", {
        operation: "deleteSkioShippingTier",
        details: [loaded.configError ?? "unknown"],
        hint: "Repair the metafield value directly before deleting tiers.",
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

    return { ok: true };
  } catch (err) {
    return actionError("Unexpected server error in Skio shipping tier action", {
      operation: "skioShippingTierAction",
      cause: err,
      hint: "Check Vercel function logs for the full stack trace.",
    });
  }
}

export default function SkioShippingTiersPage() {
  const { config, configValid, configError } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const fetcher = useFetcher();
  const [pendingDeleteTierId, setPendingDeleteTierId] = useState<string | null>(null);

  const isPending = fetcher.state !== "idle";

  function confirmDelete() {
    if (!pendingDeleteTierId) return;
    fetcher.submit({ intent: "delete", tierId: pendingDeleteTierId }, { method: "post" });
    setPendingDeleteTierId(null);
  }

  const actionErr =
    fetcher.data && "error" in fetcher.data ? (fetcher.data.error as ActionError) : null;

  return (
    <div className="app-page app-page--wide">
      <header className="page-header">
        <div>
          <h1 className="page-title">Skio shipping tiers</h1>
          <p className="page-subtitle">
            Sets the shipping fee Skio charges on specific renewal cycles,
            scoped by plan duration, subscription value, and optionally
            specific products.
          </p>
        </div>

        <div className="toolbar">
          <button
            type="button"
            onClick={() => navigate("/app/skio-shipping-tiers/new")}
            disabled={!configValid}
            className="btn btn--primary"
          >
            New Tier
          </button>
        </div>
      </header>

      {!configValid && (
        <div className="alert alert--critical" role="alert">
          {configError} Tier mutations are disabled until the stored configuration is repaired.
        </div>
      )}

      <DevErrorBanner error={actionErr} />

      <SkioShippingTiersTable tiers={config.tiers} onDelete={(tierId) => setPendingDeleteTierId(tierId)} />

      {isPending && (
        <p className="muted inline-status" aria-live="polite">
          Saving changes…
        </p>
      )}

      <ConfirmDialog
        open={Boolean(pendingDeleteTierId)}
        tone="danger"
        title="Delete Skio Shipping Tier"
        description="This removes the tier from the configuration. Subscriptions currently matching it will simply stop being adjusted on their next sync — it does not revert any shipping price Skio already has set. This cannot be undone."
        confirmLabel="Continue"
        pending={isPending}
        onClose={() => setPendingDeleteTierId(null)}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
