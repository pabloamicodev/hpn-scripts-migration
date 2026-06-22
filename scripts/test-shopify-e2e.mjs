import { chromium } from "@playwright/test";

const cdpUrl = process.env.E2E_CDP_URL ?? "http://127.0.0.1:9223";
const appHandle = process.env.E2E_SHOPIFY_APP_HANDLE ?? "hpn-scripts-migration";

const browser = await chromium.connectOverCDP(cdpUrl);

try {
  const page = browser
    .contexts()
    .flatMap((context) => context.pages())
    .find((candidate) =>
      candidate.url().includes(`/apps/${appHandle}`),
    );

  if (!page) {
    throw new Error(
      `No open Shopify Admin page was found for app "${appHandle}".`,
    );
  }

  const appFrame = page
    .frames()
    .find((frame) => frame !== page.mainFrame());

  if (!appFrame) {
    throw new Error("The embedded Shopify app iframe was not found.");
  }

  await appFrame
    .getByRole("heading", {
      name: /Dashboard|Settings|Discount management/,
    })
    .first()
    .waitFor({ state: "visible", timeout: 20_000 });
  console.log("Embedded app: pass");

  await appFrame
    .getByRole("button", { name: "Settings", exact: true })
    .click();
  await appFrame
    .getByRole("heading", { name: "Settings" })
    .waitFor({ state: "visible", timeout: 15_000 });
  console.log("Settings: pass");

  await appFrame
    .getByRole("button", { name: "Discount management", exact: true })
    .click();
  await appFrame
    .getByRole("heading", { name: "Discount management" })
    .waitFor({ state: "visible", timeout: 15_000 });
  console.log("Discount management: pass");
} finally {
  await browser.close();
}
