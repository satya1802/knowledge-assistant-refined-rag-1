import { expect, test } from "@playwright/test";

// US-013-2: Knowledge Base delete confirmation dialog.
//
// AC-028: cancelling the delete dialog deletes nothing and the row stays
// Ready. AC-029/AC-030: confirming removes the row from the table
// immediately -- no manual refresh -- and it is still absent after a full
// page reload (proving the backend, not just client state, no longer has
// it).
//
// Each test provisions its own administrator through the open "first
// account" bootstrap endpoint, the same technique knowledge-base.spec.ts
// and users-admin-provisioning.spec.ts use, and uploads one real document
// through the real backend (no route stubbing) so the delete flow exercises
// the actual DELETE /documents/{id} endpoint end to end.

const apiBaseURL = process.env.E2E_API_BASE_URL ?? "http://127.0.0.1:8000";

function uniqueEmail(label: string): string {
  return `${label}-${Date.now()}-${Math.floor(Math.random() * 100000)}@example.com`;
}

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

const ADMIN_PASSWORD = "KbDeleteBootstrap123!";

async function signIn(page: import("@playwright/test").Page, email: string, password: string) {
  await page.goto("/sign-in");
  await page.getByLabel(/work email/i).fill(email);
  await page.getByLabel(/^password$/i).fill(password);
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await page.waitForURL(/\/chat$/, { timeout: 15_000 });
}

test.describe("Knowledge Base delete confirmation (AC-028/AC-029/AC-030)", () => {
  let bootstrapBlocked = false;
  let adminEmail = "";

  test.beforeAll(async ({ request }) => {
    adminEmail = uniqueEmail("e2e-kb-del-admin");
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
        "bootstrap endpoint is no longer available to seed one.",
    );
  });

  async function uploadRealDocument(
    page: import("@playwright/test").Page,
    filename: string,
  ): Promise<void> {
    const response = await page.request.post(`${apiBaseURL}/documents`, {
      multipart: {
        file: {
          name: filename,
          mimeType: "text/plain",
          buffer: Buffer.from("Some real uploaded body text for the delete-dialog e2e test."),
        },
      },
    });
    expect(response.status()).toBe(201);
  }

  test("cancelling the delete dialog deletes nothing and the row stays visible (AC-028)", async ({
    page,
  }) => {
    const filename = `kb-cancel-delete-${uniqueSuffix()}.txt`;
    await signIn(page, adminEmail, ADMIN_PASSWORD);
    await uploadRealDocument(page, filename);

    await page.goto("/knowledge-base");
    const row = page.getByRole("row").filter({ hasText: filename });
    await expect(row).toBeVisible();

    await row.getByRole("button", { name: /^delete$/i }).click();
    const dialog = page.getByRole("dialog", { name: /delete this document/i });
    await expect(dialog).toBeVisible();

    await dialog.getByRole("button", { name: /^cancel$/i }).click();
    await expect(dialog).toBeHidden();

    // Still present client-side, and a reload proves the backend never
    // deleted it either -- cancelling must be a pure no-op.
    await expect(row).toBeVisible();
    await page.reload();
    await expect(page.getByRole("row").filter({ hasText: filename })).toBeVisible();

    const listing = await page.request.get(`${apiBaseURL}/documents`);
    const ids = (await listing.json()) as Array<{ filename: string }>;
    expect(ids.some((d) => d.filename === filename)).toBe(true);
  });

  test("confirming the delete dialog removes the row immediately with no manual refresh, and it stays absent after reload (AC-029/AC-030)", async ({
    page,
  }) => {
    const filename = `kb-confirm-delete-${uniqueSuffix()}.txt`;
    await signIn(page, adminEmail, ADMIN_PASSWORD);
    await uploadRealDocument(page, filename);

    await page.goto("/knowledge-base");
    const row = page.getByRole("row").filter({ hasText: filename });
    await expect(row).toBeVisible();

    await row.getByRole("button", { name: /^delete$/i }).click();
    const dialog = page.getByRole("dialog", { name: /delete this document/i });
    await expect(dialog).toBeVisible();

    await dialog.getByRole("button", { name: /^delete$/i }).click();
    await expect(dialog).toBeHidden();

    // AC-029: gone from the table with no manual page refresh triggered by
    // this test -- the screen's own post-delete reload is what did this.
    await expect(page.getByRole("row").filter({ hasText: filename })).toHaveCount(0);

    // AC-030: still absent after a full reload -- proof it is gone from
    // the backend, not merely removed from in-memory UI state.
    await page.reload();
    await expect(page.getByRole("row").filter({ hasText: filename })).toHaveCount(0);

    const listing = await page.request.get(`${apiBaseURL}/documents`);
    const ids = (await listing.json()) as Array<{ filename: string }>;
    expect(ids.some((d) => d.filename === filename)).toBe(false);
  });
});
