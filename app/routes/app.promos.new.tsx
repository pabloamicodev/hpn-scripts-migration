import { useState } from "react";
import { useNavigate } from "react-router";
import type { ActionFunctionArgs } from "react-router";
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
  shopifyUserErrors,
} from "~/lib/actionError.server";
import type { ActionError } from "~/lib/actionError.server";
import { PromoRuleForm } from "~/components/PromoRuleForm";

export async function action({ request }: ActionFunctionArgs) {
  try {
    const { admin } = await authenticate.admin(request);
    const proxy = makeGraphqlProxy(admin);

    const loaded = await loadActiveDiscount(proxy);

    if (!loaded.discountId) {
      return actionError("No active discount found", {
        operation: "createRule",
        details: ["The automatic app discount has not been created yet."],
        hint: "Go to Discount management and create the discount before adding rules.",
      });
    }

    const body = await request.text();
    let rule: HpnPromoRule;

    try {
      const parsed = hpnPromoRuleSchema.safeParse(JSON.parse(body));
      if (!parsed.success) {
        return actionError("Rule validation failed", {
          operation: "createRule",
          details: parsed.error.issues.map((i) => `${i.path.join(".") || "field"}: ${i.message}`),
          hint: "Check all required fields and value ranges.",
        });
      }
      rule = parsed.data;
    } catch {
      return actionError("Invalid rule payload", {
        operation: "createRule",
        details: ["The request body could not be parsed as JSON."],
        hint: "This is likely a client-side serialization bug — check PromoRuleForm.handleSubmit.",
      });
    }

    if (loaded.config.rules.some((r) => r.id === rule.id)) {
      return actionError("Rule ID already exists", {
        operation: "createRule",
        details: [`A rule with ID "${rule.id}" already exists.`],
        hint: "Edit the existing rule from the promos list instead of creating a new one.",
      });
    }

    const referenceErrors = await validateRuleReferences(proxy, rule);
    if (referenceErrors.length > 0) {
      return actionError("Product or variant references are invalid", {
        operation: "createRule",
        details: referenceErrors,
        hint: "Verify that all product/variant IDs exist in this store and the Shopify Products API is accessible.",
      });
    }

    const result = await saveConfig(proxy, loaded.discountId, loaded.config, (c) => upsertRule(c, rule));

    if (result.userErrors.length) {
      return actionError("Shopify rejected the rule save", {
        operation: "createRule",
        details: shopifyUserErrors(result.userErrors),
        hint: `Discount ID: ${loaded.discountId}`,
      });
    }

    return redirect("/app/promos");
  } catch (err) {
    return actionError("Unexpected server error while creating rule", {
      operation: "createRule",
      cause: err,
      hint: "Check Vercel function logs for the full stack trace.",
    });
  }
}

export default function NewPromoPage() {
  const navigate = useNavigate();
  const [submissionError, setSubmissionError] = useState<ActionError | null>(null);

  function handleSubmit(rule: HpnPromoRule) {
    setSubmissionError(null);
    fetch("/app/promos/new", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(rule),
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
          operation: "createRule",
          details: [`HTTP ${res.status} — ${res.statusText}`],
          timestamp: new Date().toISOString(),
        });
      }
    }).catch((err) => {
      setSubmissionError({
        message: "The promo rule could not be saved. Check your connection and try again.",
        operation: "createRule",
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
        submissionError={submissionError}
        onSubmit={handleSubmit}
        onCancel={() => navigate("/app/promos")}
      />
    </div>
  );
}
