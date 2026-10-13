import { expect, test } from "@playwright/test";

// US-008-3: Knowledge Base document table is fetched from the real API
// (AC-036), client-side format/size validation on upload shows the right
// message (AC-016/AC-017), and the role boundary hides every
// document-management control from a standard user (AC-018).
//
// Each test provisions its own administrator through the open "first
// account" bootstrap endpoint (see users-admin-provisioning.spec.ts for
// why: it is the only unauthenticated way to create an account against
// this backend). If an earlier run already has an account seeded in this
// environment's database, that path is gone and the suite skips rather
// than report a false result.

const apiBaseURL = process.env.E2E_API_BASE_URL ?? "http://127.0.0.1:8000";

function uniqueEmail(label: string): string {
  return `${label}-${Date.now()}-${Math.floor(Math.random() * 100000)}@example.com`;
}

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

const ADMIN_PASSWORD = "KbBootstrap123!";

async function signIn(page: import("@playwright/test").Page, email: string, password: string) {
  await page.goto("/sign-in");
  await page.getByLabel(/work email/i).fill(email);
  await page.getByLabel(/^password$/i).fill(password);
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await page.waitForURL(/\/chat$/, { timeout: 15_000 });
}

function stubDocumentsResponse(suffix: string) {
  const now = new Date().toISOString();
  return [
    {
      id: `qa-stub-doc-1-${suffix}`,
      filename: `QA-Stub-Alpha-${suffix}.pdf`,
      file_type: "pdf",
      size_bytes: 12_345,
      status: "ready",
      failure_reason: null,
      notes: null,
      chunk_count: 4,
      uploaded_by: "qa-stub@example.com",
      created_at: now,
    },
    {
      id: `qa-stub-doc-2-${suffix}`,
      filename: `QA-Stub-Beta-${suffix}.md`,
      file_type: "md",
      size_bytes: 678,
      status: "processing",
      failure_reason: null,
      notes: null,
      chunk_count: 0,
      uploaded_by: "qa-stub@example.com",
      created_at: now,
    },
  ];
}

test.describe("Knowledge Base document table and upload validation", () => {
  let bootstrapBlocked = false;
  let adminEmail = "";

  test.beforeAll(async ({ request }) => {
    adminEmail = uniqueEmail("e2e-kb-admin");
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

  test("admin's document table comes from a stubbed GET /documents and survives a reload (AC-036)", async ({
    page,
  }) => {
    const suffix = uniqueSuffix();
    const stub = stubDocumentsResponse(suffix);

    await page.route(`${apiBaseURL}/documents`, async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({ status: 200, json: stub });
      } else {
        await route.continue();
      }
    });

    await signIn(page, adminEmail, ADMIN_PASSWORD);
    await page.goto("/knowledge-base");

    // These filenames exist only in this test's stub, never in any
    // hard-coded seed data the screen might ship with -- their presence is
    // proof the table renders what GET /documents actually returned.
    await expect(page.getByText(stub[0].filename)).toBeVisible();
    await expect(page.getByText(stub[1].filename)).toBeVisible();

    await page.reload();

    await expect(page.getByText(stub[0].filename)).toBeVisible();
    await expect(page.getByText(stub[1].filename)).toBeVisible();
  });

  test("an oversize stubbed file shows the size-limit message and an unsupported file shows the accepted-formats message (AC-016/AC-017)", async ({
    page,
  }) => {
    await page.route(`${apiBaseURL}/documents`, async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({ status: 200, json: [] });
      } else {
        await route.continue();
      }
    });

    await signIn(page, adminEmail, ADMIN_PASSWORD);
    await page.goto("/knowledge-base");

    const fileInput = page.locator('input[type="file"]');

    // AC-017: >25 MB, generated in-memory, never committed to the repo.
    const oversizeBuffer = Buffer.alloc(25 * 1024 * 1024 + 1, "a");
    await fileInput.setInputFiles({
      name: "oversize.txt",
      mimeType: "text/plain",
      buffer: oversizeBuffer,
    });
    await expect(page.getByText(/25\s*MB/i)).toBeVisible();

    // AC-016: an unsupported extension.
    await fileInput.setInputFiles({
      name: "payload.exe",
      mimeType: "application/octet-stream",
      buffer: Buffer.from("not a real document"),
    });
    await expect(page.getByText(/pdf/i)).toBeVisible();
    await expect(page.getByText(/docx/i)).toBeVisible();
    await expect(page.getByText(/txt/i)).toBeVisible();
    await expect(page.getByText(/md/i)).toBeVisible();
  });

  test("a standard user sees no dropzone, no Browse button and no Delete action (AC-018)", async ({
    page,
    context,
  }) => {
    await page.route(`${apiBaseURL}/documents`, async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({ status: 200, json: stubDocumentsResponse(uniqueSuffix()) });
      } else {
        await route.continue();
      }
    });

    await signIn(page, adminEmail, ADMIN_PASSWORD);

    const standardEmail = uniqueEmail("e2e-kb-standard");
    const standardPassword = "KbStandard123!";
    // Created through the authenticated admin's own session cookie, the
    // only way to create a second account once bootstrap has closed.
    const createResponse = await context.request.post(`${apiBaseURL}/users`, {
      data: { email: standardEmail, password: standardPassword },
    });
    expect(createResponse.status()).toBe(201);

    await page.getByRole("button", { name: /sign out/i }).click();
    await page.waitForURL(/\/sign-in$/);

    await signIn(page, standardEmail, standardPassword);
    await page.goto("/knowledge-base");

    await expect(page.getByRole("button", { name: /browse/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /delete/i })).toHaveCount(0);
    await expect(page.getByText(/drag\s*(and|&)?\s*drop/i)).toHaveCount(0);
  });
});
