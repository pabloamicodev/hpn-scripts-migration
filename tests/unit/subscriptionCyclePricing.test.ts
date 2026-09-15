import { describe, expect, it } from "vitest";
import {
  cycleDiscountValueSchema,
  subscriptionCyclePricingPlanInputSchema,
  type SubscriptionCyclePricingPlanInput,
} from "../../app/lib/subscriptionCyclePricing";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const P = (n: number) => `gid://shopify/Product/${n}`;

function ok<T>(schema: { safeParse: (v: unknown) => { success: boolean; data?: T } }, value: unknown): T {
  const result = schema.safeParse(value);
  expect(result.success, JSON.stringify(value)).toBe(true);
  return result.data as T;
}

function fail(schema: { safeParse: (v: unknown) => { success: boolean; error?: unknown } }, value: unknown) {
  const result = schema.safeParse(value);
  expect(result.success, JSON.stringify(value)).toBe(false);
  return result;
}

function validPlan(overrides: Partial<SubscriptionCyclePricingPlanInput> = {}): unknown {
  return {
    name: "3-month subscription",
    intervalUnit: "MONTH",
    intervalCount: 1,
    totalCycles: 3,
    firstCycleDiscount: { type: "percentage", value: 0 },
    recurringDiscount: { type: "fixed_amount", value: 2 },
    productIds: [P(1)],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// cycleDiscountValueSchema
// ---------------------------------------------------------------------------

describe("cycleDiscountValueSchema", () => {
  it("accepts 0% (full price)", () => {
    ok(cycleDiscountValueSchema, { type: "percentage", value: 0 });
  });

  it("accepts exactly 100%", () => {
    ok(cycleDiscountValueSchema, { type: "percentage", value: 100 });
  });

  it("rejects percentage over 100", () => {
    fail(cycleDiscountValueSchema, { type: "percentage", value: 100.01 });
  });

  it("rejects negative percentage", () => {
    fail(cycleDiscountValueSchema, { type: "percentage", value: -1 });
  });

  it("allows a fixed_amount value over 100 (not a percentage, no ceiling)", () => {
    ok(cycleDiscountValueSchema, { type: "fixed_amount", value: 500 });
  });

  it("rejects negative fixed_amount", () => {
    fail(cycleDiscountValueSchema, { type: "fixed_amount", value: -0.01 });
  });

  it("accepts fixed_amount of exactly 0", () => {
    ok(cycleDiscountValueSchema, { type: "fixed_amount", value: 0 });
  });

  it("rejects an unrecognized discount type", () => {
    fail(cycleDiscountValueSchema, { type: "PERCENTAGE", value: 10 });
    fail(cycleDiscountValueSchema, { type: "dollars", value: 10 });
  });

  it("rejects NaN and Infinity values", () => {
    fail(cycleDiscountValueSchema, { type: "percentage", value: NaN });
    fail(cycleDiscountValueSchema, { type: "fixed_amount", value: Infinity });
    fail(cycleDiscountValueSchema, { type: "fixed_amount", value: -Infinity });
  });

  it("rejects a value passed as a string", () => {
    fail(cycleDiscountValueSchema, { type: "percentage", value: "10" });
  });

  it("rejects a missing value field", () => {
    fail(cycleDiscountValueSchema, { type: "percentage" });
  });
});

// ---------------------------------------------------------------------------
// subscriptionCyclePricingPlanInputSchema
// ---------------------------------------------------------------------------

describe("subscriptionCyclePricingPlanInputSchema", () => {
  it("accepts a minimal valid plan", () => {
    ok(subscriptionCyclePricingPlanInputSchema, validPlan());
  });

  it("accepts every SellingPlanInterval value", () => {
    for (const intervalUnit of ["DAY", "WEEK", "MONTH", "YEAR"]) {
      ok(subscriptionCyclePricingPlanInputSchema, validPlan({ intervalUnit }));
    }
  });

  it("rejects an interval unit outside the enum", () => {
    fail(subscriptionCyclePricingPlanInputSchema, validPlan({ intervalUnit: "FORTNIGHT" }));
    fail(subscriptionCyclePricingPlanInputSchema, validPlan({ intervalUnit: "month" }));
  });

  it("trims the name and rejects a whitespace-only name", () => {
    const parsed = ok(subscriptionCyclePricingPlanInputSchema, validPlan({ name: "  Foo  " }));
    expect(parsed.name).toBe("Foo");

    fail(subscriptionCyclePricingPlanInputSchema, validPlan({ name: "   " }));
    fail(subscriptionCyclePricingPlanInputSchema, validPlan({ name: "" }));
  });

  it("rejects a zero or negative intervalCount", () => {
    fail(subscriptionCyclePricingPlanInputSchema, validPlan({ intervalCount: 0 }));
    fail(subscriptionCyclePricingPlanInputSchema, validPlan({ intervalCount: -1 }));
  });

  it("rejects a non-integer intervalCount", () => {
    fail(subscriptionCyclePricingPlanInputSchema, validPlan({ intervalCount: 1.5 }));
  });

  it("rejects a zero or negative totalCycles", () => {
    fail(subscriptionCyclePricingPlanInputSchema, validPlan({ totalCycles: 0 }));
    fail(subscriptionCyclePricingPlanInputSchema, validPlan({ totalCycles: -3 }));
  });

  it("allows totalCycles of 1 — a degenerate but valid one-shipment plan", () => {
    // The recurring (2nd-cycle-onward) discount is inert in this case since
    // the contract ends after cycle 1 (maxCycles: 1) — that's an intentional
    // allowance, not a bug, so lock the behavior in rather than restrict it.
    ok(subscriptionCyclePricingPlanInputSchema, validPlan({ totalCycles: 1 }));
  });

  it("rejects an empty productIds array", () => {
    fail(subscriptionCyclePricingPlanInputSchema, validPlan({ productIds: [] }));
  });

  it("accepts multiple distinct productIds", () => {
    ok(subscriptionCyclePricingPlanInputSchema, validPlan({ productIds: [P(1), P(2), P(3)] }));
  });

  it("rejects duplicate productIds", () => {
    const result = fail(subscriptionCyclePricingPlanInputSchema, validPlan({ productIds: [P(1), P(2), P(1)] }));
    expect(JSON.stringify(result.error)).toMatch(/Duplicate product/);
  });

  it("rejects a productId in the wrong GID namespace", () => {
    fail(subscriptionCyclePricingPlanInputSchema, validPlan({ productIds: ["gid://shopify/ProductVariant/1"] }));
    fail(subscriptionCyclePricingPlanInputSchema, validPlan({ productIds: ["123"] }));
    fail(subscriptionCyclePricingPlanInputSchema, validPlan({ productIds: [""] }));
  });

  it("rejects missing required fields", () => {
    fail(subscriptionCyclePricingPlanInputSchema, {});
    const plan = validPlan() as Record<string, unknown>;
    for (const key of Object.keys(plan)) {
      const { [key]: _omit, ...rest } = plan;
      fail(subscriptionCyclePricingPlanInputSchema, rest);
    }
  });

  it("strips unknown extra fields instead of rejecting them", () => {
    const parsed = ok(
      subscriptionCyclePricingPlanInputSchema,
      validPlan({ unexpectedField: "should be dropped" } as never),
    );
    expect(parsed).not.toHaveProperty("unexpectedField");
  });

  it("rejects a firstCycleDiscount percentage over 100", () => {
    fail(
      subscriptionCyclePricingPlanInputSchema,
      validPlan({ firstCycleDiscount: { type: "percentage", value: 150 } }),
    );
  });

  it("rejects a recurringDiscount with a negative fixed amount", () => {
    fail(
      subscriptionCyclePricingPlanInputSchema,
      validPlan({ recurringDiscount: { type: "fixed_amount", value: -2 } }),
    );
  });
});
