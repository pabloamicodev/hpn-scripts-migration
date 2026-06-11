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
  type GraphQLProxy,
} from "~/lib/hpnPromoConfig.server";
import { hpnPromoRuleSchema, type HpnPromoRule } from "~/lib/validations";
import { PromoRuleForm } from "~/components/PromoRuleForm";

function makeProxy(admin: any): GraphQLProxy {
  return async (q: string, v?: Record<string, unknown>) => {
    const res = await admin.graphql(q, { variables: v });
    return res.json();
  };
}

export async function action({ request }: ActionFunctionArgs) {
  const { admin } = await authenticate.admin(request);
  const proxy = makeProxy(admin);

  const loaded = await loadActiveDiscount(proxy);

  if (!loaded.discountId) {
    return { error: "No active discount found. Create one first from the Discount page." };
  }

  const body = await request.text();
  let rule: HpnPromoRule;

  try {
    const parsed = hpnPromoRuleSchema.safeParse(JSON.parse(body));
    if (!parsed.success) {
      return { error: parsed.error.issues.map((i) => i.message).join(", ") };
    }
    rule = parsed.data;
  } catch {
    return { error: "Invalid rule data." };
  }

  const already = loaded.config.rules.some((r) => r.id === rule.id);
  if (already) {
    return { error: `Rule "${rule.id}" already exists. Edit it from the promos list instead.` };
  }

  const referenceErrors = await validateRuleReferences(proxy, rule);
  if (referenceErrors.length > 0) {
    return { error: referenceErrors.join("\n") };
  }

  const result = await saveConfig(proxy, loaded.discountId, (c) => upsertRule(c, rule));

  if (result.userErrors.length) {
    return { error: result.userErrors.map((e) => e.message).join(", ") };
  }

  return redirect("/app/promos");
}

export default function NewPromoPage() {
  const navigate = useNavigate();
  const [submissionError, setSubmissionError] = useState<string | null>(null);

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
        setSubmissionError(data.error);
      } else if (res.ok) {
        navigate("/app/promos");
      } else {
        setSubmissionError("The promo rule could not be saved. Review the form and try again.");
      }
    }).catch(() => {
      setSubmissionError("The promo rule could not be saved. Check your connection and try again.");
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
