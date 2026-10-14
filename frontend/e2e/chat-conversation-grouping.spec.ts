import { expect, test } from "@playwright/test";

// US-027: Browse conversations grouped by date.
//
// AC-071: conversations created on different days are grouped under
// "Today", "Yesterday" and "Previous Conversations" headings in the
// sidebar, most recent first within each group.
// AC-072: selecting a conversation in the sidebar loads its full message
// history, source chips and badges into the main chat area.
//
// Follows the stubbing convention in chat-citations.spec.ts and
// chat-history-persistence.spec.ts: GET /conversations and
// GET /conversations/{id} are routed at the network layer with a fixed,
// deterministic set of `updated_at` timestamps relative to "now" so the
// grouping assertions never depend on wall-clock timing or a live backend
// clock. Each test provisions its own account through the open "first
// account" bootstrap endpoint, the same technique every other e2e suite in
// this repo uses.

const apiBaseURL = process.env.E2E_API_BASE_URL ?? "http://127.0.0.1:8000";

function uniqueEmail(label: string): string {
  return `${label}-${Date.now()}-${Math.floor(Math.random() * 100000)}@example.com`;
}

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

const PASSWORD = "ChatGroupingBootstrap123!";

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

function isoAt(daysAgo: number, hour: number, minute: number): string {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysAgo, hour, minute, 0, 0);
  return d.toISOString();
}

