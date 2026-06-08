import { useLoaderData, useFetcher } from "react-router";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { authenticate } from "~/shopify.server";
import {
  loadActiveDiscount,
  DISCOUNT_TITLE,
  FUNCTION_ID_ENV,
} from "~/lib/hpnPromoConfig.server";
import { defaultHpnPromoConfig } from "~/lib/hpnPromoDefaults";
import {
  createAutomaticDiscount,
  activateDiscount,
  deactivateDiscount,
  deleteDiscount,
  findHpnFunctionId,
} from "~/lib/shopifyDiscounts.server";
import { StatusBadge } from "~/components/StatusBadge";

function makeProxy(admin: any) {
  return async (q: string, v?: Record<string, unknown>) => {
    const res = await admin.graphql(q, { variables: v });
    return res.json();
  };
}

export async function loader({ request }: LoaderFunctionArgs) {
  const { admin } = await authenticate.admin(request);
  const proxy = makeProxy(admin);
  const [loaded, functionId] = await Promise.all([
    loadActiveDiscount(proxy),
    findHpnFunctionId(proxy),
  ]);
  return { ...loaded, functionId };
}

export async function action({ request }: ActionFunctionArgs) {
  const { admin } = await authenticate.admin(request);
  const proxy = makeProxy(admin);

  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");

  if (intent === "create") {
    const functionId = await findHpnFunctionId(proxy);
    if (!functionId) {
      return {
        error: `No se encontró la Shopify Function. Asegurate de que la app esté instalada en esta store y que la función esté deployada.`,
      };
    }

    const startsAt = new Date().toISOString();
    const result = await createAutomaticDiscount(
      proxy,
      DISCOUNT_TITLE,
      functionId,
      startsAt,
      defaultHpnPromoConfig,
      defaultHpnPromoConfig.combinesWith
    );

    if (result?.userErrors?.length) {
      return { error: result.userErrors.map((e: any) => e.message).join(", ") };
    }
    return { ok: true, message: "Discount created and activated." };
  }

  const loaded = await loadActiveDiscount(proxy);

  if (!loaded.discountId) {
    return { error: "No active discount found." };
  }

  if (intent === "activate") {
    const result = await activateDiscount(proxy, loaded.discountId);
    if (result?.userErrors?.length) {
      return { error: result.userErrors.map((e: any) => e.message).join(", ") };
    }
    return { ok: true, message: "Discount activated." };
  }

  if (intent === "deactivate") {
    const result = await deactivateDiscount(proxy, loaded.discountId);
    if (result?.userErrors?.length) {
      return { error: result.userErrors.map((e: any) => e.message).join(", ") };
    }
    return { ok: true, message: "Discount deactivated." };
  }

  if (intent === "delete") {
    const result = await deleteDiscount(proxy, loaded.discountId);
    if (result?.userErrors?.length) {
      return { error: result.userErrors.map((e: any) => e.message).join(", ") };
    }
    return { ok: true, message: "Discount deleted." };
  }

  return { error: "Unknown action." };
}

export default function DiscountPage() {
  const { discountId, status, title, startsAt, functionId } =
    useLoaderData<typeof loader>();
  const fetcher = useFetcher();

  const isPending = fetcher.state !== "idle";
  const actionError =
    fetcher.data && "error" in fetcher.data ? fetcher.data.error : null;
  const actionMessage =
    fetcher.data && "message" in fetcher.data ? fetcher.data.message : null;

  const isActive = status === "ACTIVE";

  return (
    <div className="app-page app-page--narrow">
      <header className="page-header">
        <div>
          <h1 className="page-title">Discount management</h1>
          <p className="page-subtitle">
            Create, activate, pause, or remove the Shopify automatic app discount.
          </p>
        </div>
      </header>

      {!functionId && (
        <div className="alert alert--warning">
          <strong>Function no encontrada.</strong> Instalá la app en esta store.
          La función se detecta automáticamente una vez instalada.
        </div>
      )}

      <section className="card">
        <div className="card__body">
          <h2 className="card__title" style={{ marginBottom: "14px" }}>
            Current discount
          </h2>

        {discountId ? (
          <dl className="definition-list">
            <dt>Title</dt>
            <dd>{title}</dd>

            <dt>Status</dt>
            <dd>
              <StatusBadge status={isActive ? "active" : "inactive"} />
            </dd>

            <dt>Started</dt>
            <dd>
              {startsAt ? new Date(startsAt).toLocaleString() : "—"}
            </dd>

            <dt>ID</dt>
            <dd className="mono">
              {discountId}
            </dd>
          </dl>
        ) : (
          <p className="muted" style={{ margin: 0 }}>No discount exists yet.</p>
        )}
        </div>
      </section>

      {actionError && (
        <div className="alert alert--critical">
          {actionError}
        </div>
      )}

      {actionMessage && (
        <div className="alert alert--success">
          {actionMessage}
        </div>
      )}

      <div className="btn-stack">
        {!discountId && (
          <fetcher.Form method="post">
            <input type="hidden" name="intent" value="create" />
            <button
              type="submit"
              disabled={isPending || !functionId}
              className="btn btn--primary"
              style={{ width: "100%" }}
            >
              {isPending ? "Creating..." : "Create Discount with Default Config"}
            </button>
          </fetcher.Form>
        )}

        {discountId && !isActive && (
          <fetcher.Form method="post">
            <input type="hidden" name="intent" value="activate" />
            <button
              type="submit"
              disabled={isPending}
              className="btn btn--primary"
              style={{ width: "100%" }}
            >
              {isPending ? "Activating..." : "Activate Discount"}
            </button>
          </fetcher.Form>
        )}

        {discountId && isActive && (
          <fetcher.Form method="post">
            <input type="hidden" name="intent" value="deactivate" />
            <button
              type="submit"
              disabled={isPending}
              className="btn btn--warning"
              style={{ width: "100%" }}
            >
              {isPending ? "Deactivating..." : "Deactivate Discount"}
            </button>
          </fetcher.Form>
        )}

        {discountId && (
          <fetcher.Form
            method="post"
            onSubmit={(e) => {
              if (!window.confirm("Delete this discount permanently? All rules will be lost.")) {
                e.preventDefault();
              }
            }}
          >
            <input type="hidden" name="intent" value="delete" />
            <button
              type="submit"
              disabled={isPending}
              className="btn btn--danger"
              style={{ width: "100%" }}
            >
              {isPending ? "Deleting..." : "Delete Discount"}
            </button>
          </fetcher.Form>
        )}
      </div>
    </div>
  );
}
