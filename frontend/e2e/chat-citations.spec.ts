import { expect, test } from "@playwright/test";

// US-023-2 (verifies US-022-2 / US-023-1): grounded citation chips, the
// grounded/fallback badge, and the source panel they open.
//
// AC coverage:
//  - grounded answer shows "From your documents" + one numbered chip per
//    stubbed citation, in the stubbed order/numbers
//  - fallback answer shows "Not from your documents" + zero chips
//  - a chip opens the panel by mouse click and by keyboard (Enter), with
//    filename, page/section reference and text preview
//  - the panel's download control triggers a real browser download for the
//    citation's document id
//  - selecting a second chip updates the panel in place; closing it leaves
//    the thread and composer input untouched
//  - reloading a stored conversation restores the same numbered chips and
//    badge states, read straight from the persisted conversation detail
//
// Follows the stubbing convention in knowledge-base.spec.ts: route the real
// API paths at the network layer so nothing here depends on a live Groq
// call or real retrieval. Each test provisions its own account through the
// open "first account" bootstrap endpoint, same as every other e2e suite in
// this repo.

const apiBaseURL = process.env.E2E_API_BASE_URL ?? "http://127.0.0.1:8000";

function uniqueEmail(label: string): string {
  return `${label}-${Date.now()}-${Math.floor(Math.random() * 100000)}@example.com`;
}

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

const PASSWORD = "ChatCitationsBootstrap123!";

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

async function routeConversationCreate(page: import("@playwright/test").Page, convId: string) {
  await page.route(`${apiBaseURL}/conversations`, async (route) => {
    const request = route.request();
    if (request.method() === "POST") {
      await route.fulfill({
        status: 201,
        json: { id: convId, title: "Stubbed conversation", updated_at: new Date().toISOString() },
      });
      return;
    }
    if (request.method() === "GET") {
      await route.fulfill({ status: 200, json: [] });
      return;
    }
    await route.continue();
  });
}

async function routeChat(
  page: import("@playwright/test").Page,
  response: { answer: string; from_documents: boolean; citations: Citation[] },
  convId: string,
) {
  await page.route(`${apiBaseURL}/chat`, async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      json: { conversation_id: convId, ...response },
    });
  });
}

