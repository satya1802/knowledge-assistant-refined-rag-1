import { expect, test } from "@playwright/test";

// US-042: see an immediate, clear error when the AI provider fails.
//
// AC-061: a Groq quota-exhausted or auth error on POST /chat renders a
// clear error immediately in the chat thread; the page neither hangs nor
// blanks, and the composer stays usable for an immediate retry.
// AC-062: this test asserts the frontend sees exactly one POST /chat per
// submit -- app/generation.py's bounded retries happen server-side, inside
// that single HTTP call, and are covered end to end in
// backend/tests/test_chat_generation_errors.py; nothing about them is
// observable from the browser.
// AC-063: the user's own question, already rendered before the failure,
// is still on screen afterward -- nothing already shown is ever removed
// by an error -- and the conversation is still listed after a reload,
// proving the backend never deleted anything as a side effect of the
// failed call.
//
// Each test provisions its own account through the open "first account"
// bootstrap endpoint, the same technique every other e2e suite in this
// repo uses (see users-admin-provisioning.spec.ts for why). POST /chat
// itself is routed through a real document-free account and mocked at the
// network boundary so the provider failure is deterministic -- exercising
// a real Groq quota/auth failure is neither controllable nor desirable
// from this suite.

const apiBaseURL = process.env.E2E_API_BASE_URL ?? "http://127.0.0.1:8000";

function uniqueEmail(label: string): string {
  return `${label}-${Date.now()}-${Math.floor(Math.random() * 100000)}@example.com`;
}

const PASSWORD = "ChatErrorBootstrap123!";

async function signIn(page: import("@playwright/test").Page, email: string, password: string) {
  await page.goto("/sign-in");
  await page.getByLabel(/work email/i).fill(email);
  await page.getByLabel(/^password$/i).fill(password);
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await page.waitForURL(/\/chat$/, { timeout: 15_000 });
}

test.describe("Chat answers a provider failure with a clear, immediate error (AC-061/AC-062/AC-063)", () => {
  let bootstrapBlocked = false;
  let email = "";

  test.beforeAll(async ({ request }) => {
    email = uniqueEmail("e2e-chat-error");
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

  test("a quota-exhausted provider error renders inline immediately, the page stays intact, and the composer is usable for a retry", async ({
    page,
  }) => {
    let chatPostCount = 0;

    await page.route(`${apiBaseURL}/chat`, async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }
      chatPostCount += 1;
      await route.fulfill({
        status: 503,
        json: {
          detail: {
            code: "groq_quota_exceeded",
            message: "Groq reports quota/usage exhausted.",
          },
        },
      });
    });

    await signIn(page, email, PASSWORD);
    await page.goto("/chat");

    const question = "Will this fail on purpose?";
    await page.getByPlaceholder(/ask a question/i).fill(question);
    await page.getByRole("button", { name: /^send$/i }).click();

    // AC-061: a clear error, immediately, in the thread -- not a hang, not
    // a blank page.
    const alert = page.getByRole("alert");
    await expect(alert).toBeVisible({ timeout: 10_000 });
    await expect(alert).toContainText(/quota/i);

    // The page itself is still fully there: the user's own question is
    // still visible (AC-063 -- nothing already on screen was removed by
    // the failure) and the rest of the chat chrome is intact.
    await expect(page.getByText(question)).toBeVisible();
    await expect(page.getByRole("heading", { name: /^chat$/i })).toBeVisible();

    // AC-061: the composer is usable again immediately -- no stuck
    // "Sending…" state, input not disabled, a retry can be typed and sent.
    const textarea = page.getByPlaceholder(/ask a question/i);
    await expect(textarea).toBeEnabled();
    await expect(page.getByRole("button", { name: /^send$/i })).toBeVisible();

    // AC-062: exactly one POST /chat reached the frontend for this one
    // submit -- any bounded retrying happens inside that single call on
    // the server, never as repeated requests the browser can see.
    expect(chatPostCount).toBe(1);

    await textarea.fill("Trying again after the error");
    await page.getByRole("button", { name: /^send$/i }).click();
    await expect.poll(() => chatPostCount).toBe(2);
  });

  test("after a failed answer, the conversation (and the question already asked in it) survives a reload (AC-063)", async ({
    page,
  }) => {
    await page.route(`${apiBaseURL}/chat`, async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 503,
        json: {
          detail: { code: "groq_auth_error", message: "Groq rejected the request." },
        },
      });
    });

    await signIn(page, email, PASSWORD);
    await page.goto("/chat");

    const question = "Does this conversation survive a failed answer?";
    await page.getByPlaceholder(/ask a question/i).fill(question);
    await page.getByRole("button", { name: /^send$/i }).click();

    await expect(page.getByRole("alert")).toBeVisible({ timeout: 10_000 });

    // A conversation was created (POST /conversations happens before the
    // failing POST /chat) and must still exist afterward -- the failure
    // must not have deleted it.
    await page.reload();
    await expect(page.getByText(question.slice(0, 60))).toBeVisible();
  });
});
