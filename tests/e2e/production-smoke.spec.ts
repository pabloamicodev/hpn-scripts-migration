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
