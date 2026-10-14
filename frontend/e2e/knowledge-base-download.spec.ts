import { expect, test } from "@playwright/test";

// US-013-2: Knowledge Base document download (AC-027).
//
// Backend-contract bytes/filename coverage lives in
// backend/tests/test_documents_download.py. This spec only proves the
// client-side control itself: clicking "Download" on a row triggers a real
// browser file-save (Playwright's `download` event) rather than, say,
// navigating away or silently doing nothing.
//
// Follows the conventions in knowledge-base-delete.spec.ts: its own
// bootstrapped administrator, a real upload through the real backend (no
// route stubbing) so the control exercises the actual
// GET /documents/{id}/download endpoint end to end.

const apiBaseURL = process.env.E2E_API_BASE_URL ?? "http://127.0.0.1:8000";

function uniqueEmail(label: string): string {
  return `${label}-${Date.now()}-${Math.floor(Math.random() * 100000)}@example.com`;
}

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

const ADMIN_PASSWORD = "KbDownloadBootstrap123!";

async function signIn(page: import("@playwright/test").Page, email: string, password: string) {
  await page.goto("/sign-in");
  await page.getByLabel(/work email/i).fill(email);
  await page.getByLabel(/^password$/i).fill(password);
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await page.waitForURL(/\/chat$/, { timeout: 15_000 });
}

test.describe("Knowledge Base download control (AC-027)", () => {
  let bootstrapBlocked = false;
  let adminEmail = "";

  test.beforeAll(async ({ request }) => {
    adminEmail = uniqueEmail("e2e-kb-dl-admin");
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

  test("clicking Download on a row triggers a browser file save with the original filename (AC-027)", async ({
    page,
  }) => {
    const filename = `kb-download-${uniqueSuffix()}.txt`;
    await signIn(page, adminEmail, ADMIN_PASSWORD);

    const uploadResponse = await page.request.post(`${apiBaseURL}/documents`, {
      multipart: {
        file: {
          name: filename,
          mimeType: "text/plain",
          buffer: Buffer.from("Some real uploaded body text for the download e2e test."),
        },
      },
    });
    expect(uploadResponse.status()).toBe(201);

    await page.goto("/knowledge-base");
    const row = page.getByRole("row").filter({ hasText: filename });
    await expect(row).toBeVisible();

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      row.getByRole("button", { name: /^download$/i }).click(),
    ]);

    expect(download.suggestedFilename()).toBe(filename);
  });
});