test.describe("Sidebar conversations grouped by date (US-027)", () => {
  let bootstrapBlocked = false;
  let email = "";

  test.beforeAll(async ({ request }) => {
    email = uniqueEmail("e2e-chat-grouping");
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

  test("conversations are grouped into Today, Yesterday and Previous Conversations, most recent first within each group (AC-071)", async ({
    page,
  }) => {
    const suffix = uniqueSuffix();

    // Two "Today" conversations (later one first), one "Yesterday", two
    // "Previous Conversations" (older of the two is 5 days back, newer is
    // 3 days back -- so within the group the 3-day-back one must render
    // first).
    const todayLater = {
      id: `conv-today-later-${suffix}`,
      title: `Today Later ${suffix}`,
      updated_at: isoAt(0, 15, 0),
    };
    const todayEarlier = {
      id: `conv-today-earlier-${suffix}`,
      title: `Today Earlier ${suffix}`,
      updated_at: isoAt(0, 9, 0),
    };
    const yesterday = {
      id: `conv-yesterday-${suffix}`,
      title: `Yesterday One ${suffix}`,
      updated_at: isoAt(1, 10, 0),
    };
    const previousNewer = {
      id: `conv-previous-newer-${suffix}`,
      title: `Previous Newer ${suffix}`,
      updated_at: isoAt(3, 10, 0),
    };
    const previousOlder = {
      id: `conv-previous-older-${suffix}`,
      title: `Previous Older ${suffix}`,
      updated_at: isoAt(5, 10, 0),
    };

    await signIn(page, email, PASSWORD);

    // Deliberately registered out of chronological order to prove the UI
    // does the grouping/sorting itself rather than relying on the
    // backend's response order.
    await page.route(`${apiBaseURL}/conversations`, async (route) => {
      if (route.request().method() !== "GET") {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 200,
        json: [yesterday, previousOlder, todayEarlier, previousNewer, todayLater],
      });
    });

    await page.goto("/chat");

    const headings = page.locator("h2");
    await expect(headings).toHaveCount(3);
    await expect(headings.nth(0)).toHaveText("Today");
    await expect(headings.nth(1)).toHaveText("Yesterday");
    await expect(headings.nth(2)).toHaveText("Previous Conversations");

    // Within "Today": later conversation first.
    const todayGroup = page.locator("div").filter({ has: headings.nth(0) }).first();
    const todayButtons = todayGroup.getByRole("button", { name: new RegExp(`${suffix}$`) });
    await expect(todayButtons.nth(0)).toHaveText(todayLater.title);
    await expect(todayButtons.nth(1)).toHaveText(todayEarlier.title);

    // Within "Previous Conversations": the 3-days-back entry (newer) comes
    // before the 5-days-back entry (older).
    const previousGroup = page.locator("div").filter({ has: headings.nth(2) }).first();
    const previousButtons = previousGroup.getByRole("button", { name: new RegExp(`${suffix}$`) });
    await expect(previousButtons.nth(0)).toHaveText(previousNewer.title);
    await expect(previousButtons.nth(1)).toHaveText(previousOlder.title);

    // "Yesterday" has exactly its one conversation.
    const yesterdayGroup = page.locator("div").filter({ has: headings.nth(1) }).first();
    await expect(
      yesterdayGroup.getByRole("button", { name: new RegExp(`${suffix}$`) }),
    ).toHaveText(yesterday.title);
  });

  test("a heading is omitted when its group has no conversations", async ({ page }) => {
    const suffix = uniqueSuffix();
    const onlyToday = {
      id: `conv-only-today-${suffix}`,
      title: `Only Today ${suffix}`,
      updated_at: isoAt(0, 12, 0),
    };

    await signIn(page, email, PASSWORD);
    await page.route(`${apiBaseURL}/conversations`, async (route) => {
      if (route.request().method() !== "GET") {
        await route.continue();
        return;
      }
      await route.fulfill({ status: 200, json: [onlyToday] });
    });

    await page.goto("/chat");

    const headings = page.locator("h2");
    await expect(headings).toHaveCount(1);
    await expect(headings.first()).toHaveText("Today");
    await expect(page.getByText("Yesterday", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Previous Conversations", { exact: true })).toHaveCount(0);
  });

  test("selecting a conversation in the sidebar loads its full message history, source chips and badges (AC-072)", async ({
    page,
  }) => {
    const suffix = uniqueSuffix();
    const convA = {
      id: `conv-a-${suffix}`,
      title: `Grounded Conversation ${suffix}`,
      updated_at: isoAt(0, 11, 0),
    };
    const convB = {
      id: `conv-b-${suffix}`,
      title: `Fallback Conversation ${suffix}`,
      updated_at: isoAt(0, 9, 0),
    };
    const c1 = citation(suffix, { number: 1, page_ref: 2 });
    const c2 = citation(suffix, { number: 2, section_ref: "Intro" });

    const detailA = {
      id: convA.id,
      title: convA.title,
      messages: [
        { id: "a-m1", role: "user", content: `Question for A ${suffix}` },
        {
          id: "a-m2",
          role: "assistant",
          content: `Grounded answer for A ${suffix}`,
          citations: [c1, c2],
          from_documents: true,
        },
      ],
    };
    const detailB = {
      id: convB.id,
      title: convB.title,
      messages: [
        { id: "b-m1", role: "user", content: `Question for B ${suffix}` },
        {
          id: "b-m2",
          role: "assistant",
          content: `Fallback answer for B ${suffix}`,
          citations: [],
          from_documents: false,
        },
      ],
    };

    await signIn(page, email, PASSWORD);
    await page.route(`${apiBaseURL}/conversations`, async (route) => {
      if (route.request().method() !== "GET") {
        await route.continue();
        return;
      }
      await route.fulfill({ status: 200, json: [convA, convB] });
    });
    await page.route(`${apiBaseURL}/conversations/${convA.id}`, async (route) => {
      if (route.request().method() !== "GET") {
        await route.continue();
        return;
      }
      await route.fulfill({ status: 200, json: detailA });
    });
    await page.route(`${apiBaseURL}/conversations/${convB.id}`, async (route) => {
      if (route.request().method() !== "GET") {
        await route.continue();
        return;
      }
      await route.fulfill({ status: 200, json: detailB });
    });

    await page.goto("/chat");

    await page.getByRole("button", { name: convA.title }).click();
    await expect(page.getByText(detailA.messages[0].content)).toBeVisible();
    await expect(page.getByText(detailA.messages[1].content)).toBeVisible();
    await expect(page.getByText(/from your documents/i)).toBeVisible();
    const chipsA = page.getByRole("group", { name: /sources/i }).getByRole("button");
    await expect(chipsA).toHaveCount(2);
    await expect(
      page.getByRole("button", { name: new RegExp(`Source 1: ${c1.filename}`) }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: new RegExp(`Source 2: ${c2.filename}`) }),
    ).toBeVisible();

    // Switching to a different conversation replaces the main area entirely
    // -- A's content and chips are gone, B's fallback badge and no chips
    // are shown instead.
    await page.getByRole("button", { name: convB.title }).click();
    await expect(page.getByText(detailB.messages[0].content)).toBeVisible();
    await expect(page.getByText(detailB.messages[1].content)).toBeVisible();
    await expect(page.getByText(/not from your documents/i)).toBeVisible();
    await expect(page.getByRole("group", { name: /sources/i })).toHaveCount(0);
    await expect(page.getByText(detailA.messages[0].content)).toHaveCount(0);
    await expect(page.getByText(detailA.messages[1].content)).toHaveCount(0);
  });
});
