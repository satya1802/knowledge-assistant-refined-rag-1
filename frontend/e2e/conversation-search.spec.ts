import { expect, request as apiRequest, test } from "@playwright/test";

// US-030-1/US-030-3: conversation search narrows the sidebar (AC-073,
// AC-074). The search box debounces its request to the server (see
// Chat.tsx's 300ms timer off `searchInput`), so every assertion here
// that follows a `fill()` waits it out with `expect(...).toPass()`/
// Playwright's auto-retrying `toBeVisible`/`toHaveCount` rather than a
// fixed sleep.
//
// A single browser session is used throughout (one signed-in user), and a
// second user is seeded only to prove their conversations never bleed into
// this user's sidebar or search results -- mirroring the isolation this
// ticket calls out explicitly.

const apiBaseURL = process.env.E2E_API_BASE_URL ?? "http://127.0.0.1:8000";

function uniqueEmail(label: string): string {
  return `${label}-${Date.now()}-${Math.floor(Math.random() * 100000)}@example.com`;
}

const ADMIN_PASSWORD = "ConvSearchAdmin123!";
const OWNER_PASSWORD = "ConvSearchOwner123!";

test.describe("Conversation search narrows the sidebar (US-030-3)", () => {
  let bootstrapBlocked = false;
  let adminEmail = "";
  let ownerEmail = "";

  test.beforeAll(async ({ request }) => {
    adminEmail = uniqueEmail("e2e-search-admin");
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

    ownerEmail = uniqueEmail("e2e-search-owner");
    const createOwner = await adminContext.post("/users", {
      data: { email: ownerEmail, password: OWNER_PASSWORD },
    });
    expect(createOwner.status()).toBe(201);

    // Seed the owner's conversations (titles only -- POST /chat calls real
    // generation, which these tests must not invoke) plus one other user's
    // conversation sharing a keyword, to prove isolation.
    const ownerContext = await apiRequest.newContext({ baseURL: apiBaseURL });
    const loginOwner = await ownerContext.post("/auth/login", {
      data: { email: ownerEmail, password: OWNER_PASSWORD },
    });
    expect(loginOwner.status()).toBe(200);

    for (const title of ["Vacation Policy Questions", "Budget Report Review"]) {
      const created = await ownerContext.post("/conversations", { data: { title } });
      expect(created.status()).toBe(201);
    }

    const otherEmail = uniqueEmail("e2e-search-other");
    const createOther = await adminContext.post("/users", {
      data: { email: otherEmail, password: OWNER_PASSWORD },
    });
    expect(createOther.status()).toBe(201);
    const otherContext = await apiRequest.newContext({ baseURL: apiBaseURL });
    const loginOther = await otherContext.post("/auth/login", {
      data: { email: otherEmail, password: OWNER_PASSWORD },
    });
    expect(loginOther.status()).toBe(200);
    const otherCreated = await otherContext.post("/conversations", {
      data: { title: "Vacation photos from another account" },
    });
    expect(otherCreated.status()).toBe(201);

    await adminContext.dispose();
    await ownerContext.dispose();
    await otherContext.dispose();
  });

  test.beforeEach(() => {
    test.skip(
      bootstrapBlocked,
      "This environment's database already has an account; the open " +
        "bootstrap endpoint (the only unauthenticated way to create a " +
        "first administrator) is no longer available to seed one.",
    );
  });

  test("typing a term narrows the sidebar to matches, clearing restores the full list, and no match shows the empty message (AC-073, AC-074)", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByLabel(/email/i).fill(ownerEmail);
    await page.getByLabel(/password/i).fill(OWNER_PASSWORD);
    await page.getByRole("button", { name: /sign in/i }).click();

    await expect(page.getByText("Vacation Policy Questions")).toBeVisible();
    await expect(page.getByText("Budget Report Review")).toBeVisible();

    const searchBox = page.getByLabel("Search conversations");
    await searchBox.fill("vacation");

    // Narrowed: only the matching title remains visible, the other is
    // gone, and the other user's matching conversation never appears.
    await expect(page.getByText("Vacation Policy Questions")).toBeVisible();
    await expect(page.getByText("Budget Report Review")).toHaveCount(0);
    await expect(page.getByText("Vacation photos from another account")).toHaveCount(0);

    // Non-matching term: the "no conversations found" message appears.
    await searchBox.fill("zzz-no-such-conversation-zzz");
    await expect(page.getByText("No conversations found")).toBeVisible();
    await expect(page.getByText("Vacation Policy Questions")).toHaveCount(0);

    // Clearing restores the full list.
    await page.getByLabel("Clear search").click();
    await expect(page.getByText("Vacation Policy Questions")).toBeVisible();
    await expect(page.getByText("Budget Report Review")).toBeVisible();
  });
});
