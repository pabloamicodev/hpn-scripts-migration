import { useNavigate } from "react-router";
import type { ActionFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { authenticate } from "~/shopify.server";
import {
  loadActiveDiscount,
  saveConfig,
  upsertRule,
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

  const result = await saveConfig(proxy, loaded.discountId, (c) => upsertRule(c, rule));

  if (result.userErrors.length) {
    return { error: result.userErrors.map((e) => e.message).join(", ") };
  }

  return redirect("/app/promos");
}

export default function NewPromoPage() {
  const navigate = useNavigate();

  function handleSubmit(rule: HpnPromoRule) {
    fetch("/app/promos/new", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(rule),
    }).then(async (res) => {
      const data = await res.json();
      if (data?.error) {
        alert(data.error);
      } else {
        navigate("/app/promos");
      }
    });
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => navigate("/app/promos")}
        style={{
          background: "none",
          border: "none",
          color: "#4b5563",
          cursor: "pointer",
          fontSize: "0.875rem",
          marginBottom: "1rem",
          padding: 0,
        }}
      >
        ← Back to Promos
      </button>

      <PromoRuleForm
        onSubmit={handleSubmit}
        onCancel={() => navigate("/app/promos")}
      />
    </div>
  );
}
