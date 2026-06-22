import { expect, test } from "@playwright/test";

const baseUrl = process.env.E2E_BASE_URL;

test.describe("production smoke", () => {
  test.skip(!baseUrl, "Set E2E_BASE_URL to run deployed smoke tests.");

  test("public entry point responds without a server error", async ({ request }) => {
    const response = await request.get("/");
    expect(response.status()).toBeLessThan(500);
  });

  test("webhook endpoint rejects GET", async ({ request }) => {
    const response = await request.get("/webhooks");
    expect(response.status()).toBe(405);
    expect(response.headers().allow).toContain("POST");
  });
});

test.describe("@shopify authenticated admin smoke", () => {
  test.skip(
    !baseUrl || !process.env.E2E_STORAGE_STATE,
    "Set E2E_BASE_URL and E2E_STORAGE_STATE for authenticated Shopify tests.",
  );

  test.use({ storageState: process.env.E2E_STORAGE_STATE });

  test("settings and discount management render", async ({ page }) => {
    await page.goto("/app/settings");
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();

    await page.goto("/app/discount");
    await expect(
      page.getByRole("heading", { name: "Discount management" }),
    ).toBeVisible();
  });
});