test.describe("Chat citation chips, badge and source panel (US-023-2)", () => {
  let bootstrapBlocked = false;
  let email = "";

  test.beforeAll(async ({ request }) => {
    email = uniqueEmail("e2e-citations");
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

  test("a grounded answer shows the From-your-documents badge and one numbered chip per citation", async ({
    page,
  }) => {
    const suffix = uniqueSuffix();
    const convId = `conv-grounded-${suffix}`;
    const c1 = citation(suffix, { number: 1 });
    const c2 = citation(suffix, { number: 2, page_ref: 4 });

    await signIn(page, email, PASSWORD);
    await routeConversationCreate(page, convId);
    await routeChat(
      page,
      { answer: "Here is a grounded answer.", from_documents: true, citations: [c1, c2] },
      convId,
    );

    await page.goto("/chat");
    await page.getByPlaceholder(/ask a question/i).fill("What does the policy say?");
    await page.getByRole("button", { name: /^send$/i }).click();

    await expect(page.getByText(/from your documents/i)).toBeVisible();
    const chips = page.getByRole("group", { name: /sources/i }).getByRole("button");
    await expect(chips).toHaveCount(2);
    await expect(page.getByRole("button", { name: new RegExp(`Source 1: ${c1.filename}`) })).toBeVisible();
    await expect(page.getByRole("button", { name: new RegExp(`Source 2: ${c2.filename}`) })).toBeVisible();
  });

  test("a fallback answer shows the Not-from-your-documents badge and zero chips", async ({
    page,
  }) => {
    const suffix = uniqueSuffix();
    const convId = `conv-fallback-${suffix}`;

    await signIn(page, email, PASSWORD);
    await routeConversationCreate(page, convId);
    await routeChat(
      page,
      { answer: "General knowledge answer.", from_documents: false, citations: [] },
      convId,
    );

    await page.goto("/chat");
    await page.getByPlaceholder(/ask a question/i).fill("What is the capital of France?");
    await page.getByRole("button", { name: /^send$/i }).click();

    await expect(page.getByText(/not from your documents/i)).toBeVisible();
    await expect(page.getByRole("group", { name: /sources/i })).toHaveCount(0);
  });

  test("a chip opens the panel by click and by keyboard, downloads the right document, a second chip swaps the panel in place, and closing leaves the thread and composer untouched", async ({
    page,
  }) => {
    const suffix = uniqueSuffix();
    const convId = `conv-panel-${suffix}`;
    const c1 = citation(suffix, {
      number: 1,
      page_ref: 3,
      text_preview: "Alpha preview text about contract terms.",
    });
    const c2 = citation(suffix, {
      number: 2,
      section_ref: "Intro",
      text_preview: "Beta preview text about onboarding.",
    });

    await signIn(page, email, PASSWORD);
    await routeConversationCreate(page, convId);
    await routeChat(
      page,
      { answer: "Here is a grounded answer.", from_documents: true, citations: [c1, c2] },
      convId,
    );
    await page.route(`${apiBaseURL}/documents/${c1.document_id}/download`, async (route) => {
      await route.fulfill({
        status: 200,
        headers: { "Content-Disposition": `attachment; filename="${c1.filename}"` },
        contentType: "application/pdf",
        body: Buffer.from("stubbed pdf bytes"),
      });
    });

    const question = "What does the policy say about onboarding?";
    await page.goto("/chat");
    const draftReplyText = "a draft reply I have not sent yet";
    const textarea = page.getByPlaceholder(/ask a question/i);
    await textarea.fill(question);
    await page.getByRole("button", { name: /^send$/i }).click();
    await expect(page.getByText(/from your documents/i)).toBeVisible();

    const chip1 = page.getByRole("button", { name: new RegExp(`Source 1: ${c1.filename}`) });
    const chip2 = page.getByRole("button", { name: new RegExp(`Source 2: ${c2.filename}`) });

    // Mouse activation opens the panel with filename, page reference and preview.
    await chip1.click();
    const panel = page.getByRole("dialog");
    await expect(panel).toBeVisible();
    await expect(panel.getByText(c1.filename)).toBeVisible();
    await expect(panel.getByText(/page 3/i)).toBeVisible();
    await expect(panel.getByText(c1.text_preview)).toBeVisible();

    // The download control triggers a real browser download for this
    // citation's document id.
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      panel.getByRole("button", { name: /download/i }).click(),
    ]);
    expect(download.suggestedFilename()).toBe(c1.filename);

    // Type a draft in the composer before touching the panel further, so we
    // can prove closing it leaves the composer untouched.
    await textarea.fill(draftReplyText);

    // Keyboard activation of a second chip swaps the panel in place (it
    // never closes and reopens) to the newly selected citation's details.
    await chip2.focus();
    await page.keyboard.press("Enter");
    await expect(panel).toBeVisible();
    await expect(panel.getByText(c2.filename)).toBeVisible();
    await expect(panel.getByText(/section: intro/i)).toBeVisible();
    await expect(panel.getByText(c2.text_preview)).toBeVisible();
    await expect(panel.getByText(c1.text_preview)).toHaveCount(0);

    // Closing the panel leaves the conversation thread and composer input
    // exactly as they were.
    await panel.getByRole("button", { name: /close source panel/i }).click();
    await expect(panel).toHaveCount(0);
    await expect(page.getByText(question)).toBeVisible();
    await expect(page.getByText(/here is a grounded answer/i)).toBeVisible();
    await expect(textarea).toHaveValue(draftReplyText);
  });

  test("reloading a stored conversation restores the same numbered chips and badge states (AC-054)", async ({
    page,
  }) => {
    const suffix = uniqueSuffix();
    const convId = `conv-reload-${suffix}`;
    const c1 = citation(suffix, { number: 1, page_ref: 2 });
    const c2 = citation(suffix, { number: 2, section_ref: "Policy" });

    const detail = {
      id: convId,
      title: "Stubbed reload conversation",
      messages: [
        { id: "m1", role: "user", content: "Grounded question?" },
        {
          id: "m2",
          role: "assistant",
          content: "Grounded persisted answer.",
          citations: [c1, c2],
          from_documents: true,
        },
        { id: "m3", role: "user", content: "Fallback question?" },
        {
          id: "m4",
          role: "assistant",
          content: "Fallback persisted answer.",
          citations: [],
          from_documents: false,
        },
      ],
    };

    await signIn(page, email, PASSWORD);
    await page.route(`${apiBaseURL}/conversations`, async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          json: [{ id: convId, title: detail.title, updated_at: new Date().toISOString() }],
        });
        return;
      }
      await route.continue();
    });
    await page.route(`${apiBaseURL}/conversations/${convId}`, async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({ status: 200, json: detail });
        return;
      }
      await route.continue();
    });

    await page.goto("/chat");
    await page.getByRole("button", { name: detail.title }).click();

    await expect(page.getByText(/from your documents/i)).toBeVisible();
    await expect(page.getByText(/not from your documents/i)).toBeVisible();
    const chips = page.getByRole("group", { name: /sources/i }).getByRole("button");
    await expect(chips).toHaveCount(2);
    await expect(page.getByRole("button", { name: new RegExp(`Source 1: ${c1.filename}`) })).toBeVisible();
    await expect(page.getByRole("button", { name: new RegExp(`Source 2: ${c2.filename}`) })).toBeVisible();

    // A hard reload re-fetches the same conversation detail and renders the
    // same chip numbers and badge states from the persisted payload.
    await page.reload();
    await page.getByRole("button", { name: detail.title }).click();

    await expect(page.getByText(/from your documents/i)).toBeVisible();
    await expect(page.getByText(/not from your documents/i)).toBeVisible();
    await expect(page.getByRole("group", { name: /sources/i }).getByRole("button")).toHaveCount(2);
    await expect(page.getByRole("button", { name: new RegExp(`Source 1: ${c1.filename}`) })).toBeVisible();
    await expect(page.getByRole("button", { name: new RegExp(`Source 2: ${c2.filename}`) })).toBeVisible();
  });
});
