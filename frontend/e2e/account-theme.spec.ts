import { expect, test } from "@playwright/test";

// US-037-3: server-side theme preference on the Account page.
//
// Covers AC-083 (choosing Light then Dark switches the whole interface
// immediately), AC-084 (the choice survives a reload on a fresh browser
// context restored from the server -- not from localStorage) and AC-085
// (with System selected, an OS colour-scheme change flips the interface
// live).
//
// Each test provisions its own account through the open "first account"
// bootstrap endpoint (see users-admin-provisioning.spec.ts for why: it is
// the only unauthenticated way to create an account against this backend).
// If an earlier run already has an account seeded in this environment's
// database, that path is gone and the suite skips rather than report a
// false result.

const apiBaseURL = process.env.E2E_API_BASE_URL ?? "http://127.0.0.1:8000";

function uniqueEmail(label: string): string {
  return `${label}-${Date.now()}-${Math.floor(Math.random() * 100000)}@example.com`;
}

const PASSWORD = "AccountThemeBootstrap123!";

async function signIn(page: import("@playwright/test").Page, email: string, password: string) {
  await page.goto("/sign-in");
  await page.getByLabel(/work email/i).fill(email);
  await page.getByLabel(/^password$/i).fill(password);
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await page.waitForURL(/\/chat$/, { timeout: 15_000 });
}

async function rootBackgroundColor(page: import("@playwright/test").Page): Promise<string> {
  return page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue("--brand-background").trim(),
  );
}

test.describe("Account page theme preference", () => {
  let bootstrapBlocked = false;
  let email = "";

  test.beforeAll(async ({ request }) => {
    email = uniqueEmail("e2e-theme");
    const response = await request.post(`${apiBaseURL}/users`, {
      data: { email, password: PASSWORD },
    });
    if (response.status() === 401 || response.status() === 403) {
      bootstrapBlocked = true;
      return;
    }
    expect(response.status()).toBe(201);
  });

  test.beforeEach(() => {
    test.skip(
      bootstrapBlocked,
      "This environment's database already has an account; the open " +
        "bootstrap endpoint is no longer available to seed one.",
    );
  });

  test("selecting Light then Dark switches the interface immediately, and Dark survives a reload in a fresh context (AC-083/AC-084)", async ({
    page,
    context,
  }) => {
    await signIn(page, email, PASSWORD);
    await page.goto("/account");

    const lightRadio = page.getByRole("radio", { name: /^Light/ });
    const darkRadio = page.getByRole("radio", { name: /^Dark/ });

    await lightRadio.click();
    await expect(lightRadio).toBeChecked();
    await expect.poll(() => rootBackgroundColor(page)).toBe("#eef1f4");

    await darkRadio.click();
    await expect(darkRadio).toBeChecked();
    await expect.poll(() => rootBackgroundColor(page)).toBe("#0e1620");

    // Wait for the PATCH to actually land before moving to a fresh context.
    await expect(page.getByText(/preferences synced/i)).toBeVisible();

    // A brand-new browser context carries no localStorage or cookies from
    // `page` -- the only way this can know "dark" is by asking the server.
    const freshContext = await context.browser()!.newContext();
    const freshPage = await freshContext.newPage();
    await signIn(freshPage, email, PASSWORD);
    await freshPage.goto("/account");

    await expect(freshPage.getByRole("radio", { name: /^Dark/ })).toBeChecked();
    await expect.poll(() => rootBackgroundColor(freshPage)).toBe("#0e1620");

    await freshContext.close();
  });

  test("with System selected, an OS colour-scheme change flips the interface live (AC-085)", async ({
    page,
  }) => {
    await signIn(page, email, PASSWORD);
    await page.goto("/account");

    const systemRadio = page.getByRole("radio", { name: /^System/ });
    await systemRadio.click();
    await expect(systemRadio).toBeChecked();

    await page.emulateMedia({ colorScheme: "light" });
    await expect.poll(() => rootBackgroundColor(page)).toBe("#eef1f4");

    await page.emulateMedia({ colorScheme: "dark" });
    await expect.poll(() => rootBackgroundColor(page)).toBe("#0e1620");
  });
});
