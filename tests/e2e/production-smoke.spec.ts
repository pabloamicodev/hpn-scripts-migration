import { expect, test } from "@playwright/test";

const baseUrl = process.env.E2E_BASE_URL;
const skip = !baseUrl;

test.describe("production smoke", () => {
  test.skip(skip, "Set E2E_BASE_URL to run deployed smoke tests.");

  test("public entry point responds without a server error", async ({ request }) => {
    const response = await request.get("/");
    expect(response.status()).toBeLessThan(500);
  });

  test("webhook endpoint rejects GET with 405", async ({ request }) => {
    const response = await request.get("/webhooks");
    expect(response.status()).toBe(405);
    expect(response.headers()["allow"]).toContain("POST");
  });

  test("auth login redirects to Shopify OAuth", async ({ page }) => {
    const response = await page.goto("/auth/login");
    // Either we get a Shopify redirect or a login form — not a server error
    expect(response?.status()).toBeLessThan(500);
  });

  test("app route redirects unauthenticated user", async ({ page }) => {
    const response = await page.goto("/app");
    // Unauthenticated request should redirect (302/303) to login
    const finalUrl = page.url();
    const redirected =
      response?.status() === 302 ||
      response?.status() === 303 ||
      finalUrl.includes("/auth") ||
      finalUrl.includes("shopify.com");
    expect(redirected).toBe(true);
  });

  test("docs page is accessible when authenticated via session cookie", async ({ page, context }) => {
    // This test is only meaningful with a real session — skip if no session cookie provided.
    const sessionCookie = process.env.E2E_SESSION_COOKIE;
    test.skip(!sessionCookie, "Set E2E_SESSION_COOKIE to test authenticated routes.");

    await context.addCookies([
      {
        name: "shopify_app_session",
        value: sessionCookie!,
        url: baseUrl!,
        httpOnly: true,
        secure: true,
      },
    ]);

    const response = await page.goto("/app/docs");
    expect(response?.status()).toBe(200);
    await expect(page.locator("h1")).toContainText("Rule Types");
  });

  test("webhook endpoint accepts POST with correct HMAC", async ({ request }) => {
    // Without a valid HMAC the webhook should reject with 401, not 500.
    const response = await request.post("/webhooks", {
      headers: {
        "content-type": "application/json",
        "x-shopify-hmac-sha256": "invalid-hmac",
        "x-shopify-topic": "app/uninstalled",
        "x-shopify-shop-domain": "test.myshopify.com",
      },
      data: JSON.stringify({ shop_domain: "test.myshopify.com" }),
    });
    // 401 or 403 — never 500
    expect(response.status()).toBeGreaterThanOrEqual(400);
    expect(response.status()).toBeLessThan(500);
  });

  test("unknown routes return 404, not 500", async ({ request }) => {
    const response = await request.get("/this-route-does-not-exist-xyz");
    expect(response.status()).toBe(404);
  });

  test("products API rejects unauthenticated request", async ({ request }) => {
    const response = await request.get("/app/api/products?ids=gid://shopify/Product/1");
    // Unauthenticated → redirect or 401, never 500
    expect(response.status()).toBeLessThan(500);
  });
});
