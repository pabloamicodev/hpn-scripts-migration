import { useState } from "react";
import { useLoaderData, useFetcher, useNavigate } from "react-router";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { authenticate } from "~/shopify.server";
import {
  loadActiveDiscount,
  DISCOUNT_TITLE,
} from "~/lib/hpnPromoConfig.server";
import { defaultHpnPromoConfig } from "~/lib/hpnPromoDefaults";
import {
  createAutomaticDiscount,
  activateDiscount,
  deactivateDiscount,
  deleteDiscount,
  findHpnFunctionId,
  updateAutomaticDiscount,
} from "~/lib/shopifyDiscounts.server";
import { makeGraphqlProxy } from "~/lib/graphqlProxy.server";
import {
  actionError,
  loaderError,
  shopifyUserErrors,
} from "~/lib/actionError.server";
import type { ActionError } from "~/lib/actionError.server";
import { DevErrorBanner } from "~/components/DevErrorBanner";
import { StatusBadge } from "~/components/StatusBadge";
import { ConfirmDialog } from "~/components/ConfirmDialog";
import { withDatabaseLock } from "~/lib/databaseLock.server";

export async function loader({ request }: LoaderFunctionArgs) {
  try {
    const { admin } = await authenticate.admin(request);
    const proxy = makeGraphqlProxy(admin);
    const [loaded, functionId] = await Promise.all([
      loadActiveDiscount(proxy),
      findHpnFunctionId(proxy),
    ]);
    return { ...loaded, functionId };
  } catch (err) {
    return loaderError("Failed to load discount management page", {
      operation: "loadDiscountPage",
      cause: err,
      hint: "Check that the Shopify Admin API is accessible and the session is valid.",
    });
  }
}

export async function action({ request }: ActionFunctionArgs) {
  try {
    const { admin } = await authenticate.admin(request);
    const proxy = makeGraphqlProxy(admin);
    const formData = await request.formData();
    const intent = String(formData.get("intent") ?? "");

    if (intent === "create") {
      return withDatabaseLock("hpn-discount-create", async () => {
        const existing = await loadActiveDiscount(proxy);
        if (existing.discountId) {
          return {
            ok: true,
            message: "Discount already exists; no duplicate was created.",
          };
        }

        const functionId = await findHpnFunctionId(proxy);
        if (!functionId) {
          return actionError("Shopify Function not found on this store", {
            operation: "createDiscount",
            details: ["No deployed HPN discount function could be resolved."],
            hint: "Run `shopify app deploy`, verify SHOPIFY_DISCOUNT_FUNCTION_ID, and ensure the app is installed on this store.",
          });
        }

        const result = await createAutomaticDiscount(
          proxy,
          DISCOUNT_TITLE,
          functionId,
          new Date().toISOString(),
          defaultHpnPromoConfig,
          defaultHpnPromoConfig.combinesWith,
        );

        if (result?.userErrors?.length) {
          return actionError("Shopify rejected the discount creation", {
            operation: "createDiscount",
            details: shopifyUserErrors(result.userErrors),
            hint: "Check the Shopify Admin API constraints for discountAutomaticAppCreate.",
          });
        }
        return { ok: true, message: "Discount created and activated." };
      });
    }

    const loaded = await loadActiveDiscount(proxy);

    if (!loaded.discountId) {
      return actionError("No active discount found", {
        operation: intent || "discountAction",
        details: [`Searched for title: "${DISCOUNT_TITLE}" — no results`],
        hint: "Create the discount first from this page before activating or deleting.",
      });
    }

    if (intent === "repair-config") {
      return withDatabaseLock(
        `hpn-discount-config:${loaded.discountId}`,
        async () => {
          const latest = await loadActiveDiscount(proxy);
          if (!latest.discountId) {
            return actionError("Discount disappeared before repair", {
              operation: "repairConfig",
              details: ["No automatic app discount was found under the lock."],
              hint: "Reload the page and create the discount again if necessary.",
            });
          }
          const result = await updateAutomaticDiscount(
            proxy,
            latest.discountId,
            {
              config: defaultHpnPromoConfig,
              combinesWith: defaultHpnPromoConfig.combinesWith,
            },
          );
          if (result?.userErrors?.length) {
            return actionError("Shopify rejected the configuration repair", {
              operation: "repairConfig",
              details: shopifyUserErrors(result.userErrors),
              hint: `Discount ID: ${latest.discountId}`,
            });
          }
          return {
            ok: true,
            message: "Configuration restored to validated defaults.",
          };
        },
      );
    }

    if (intent === "activate") {
      const result = await activateDiscount(proxy, loaded.discountId);
      if (result?.userErrors?.length) {
        return actionError("Shopify rejected the activation", {
          operation: "activateDiscount",
          details: shopifyUserErrors(result.userErrors),
          hint: `Discount ID: ${loaded.discountId}. The discount may already be active or in a state that prevents activation.`,
        });
      }
      return { ok: true, message: "Discount activated." };
    }

    if (intent === "deactivate") {
      const result = await deactivateDiscount(proxy, loaded.discountId);
      if (result?.userErrors?.length) {
        return actionError("Shopify rejected the deactivation", {
          operation: "deactivateDiscount",
          details: shopifyUserErrors(result.userErrors),
          hint: `Discount ID: ${loaded.discountId}`,
        });
      }
      return { ok: true, message: "Discount deactivated." };
    }

    if (intent === "delete") {
      const result = await deleteDiscount(proxy, loaded.discountId);
      if (result?.userErrors?.length) {
        return actionError("Shopify rejected the delete request", {
          operation: "deleteDiscount",
          details: shopifyUserErrors(result.userErrors),
          hint: `Discount ID: ${loaded.discountId}. You may need to deactivate it first.`,
        });
      }
      return { ok: true, message: "Discount deleted." };
    }

    return actionError("Unrecognized intent", {
      operation: "discountAction",
      details: [`Received intent: "${intent}"`],
      hint: "Expected one of: create | activate | deactivate | delete — this is likely a UI bug.",
    });
  } catch (err) {
    return actionError("Unexpected server error in discount action", {
      operation: "discountAction",
      cause: err,
      hint: "Check Vercel function logs for the full stack trace.",
    });
  }
}

