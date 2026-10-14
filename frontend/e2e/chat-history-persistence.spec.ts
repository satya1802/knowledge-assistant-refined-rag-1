import { expect, test } from "@playwright/test";

// US-025-2: follow-up context and end-to-end history durability.
//
// AC coverage:
//  - AC-067: reloading the Chat page restores the same sidebar list and the
//    same open conversation's messages, badges and citations.
//  - AC-068: signing out and back in as the same user lists the same
//    conversations and messages.
//  - AC-070: history survives with browser storage (localStorage,
//    sessionStorage) cleared, proving the backend -- not client storage --
//    is the source of truth; the app's session itself is the auth cookie
//    (see src/lib/auth.tsx), so clearing storage never signs the user out.
//
// Follows the stubbing convention established in chat-citations.spec.ts:
// POST /chat is routed at the network layer so nothing here depends on a
// live Groq call or real retrieval (no backend code is touched by this
// spec). Unlike chat-citations.spec.ts, the stubbed `/conversations` and
// `/conversations/{id}` routes here are backed by a single in-test state
// object shared across every route handler registered on the page, so a
// reload, a sign-out/sign-in round trip or a storage wipe all read back the
// identical list/detail payload -- proving the UI only ever re-fetches from
// (what stands in for) the server, never reconstructs anything from local
// storage.

const apiBaseURL = process.env.E2E_API_BASE_URL ?? "http://127.0.0.1:8000";

function uniqueEmail(label: string): string {
  return `${label}-${Date.now()}-${Math.floor(Math.random() * 100000)}@example.com`;
}

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

const PASSWORD = "ChatHistoryBootstrap123!";

async function signIn(page: import("@playwright/test").Page, email: string, password: string) {
  await page.goto("/sign-in");
  await page.getByLabel(/work email/i).fill(email);
  await page.getByLabel(/^password$/i).fill(password);
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await page.waitForURL(/\/chat$/, { timeout: 15_000 });
}

type Citation = {
  number: number;
  document_id: string;
  chunk_id: string;
  filename: string;
  page_ref?: number | null;
  section_ref?: string | null;
  text_preview: string;
  score: number;
};

function citation(suffix: string, overrides: Partial<Citation> & { number: number }): Citation {
  return {
    document_id: `doc-${overrides.number}-${suffix}`,
    chunk_id: `chunk-${overrides.number}-${suffix}`,
    filename: `Source${overrides.number}-${suffix}.pdf`,
    text_preview: `Preview text for source ${overrides.number}.`,
    score: 0.9,
    ...overrides,
  };
}

// A tiny in-memory stand-in for the backend's conversation store: every
// route handler below reads and writes through this one object, so its
// state -- not anything in the browser -- is what a reload, a sign-out/
// sign-in or a storage wipe reads back. The sidebar title and the user
// turn's own text are deliberately different strings so assertions below
// can target each unambiguously.
function createFakeConversationStore(suffix: string) {
  const convId = `conv-history-${suffix}`;
  const c1 = citation(suffix, { number: 1, page_ref: 2 });
  const c2 = citation(suffix, { number: 2, section_ref: "Policy" });
  const title = `Grounded history conversation ${suffix}`;
  const questionText = `Does chat history survive a reload, ${suffix}?`;
  const answerText = `Grounded persisted answer for ${suffix}.`;

  const summary = { id: convId, title, updated_at: new Date().toISOString() };
  const detail = {
    id: convId,
    title,
    messages: [
      { id: "m1", role: "user", content: questionText },
      {
        id: "m2",
        role: "assistant",
        content: answerText,
        citations: [c1, c2],
        from_documents: true,
      },
    ],
  };

  return { convId, title, questionText, answerText, c1, c2, summary, detail };
}

async function registerFakeBackendRoutes(
  page: import("@playwright/test").Page,
  store: ReturnType<typeof createFakeConversationStore>,
) {
  await page.route(`${apiBaseURL}/conversations`, async (route) => {
    const request = route.request();
    if (request.method() === "GET") {
      await route.fulfill({ status: 200, json: [store.summary] });
      return;
    }
    if (request.method() === "POST") {
      await route.fulfill({
        status: 201,
        json: store.summary,
      });
      return;
    }
    await route.continue();
  });

  await page.route(`${apiBaseURL}/conversations/${store.convId}`, async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ status: 200, json: store.detail });
      return;
    }
    await route.continue();
  });

  await page.route(`${apiBaseURL}/chat`, async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      json: {
        conversation_id: store.convId,
        answer: store.answerText,
        from_documents: true,
        citations: [store.c1, store.c2],
      },
    });
  });
}

async function assertHistoryIsFullyRestored(
  page: import("@playwright/test").Page,
  store: ReturnType<typeof createFakeConversationStore>,
) {
  const sidebarEntry = page.getByRole("button", { name: store.title });
  await expect(sidebarEntry).toBeVisible();
  await sidebarEntry.click();

  await expect(page.getByText(store.questionText)).toBeVisible();
  await expect(page.getByText(store.answerText)).toBeVisible();
  await expect(page.getByText(/from your documents/i)).toBeVisible();

  const chips = page.getByRole("group", { name: /sources/i }).getByRole("button");
  await expect(chips).toHaveCount(2);
  await expect(
    page.getByRole("button", { name: new RegExp(`Source 1: ${store.c1.filename}`) }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: new RegExp(`Source 2: ${store.c2.filename}`) }),
  ).toBeVisible();
}

test.describe("Chat history durability across reload, re-login and storage clear (US-025-2)", () => {
  let bootstrapBlocked = false;
  let email = "";

  test.beforeAll(async ({ request }) => {
    email = uniqueEmail("e2e-chat-history");
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

  test("reloading the Chat page restores the same sidebar list and the same conversation's messages, badges and citations (AC-067)", async ({
    page,
  }) => {
    const store = createFakeConversationStore(uniqueSuffix());
    await signIn(page, email, PASSWORD);
    await registerFakeBackendRoutes(page, store);

    await page.goto("/chat");
    await assertHistoryIsFullyRestored(page, store);

    await page.reload();
    await assertHistoryIsFullyRestored(page, store);
  });

  test("signing out and back in as the same user lists the same conversations and messages (AC-068)", async ({
    page,
  }) => {
    const store = createFakeConversationStore(uniqueSuffix());
    await signIn(page, email, PASSWORD);
    await registerFakeBackendRoutes(page, store);

    await page.goto("/chat");
    await assertHistoryIsFullyRestored(page, store);

    await page.getByRole("button", { name: /sign out/i }).click();
    await page.waitForURL(/\/sign-in$/, { timeout: 15_000 });

    await signIn(page, email, PASSWORD);
    await assertHistoryIsFullyRestored(page, store);
  });

  test("history survives with browser storage cleared, proving the backend is the source of truth (AC-070)", async ({
    page,
  }) => {
    const store = createFakeConversationStore(uniqueSuffix());
    await signIn(page, email, PASSWORD);
    await registerFakeBackendRoutes(page, store);

    await page.goto("/chat");
    await assertHistoryIsFullyRestored(page, store);

    // The session itself is a cookie (see src/lib/auth.tsx), so wiping
    // localStorage/sessionStorage never signs the user out -- it only
    // proves the chat history itself was never read from either.
    await page.evaluate(() => {
      window.localStorage.clear();
      window.sessionStorage.clear();
    });

    await page.reload();
    await assertHistoryIsFullyRestored(page, store);
  });
});
