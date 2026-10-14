import { expect, request as apiRequest, test } from "@playwright/test";

// US-030-2/US-030-3: deliberate delete with confirmation (AC-077, AC-078,
// AC-079). Delete requires an explicit Confirm click; Cancel leaves the
// row in place; Confirm removes it; and the removal survives a page
// reload (proving it is a real server-side delete, not merely client
// state), while every other conversation of the same user remains.
//
// Conversations are seeded via the API (titles only -- POST /chat invokes
// real generation, which this suite must not call) so the test only has
// to exercise the delete affordance itself through the UI.

const apiBaseURL = process.env.E2E_API_BASE_URL ?? "http://127.0.0.1:8000";

function uniqueEmail(label: string): string {
  return `${label}-${Date.now()}-${Math.floor(Math.random() * 100000)}@example.com`;
}

const ADMIN_PASSWORD = "ConvDeleteAdmin123!";
const OWNER_PASSWORD = "ConvDeleteOwner123!";

test.describe("Conversation delete requires confirmation (US-030-3)", () => {
  let bootstrapBlocked = false;
  let ownerEmail = "";

  test.beforeAll(async ({ request }) => {
    const adminEmail = uniqueEmail("e2e-delete-admin");
    const response = await request.post(`${apiBaseURL}/users`, {
      data: { email: adminEmail, password: ADMIN_PASSWORD },
    });
    if (response.status() === 401 || response.status() === 403) {
      bootstrapBlocked = true;
      return;
    }
    expect(response.status()).toBe(201);

    const adminContext = await apiRequest.newContext({ baseURL: apiBaseURL });
    const loginAdmin = await adminContext.post("/auth/login", {
      data: { email: adminEmail, password: ADMIN_PASSWORD },
    });
    expect(loginAdmin.status()).toBe(200);

    ownerEmail = uniqueEmail("e2e-delete-owner");
    const createOwner = await adminContext.post("/users", {
      data: { email: ownerEmail, password: OWNER_PASSWORD },
    });
    expect(createOwner.status()).toBe(201);

    await adminContext.dispose();
  });

  test.beforeEach(() => {
    test.skip(
      bootstrapBlocked,
      "This environment's database already has an account; the open " +
        "bootstrap endpoint (the only unauthenticated way to create a " +
        "first administrator) is no longer available to seed one.",
    );
  });

  test("Cancel leaves the row present, Confirm removes it, and it stays gone (with the others intact) after a reload (AC-077, AC-078, AC-079)", async ({
    page,
  }) => {
    const ownerContext = await apiRequest.newContext({ baseURL: apiBaseURL });
    const loginOwner = await ownerContext.post("/auth/login", {
      data: { email: ownerEmail, password: OWNER_PASSWORD },
    });
    expect(loginOwner.status()).toBe(200);

    for (const title of ["Conversation to delete", "Conversation to keep one", "Conversation to keep two"]) {
      const created = await ownerContext.post("/conversations", { data: { title } });
      expect(created.status()).toBe(201);
    }
    await ownerContext.dispose();

    await page.goto("/");
    await page.getByLabel(/email/i).fill(ownerEmail);
    await page.getByLabel(/password/i).fill(OWNER_PASSWORD);
    await page.getByRole("button", { name: /sign in/i }).click();

    await expect(page.getByText("Conversation to delete")).toBeVisible();
    await expect(page.getByText("Conversation to keep one")).toBeVisible();
    await expect(page.getByText("Conversation to keep two")).toBeVisible();

    // Open the delete affordance -- confirmation required, row untouched
    // until Confirm is clicked.
    await page.getByRole("button", { name: "Delete Conversation to delete" }).click();
    await expect(page.getByText('Delete "Conversation to delete"? This cannot be undone.')).toBeVisible();

    // Cancel: the row is still present, nothing was deleted.
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByText("Conversation to delete")).toBeVisible();

    // Confirm: the row is removed from the sidebar.
    await page.getByRole("button", { name: "Delete Conversation to delete" }).click();
    await page.getByRole("button", { name: "Confirm" }).click();
    await expect(page.getByText("Conversation to delete")).toHaveCount(0);
    await expect(page.getByText("Conversation to keep one")).toBeVisible();
    await expect(page.getByText("Conversation to keep two")).toBeVisible();

    // Reload: the deletion is real (server-side), and the others remain.
    await page.reload();
    await expect(page.getByText("Conversation to keep one")).toBeVisible();
    await expect(page.getByText("Conversation to delete")).toHaveCount(0);
    await expect(page.getByText("Conversation to keep two")).toBeVisible();
  });
});