export default function DiscountPage() {
  const {
    discountId,
    status,
    title,
    startsAt,
    functionId,
    config,
    configValid,
    configError,
  } =
    useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const navigate = useNavigate();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const isPending = fetcher.state !== "idle";
  const actionErr =
    fetcher.data && "error" in fetcher.data
      ? (fetcher.data.error as ActionError)
      : null;
  const actionMessage =
    fetcher.data && "message" in fetcher.data ? fetcher.data.message : null;

  const isActive = status === "ACTIVE";
  const activeRules = config.rules.filter((rule) => rule.enabled).length;
  const pausedRules = config.rules.length - activeRules;
  const discountBadgeStatus = getDiscountBadgeStatus(status);
  const startedLabel = startsAt
    ? new Date(startsAt).toLocaleString()
    : "Not created";

  return (
    <div className="app-page app-page--wide">
      <header className="page-header">
        <div>
          <h1 className="page-title">Discount management</h1>
          <p className="page-subtitle">
            Create, activate, pause, or remove the Shopify automatic app discount.
          </p>
        </div>

        <div className="toolbar">
          <StatusBadge status={discountBadgeStatus} />
          <button
            type="button"
            onClick={() => navigate("/app/promos")}
            className="btn"
          >
            Manage promos
          </button>
          <button
            type="button"
            onClick={() => navigate("/app/settings")}
            className="btn"
          >
            Settings
          </button>
        </div>
      </header>

      {!functionId && (
        <div className="alert alert--warning">
          <strong>Function Missing.</strong> Install the app on this store.
          The function is detected automatically after installation.
        </div>
      )}

      <DevErrorBanner error={actionErr} />

      {actionMessage && (
        <div className="alert alert--success">{actionMessage}</div>
      )}

      <div className="summary-grid">
        <section className="summary-tile">
          <p className="summary-tile__label">Shopify discount</p>
          <p className="summary-tile__value">
            {status ? formatDiscountStatus(status) : "Not created"}
          </p>
          <p className="summary-tile__note">
            {discountId ? "Automatic app discount" : "Create it to publish rules"}
          </p>
        </section>

        <section className="summary-tile">
          <p className="summary-tile__label">Active rules</p>
          <p className="summary-tile__value">{activeRules}</p>
          <p className="summary-tile__note">{pausedRules} paused</p>
        </section>

        <section className="summary-tile">
          <p className="summary-tile__label">Function</p>
          <p className="summary-tile__value">
            {functionId ? "Detected" : "Missing"}
          </p>
          <p className="summary-tile__note mono">
            {functionId ? functionId : "Install or deploy the function"}
          </p>
        </section>

        <section className="summary-tile">
          <p className="summary-tile__label">Started</p>
          <p className="summary-tile__value summary-tile__value--compact">
            {startedLabel}
          </p>
          <p className="summary-tile__note">Admin API source of truth</p>
        </section>
      </div>

      <div className="split-layout">
        <div className="section-grid">
          <section className="card card--raised">
            <div className="card__header">
              <div>
                <h2 className="card__title">Current discount</h2>
                <p className="card__subtitle">
                  The Shopify automatic app discount connected to this app.
                </p>
              </div>
              <StatusBadge status={discountBadgeStatus} />
            </div>

            <div className="card__body">
              {!configValid && discountId && (
                <div className="alert alert--critical" role="alert">
                  <p>{configError}</p>
                  <fetcher.Form method="post">
                    <input type="hidden" name="intent" value="repair-config" />
                    <button
                      type="submit"
                      disabled={isPending}
                      className="btn btn--warning"
                    >
                      {isPending ? "Repairing…" : "Restore validated defaults"}
                    </button>
                  </fetcher.Form>
                </div>
              )}
              {discountId ? (
                <dl className="definition-list">
                  <dt>Title</dt>
                  <dd>{title}</dd>

                  <dt>Status</dt>
                  <dd>{formatDiscountStatus(status)}</dd>

                  <dt>Started</dt>
                  <dd>{startedLabel}</dd>

                  <dt>ID</dt>
                  <dd className="mono">{discountId}</dd>
                </dl>
              ) : (
                <div className="empty-state empty-state--compact">
                  <h2>No discount exists yet</h2>
                  <p>
                    Create the automatic app discount to publish the HPN rules to
                    Shopify.
                  </p>
                </div>
              )}
            </div>
          </section>

          <section className="card">
            <div className="card__header">
              <div>
                <h2 className="card__title">Published configuration</h2>
                <p className="card__subtitle">
                  These rules are stored in the discount metafield used by the
                  Shopify Function.
                </p>
              </div>
            </div>

            <div className="card__body">
              <ul className="callout-list">
                <li>
                  <span>Rules configured</span>
                  <strong>{config.rules.length}</strong>
                </li>
                <li>
                  <span>Active rules</span>
                  <strong>{activeRules}</strong>
                </li>
                <li>
                  <span>Paused rules</span>
                  <strong>{pausedRules}</strong>
                </li>
                <li>
                  <span>Combines with order discounts</span>
                  <strong>
                    {config.combinesWith.orderDiscounts ? "Yes" : "No"}
                  </strong>
                </li>
                <li>
                  <span>Combines with product discounts</span>
                  <strong>
                    {config.combinesWith.productDiscounts ? "Yes" : "No"}
                  </strong>
                </li>
                <li>
                  <span>Combines with shipping discounts</span>
                  <strong>
                    {config.combinesWith.shippingDiscounts ? "Yes" : "No"}
                  </strong>
                </li>
              </ul>
            </div>
          </section>
        </div>

        <aside className="section-grid">
          <section className="card">
            <div className="card__header">
              <div>
                <h2 className="card__title">Discount actions</h2>
                <p className="card__subtitle">
                  Publish or pause the automatic app discount.
                </p>
              </div>
            </div>

            <div className="card__body">
              <div className="btn-stack">
                {!discountId && (
                  <fetcher.Form method="post">
                    <input type="hidden" name="intent" value="create" />
                    <button
                      type="submit"
                      disabled={isPending || !functionId}
                      className="btn btn--primary btn--full"
                    >
                      {isPending ? "Creating…" : "Create discount"}
                    </button>
                  </fetcher.Form>
                )}

                {discountId && !isActive && (
                  <fetcher.Form method="post">
                    <input type="hidden" name="intent" value="activate" />
                    <button
                      type="submit"
                      disabled={isPending}
                      className="btn btn--primary btn--full"
                    >
                      {isPending ? "Activating…" : "Activate discount"}
                    </button>
                  </fetcher.Form>
                )}

                {discountId && isActive && (
                  <fetcher.Form method="post">
                    <input type="hidden" name="intent" value="deactivate" />
                    <button
                      type="submit"
                      disabled={isPending}
                      className="btn btn--warning btn--full"
                    >
                      {isPending ? "Deactivating…" : "Deactivate discount"}
                    </button>
                  </fetcher.Form>
                )}

                <button
                  type="button"
                  onClick={() => navigate("/app/promos")}
                  className="btn btn--full"
                  disabled={!discountId || !configValid}
                >
                  Edit promo rules
                </button>
              </div>
            </div>
          </section>

          <section className="card">
            <div className="card__header">
              <div>
                <h2 className="card__title">Readiness</h2>
                <p className="card__subtitle">
                  Minimum state needed before legacy scripts are removed.
                </p>
              </div>
            </div>

            <div className="card__body">
              <ul className="detail-list">
                <li>
                  <span className="detail-list__label">Function ID</span>
                  <span className="detail-list__value">
                    {functionId ? "Detected" : "Missing"}
                  </span>
                </li>
                <li>
                  <span className="detail-list__label">Automatic discount</span>
                  <span className="detail-list__value">
                    {discountId ? "Created" : "Not created"}
                  </span>
                </li>
                <li>
                  <span className="detail-list__label">Active rules</span>
                  <span className="detail-list__value">
                    {activeRules > 0 ? `${activeRules} active` : "No active rules"}
                  </span>
                </li>
              </ul>
            </div>
          </section>

          {discountId && (
            <section className="card danger-zone">
              <div className="card__header">
                <div>
                  <h2 className="card__title">Danger zone</h2>
                  <p className="card__subtitle">
                    Deleting removes the Shopify discount and its metafield
                    configuration.
                  </p>
                </div>
              </div>

              <div className="card__body">
                <fetcher.Form method="post">
                  <input type="hidden" name="intent" value="delete" />
                  <button
                    type="button"
                    disabled={isPending}
                    className="btn btn--danger btn--full"
                    onClick={() => setDeleteDialogOpen(true)}
                  >
                    {isPending ? "Deleting…" : "Delete discount"}
                  </button>
                </fetcher.Form>
              </div>
            </section>
          )}
        </aside>
      </div>

      <ConfirmDialog
        open={deleteDialogOpen}
        title="Delete Discount"
        description="This permanently removes the Shopify discount and its metafield configuration. All published promo rules will be lost."
        confirmLabel="Delete Discount"
        pending={isPending}
        onClose={() => setDeleteDialogOpen(false)}
        onConfirm={() => {
          fetcher.submit({ intent: "delete" }, { method: "post" });
          setDeleteDialogOpen(false);
        }}
      />
    </div>
  );
}

function getDiscountBadgeStatus(
  status: "ACTIVE" | "EXPIRED" | "SCHEDULED" | null,
): "active" | "inactive" | "paused" | "error" {
  if (status === "ACTIVE") return "active";
  if (status === "SCHEDULED") return "paused";
  if (status === "EXPIRED") return "inactive";
  return "inactive";
}

function formatDiscountStatus(
  status: "ACTIVE" | "EXPIRED" | "SCHEDULED" | null,
) {
  if (!status) return "Not created";
  return status[0] + status.slice(1).toLowerCase();
}
