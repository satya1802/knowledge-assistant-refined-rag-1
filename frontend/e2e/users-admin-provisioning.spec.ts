import { expect, test } from "@playwright/test";

// US-005-3: administrator account provisioning and the role boundary.
//
// The first account on a fresh install is created unauthenticated by
// POST /users (app/routers/users.py) -- that is the only path that can
// hand this suite an administrator without already having one. It is
// seeded here through the API, not the sign-in screen's "Create the
// administrator" form: that form posts `{ email, temp_password, role }`
// (frontend/src/lib/auth.tsx `bootstrap()`), but the backend's
// CreateUserRequest only accepts `{ email, password }` -- the form can
// never succeed against this backend. See the reported defect; this
// suite routes around it so the rest of US-005-3's acceptance criteria,
// which do not depend on that screen, can still be verified.
//
// The bootstrap-admin endpoint only stays open while the `users` table is
// empty. If an earlier run (or earlier suite) already created an account
// in this environment's database, that path is gone for good and this
// suite has no way to provision a first administrator on its own -- it
// skips rather than report a false pass or a false failure.

const apiBaseURL = process.env.E2E_API_BASE_URL ?? "http://127.0.0.1:8000";

function uniqueEmail(label: string): string {
  return `${label}-${Date.now()}-${Math.floor(Math.random() * 100000)}@example.com`;
}

const ADMIN_PASSWORD = "AdminBootstrap123!";

async function signIn(page: import("@playwright/test").Page, email: string, password: string) {
  await page.goto("/sign-in");
  await page.getByLabel(/work email/i).fill(email);
  await page.getByLabel(/^password$/i).fill(password);
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await page.waitForURL(/\/chat$/, { timeout: 15_000 });
}

test.describe("Admin account provisioning and the role boundary", () => {
  let bootstrapBlocked = false;
  let adminEmail = "";

  test.beforeAll(async ({ request }) => {
    adminEmail = uniqueEmail("e2e-admin");
    const response = await request.post(`${apiBaseURL}/users`, {
      data: { email: adminEmail, password: ADMIN_PASSWORD },
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
        "bootstrap endpoint (the only unauthenticated way to create a " +
        "first administrator) is no longer available to seed one.",
    );
  });

  test("admin provisions a user, sees the temp password once, toggles access and grants admin; a standard user is shut out", async ({
    page,
  }) => {
    await signIn(page, adminEmail, ADMIN_PASSWORD);

    await page.getByRole("link", { name: /users & settings/i }).click();
    await expect(page.getByRole("heading", { name: /users & settings/i })).toBeVisible();

    // --- Create the user who will be promoted to admin -----------------
    const promotedEmail = uniqueEmail("e2e-promoted");
    await page.getByLabel(/^email$/i).fill(promotedEmail);
    await page.getByRole("button", { name: /create user/i }).click();

    await expect(page.getByTestId("temp-password")).toBeVisible();
    await expect(page.getByText(/not sent by email/i)).toBeVisible();
    const promotedPassword = (await page.getByTestId("temp-password").textContent())?.trim();
    expect(promotedPassword).toBeTruthy();

    const promotedRow = page.getByRole("row").filter({ hasText: promotedEmail });
    await expect(promotedRow).toBeVisible();

    // --- Create a second user who stays standard ------------------------
    const standardEmail = uniqueEmail("e2e-standard");
    await page.getByLabel(/^email$/i).fill(standardEmail);
    await page.getByRole("button", { name: /create user/i }).click();

    await expect(page.getByTestId("temp-password")).toBeVisible();
    const standardPassword = (await page.getByTestId("temp-password").textContent())?.trim();
    expect(standardPassword).toBeTruthy();

    // --- Toggle enable/disable on the promoted user ---------------------
    const promotedRowAfterReload = page.getByRole("row").filter({ hasText: promotedEmail });
    await promotedRowAfterReload.getByRole("button", { name: /disable/i }).click();
    await expect(promotedRowAfterReload.getByText("Disabled")).toBeVisible();
    await promotedRowAfterReload.getByRole("button", { name: /enable/i }).click();
    await expect(promotedRowAfterReload.getByText("Active")).toBeVisible();

    // --- Grant admin ------------------------------------------------------
    await promotedRowAfterReload.getByRole("button", { name: /make admin/i }).click();
    await expect(promotedRowAfterReload.getByText(/^admin$/i)).toBeVisible();

    // --- Sign out the admin, sign in as the standard user ----------------
    await page.getByRole("button", { name: /sign out/i }).click();
    await page.waitForURL(/\/sign-in$/);

    await signIn(page, standardEmail, standardPassword!);

    await expect(page.getByRole("link", { name: /users & settings/i })).toHaveCount(0);

    // Direct navigation is refused: the admin-only route sends a
    // non-admin back to /chat rather than rendering the Users screen.
    await page.goto("/users");
    await page.waitForURL(/\/chat$/, { timeout: 15_000 });
    await expect(page.getByRole("heading", { name: /users & settings/i })).toHaveCount(0);
  });
});
