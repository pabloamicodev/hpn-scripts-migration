import { useState } from "react";
import { useLoaderData, useNavigate } from "react-router";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { authenticate } from "~/shopify.server";
import {
  loadActiveDiscount,
  saveConfig,
  upsertRule,
  validateRuleReferences,
} from "~/lib/hpnPromoConfig.server";
import { makeGraphqlProxy } from "~/lib/graphqlProxy.server";
import { hpnPromoRuleSchema, type HpnPromoRule } from "~/lib/validations";
import {
  actionError,
  loaderError,
  shopifyUserErrors,
} from "~/lib/actionError.server";
import type { ActionError } from "~/lib/actionError.server";
import { PromoRuleForm } from "~/components/PromoRuleForm";

export async function loader({ request, params }: LoaderFunctionArgs) {
  try {
    const { admin } = await authenticate.admin(request);
    const proxy = makeGraphqlProxy(admin);
    const loaded = await loadActiveDiscount(proxy);

    const rule = loaded.config.rules.find((r) => r.id === params.id);

    if (!rule) {
      throw new Response(`Rule "${params.id}" not found`, { status: 404 });
    }

    return { rule, discountId: loaded.discountId };
  } catch (err) {
    if (err instanceof Response) throw err;
    loaderError("Failed to load rule editor", {
      operation: "loadEditRule",
      cause: err,
      hint: `Rule ID: "${params.id}". Check that the discount metafield is valid JSON.`,
    });
  }
}

export async function action({ request, params }: ActionFunctionArgs) {
  try {
    const { admin } = await authenticate.admin(request);
    const proxy = makeGraphqlProxy(admin);

    const loaded = await loadActiveDiscount(proxy);

    if (!loaded.discountId) {
      return actionError("No active discount found", {
        operation: "updateRule",
        details: ["The automatic app discount has not been created yet."],
        hint: "Go to Discount management and create the discount before editing rules.",
      });
    }

    const body = await request.text();
    let rule: HpnPromoRule;

    try {
      const parsed = hpnPromoRuleSchema.safeParse(JSON.parse(body));
      if (!parsed.success) {
        return actionError("Rule validation failed", {
          operation: "updateRule",
          details: parsed.error.issues.map((i) => `${i.path.join(".") || "field"}: ${i.message}`),
          hint: "Check all required fields and value ranges.",
        });
      }
      rule = parsed.data;
    } catch {
      return actionError("Invalid rule payload", {
        operation: "updateRule",
        details: ["The request body could not be parsed as JSON."],
        hint: "This is likely a client-side serialization bug — check PromoRuleForm.handleSubmit.",
      });
    }

    if (rule.id !== params.id) {
      return actionError("Rule ID mismatch", {
        operation: "updateRule",
        details: [`Expected ID "${params.id}", got "${rule.id}"`],
        hint: "The URL param and the rule payload must have the same ID.",
      });
    }

    const referenceErrors = await validateRuleReferences(proxy, rule);
    if (referenceErrors.length > 0) {
      return actionError("Product or variant references are invalid", {
        operation: "updateRule",
        details: referenceErrors,
        hint: "Verify that all product/variant IDs exist in this store and the Shopify Products API is accessible.",
      });
    }

    const result = await saveConfig(proxy, loaded.discountId, loaded.config, (c) => upsertRule(c, rule));

    if (result.userErrors.length) {
      return actionError("Shopify rejected the rule save", {
        operation: "updateRule",
        details: shopifyUserErrors(result.userErrors),
        hint: `Discount ID: ${loaded.discountId}`,
      });
    }

    return redirect("/app/promos");
  } catch (err) {
    return actionError("Unexpected server error while updating rule", {
      operation: "updateRule",
      cause: err,
      hint: "Check Vercel function logs for the full stack trace.",
    });
  }
}

export default function EditPromoPage() {
  const { rule } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const [submissionError, setSubmissionError] = useState<ActionError | null>(null);

  function handleSubmit(updatedRule: HpnPromoRule) {
    setSubmissionError(null);
    fetch(`/app/promos/${updatedRule.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updatedRule),
    }).then(async (res) => {
      if (res.redirected) {
        navigate("/app/promos");
        return;
      }

      const contentType = res.headers.get("content-type") ?? "";
      const data = contentType.includes("application/json")
        ? await res.json()
        : null;

      if (data?.error) {
        setSubmissionError(data.error as ActionError);
      } else if (res.ok) {
        navigate("/app/promos");
      } else {
        setSubmissionError({
          message: "The promo rule could not be saved. Review the form and try again.",
          operation: "updateRule",
          details: [`HTTP ${res.status} — ${res.statusText}`],
          timestamp: new Date().toISOString(),
        });
      }
    }).catch((err) => {
      setSubmissionError({
        message: "The promo rule could not be saved. Check your connection and try again.",
        operation: "updateRule",
        details: [err instanceof Error ? err.message : String(err)],
        timestamp: new Date().toISOString(),
      });
    });
  }

  return (
    <div className="app-page">
      <button
        type="button"
        onClick={() => navigate("/app/promos")}
        className="btn btn--plain"
      >
        Back to Promos
      </button>

      <PromoRuleForm
        defaultValues={rule}
        submissionError={submissionError}
        onSubmit={handleSubmit}
        onCancel={() => navigate("/app/promos")}
      />
    </div>
  );
}
