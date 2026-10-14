import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import Chat from "./Chat";

function ok(body: unknown, status = 200) {
  return Promise.resolve({ ok: true, status, json: async () => body });
}

function err(status: number, detail: string) {
  return Promise.resolve({
    ok: false,
    status,
    json: async () => ({ detail }),
    clone() {
      return this;
    },
  });
}

type FetchOpts = {
  conversations?: Array<{ id: string; title?: string | null; updated_at?: string | null }>;
  conversationsByQuery?: Record<
    string,
    Array<{ id: string; title?: string | null; updated_at?: string | null }>
  >;
  conversationDetail?: Record<string, { id: string; title?: string | null; messages?: unknown[] }>;
  chatResponder?: (body: {
    conversation_id?: string;
    question: string;
  }) => Promise<unknown> | unknown;
  chatShouldFail?: boolean;
  downloadHeaders?: Record<string, string>;
  downloadOk?: boolean;
  deleteShouldFail?: boolean;
};

function makeFetch(opts: FetchOpts = {}) {
  const calls: Array<{ path: string; method: string; body?: unknown }> = [];
  let nextConversationId = 0;

  const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
    const u = new URL(url, "http://localhost");
    const path = u.pathname;
    const method = (init?.method ?? "GET").toUpperCase();
    const isJsonBody = typeof init?.body === "string";
    const body = isJsonBody ? JSON.parse(init!.body as string) : undefined;
    calls.push({ path, method, body });

    if (path === "/conversations" && method === "GET") {
      const q = u.searchParams.get("q");
      if (q !== null && opts.conversationsByQuery) {
        return ok(opts.conversationsByQuery[q] ?? []);
      }
      return ok(opts.conversations ?? []);
    }
    if (path === "/conversations" && method === "POST") {
      nextConversationId += 1;
      const id = `conv-${nextConversationId}`;
      return ok({ id, title: body?.title ?? null });
    }
    const detailMatch = /^\/conversations\/([^/]+)$/.exec(path);
    if (detailMatch && method === "DELETE") {
      if (opts.deleteShouldFail) {
        return err(500, "Could not delete that conversation.");
      }
      return Promise.resolve({ ok: true, status: 204, json: async () => undefined });
    }
    if (detailMatch && method === "GET") {
      const id = detailMatch[1];
      const detail = opts.conversationDetail?.[id] ?? { id, messages: [] };
      return ok(detail);
    }
    if (path === "/chat" && method === "POST") {
      if (opts.chatShouldFail) {
        return err(429, "Provider quota exceeded. Try again later.");
      }
      if (opts.chatResponder) {
        return ok(opts.chatResponder(body));
      }
      return ok({
        conversation_id: body.conversation_id,
        answer: "The answer is 42.",
        from_documents: true,
        citations: [
          {
            number: 1,
            document_id: "doc-1",
            chunk_id: "chunk-1",
            filename: "source.pdf",
            score: 0.9,
          },
        ],
      });
    }
    if (/^\/documents\/[^/]+\/download$/.test(path) && method === "GET") {
      if (opts.downloadOk === false) {
        return Promise.resolve({
          ok: false,
          status: 500,
          json: async () => ({}),
          clone() {
            return this;
          },
        });
      }
      const headers = new Headers(opts.downloadHeaders ?? {});
      return Promise.resolve({
        ok: true,
        status: 200,
        headers,
        blob: async () => new Blob(["file-bytes"], { type: "application/octet-stream" }),
      });
    }
    return Promise.reject(new Error(`unexpected ${method} ${path}`));
  });

  return { fetchMock, calls };
}

function countChatPosts(fetchMock: ReturnType<typeof vi.fn>): number {
  return fetchMock.mock.calls.filter((call: unknown[]) => {
    const [url, init] = call as [string, RequestInit | undefined];
    const path = new URL(url, "http://localhost").pathname;
    const method = (init?.method ?? "GET").toUpperCase();
    return path === "/chat" && method === "POST";
  }).length;
}

function findCall(
  fetchMock: ReturnType<typeof vi.fn>,
  predicate: (url: string, init: RequestInit | undefined) => boolean,
) {
  return fetchMock.mock.calls.find((call: unknown[]) =>
    predicate(call[0] as string, call[1] as RequestInit | undefined),
  );
}

async function renderWithGroundedAnswer(chatResponder: FetchOpts["chatResponder"]) {
  const { fetchMock } = makeFetch({ conversations: [], chatResponder });
  vi.stubGlobal("fetch", fetchMock);
  const user = userEvent.setup();
  render(<Chat />);

  await waitFor(() => expect(screen.getByText("No messages yet")).toBeInTheDocument());
  await user.type(screen.getByPlaceholderText("Ask a question…"), "Grounded?");
  await user.click(screen.getByRole("button", { name: /send/i }));
  await screen.findByText(/grounded answer/i, { exact: false }).catch(() => undefined);

  return { fetchMock, user };
}

// Timestamps built relative to the real current time, so the grouping
// tests do not depend on faking the system clock (which deadlocks against
// testing-library's internal timers in this setup).
function hoursAgoIso(hours: number): string {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}
function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

describe("Chat screen", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("loads conversations from GET /conversations on mount, not seeded data", async () => {
    const { fetchMock } = makeFetch({
      conversations: [{ id: "conv-1", title: "Prior chat" }],
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<Chat />);

    await waitFor(() => expect(screen.getByText("Prior chat")).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/conversations"),
      expect.any(Object),
    );
  });

  it("opens a conversation via GET /conversations/{id} and renders its messages", async () => {
    const { fetchMock } = makeFetch({
      conversations: [{ id: "conv-1", title: "Prior chat" }],
      conversationDetail: {
        "conv-1": {
          id: "conv-1",
          title: "Prior chat",
          messages: [
            { id: "m1", role: "user", content: "What is the policy?" },
            {
              id: "m2",
              role: "assistant",
              content: "It is this.",
              from_documents: false,
              citations: [],
            },
          ],
        },
      },
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<Chat />);

    await screen.findByText("Prior chat");
    await userEvent.setup().click(screen.getByText("Prior chat"));

    await waitFor(() => expect(screen.getByText("What is the policy?")).toBeInTheDocument());
    expect(screen.getByText("It is this.")).toBeInTheDocument();
  });

  it("sends a new question via POST /chat and renders the answer with citations", async () => {
    const { fetchMock } = makeFetch({ conversations: [] });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<Chat />);

    await waitFor(() => expect(screen.getByText("No messages yet")).toBeInTheDocument());

    await user.type(screen.getByPlaceholderText("Ask a question…"), "What is X?");
    await user.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => expect(screen.getByText("The answer is 42.")).toBeInTheDocument());
    expect(screen.getByText(/source\.pdf/i)).toBeInTheDocument();
  });

  it("AC-052/AC-053: a grounded answer shows 'From your documents' and one numbered chip per citation", async () => {
    const { fetchMock } = makeFetch({
      conversations: [],
      chatResponder: (body) => ({
        conversation_id: body.conversation_id,
        answer: "Grounded answer [1][2].",
        from_documents: true,
        citations: [
          {
            number: 1,
            document_id: "doc-1",
            chunk_id: "chunk-1",
            filename: "alpha.txt",
            score: 0.9,
          },
          {
            number: 2,
            document_id: "doc-2",
            chunk_id: "chunk-2",
            filename: "beta.md",
            score: 0.85,
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<Chat />);

    await waitFor(() => expect(screen.getByText("No messages yet")).toBeInTheDocument());
    await user.type(screen.getByPlaceholderText("Ask a question…"), "Grounded?");
    await user.click(screen.getByRole("button", { name: /send/i }));

    await screen.findByText("Grounded answer [1][2].");
    expect(screen.getByText("From your documents")).toBeInTheDocument();

    const chip1 = screen.getByRole("button", { name: /source 1: alpha\.txt/i });
    const chip2 = screen.getByRole("button", { name: /source 2: beta\.md/i });
    expect(chip1).toBeInTheDocument();
    expect(chip2).toBeInTheDocument();

    // Chips are real, focusable, keyboard-activatable buttons.
    chip1.focus();
    expect(chip1).toHaveFocus();
    await user.keyboard("{Enter}");
  });

  it("AC-058/AC-059: a fallback answer shows 'Not from your documents' and renders no chips", async () => {
    const { fetchMock } = makeFetch({
      conversations: [],
      chatResponder: (body) => ({
        conversation_id: body.conversation_id,
        answer: "Fallback answer with no grounding.",
        from_documents: false,
        citations: [],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<Chat />);

    await waitFor(() => expect(screen.getByText("No messages yet")).toBeInTheDocument());
    await user.type(screen.getByPlaceholderText("Ask a question…"), "Not grounded?");
    await user.click(screen.getByRole("button", { name: /send/i }));

    await screen.findByText("Fallback answer with no grounding.");
    expect(screen.getByText("Not from your documents")).toBeInTheDocument();
    expect(screen.queryByText("From your documents")).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Sources" })).not.toBeInTheDocument();
  });

  it("AC-054: opening a stored conversation restores persisted badge state and numbered chips", async () => {
    const { fetchMock } = makeFetch({
      conversations: [{ id: "conv-1", title: "Prior chat" }],
      conversationDetail: {
        "conv-1": {
          id: "conv-1",
          title: "Prior chat",
          messages: [
            { id: "m1", role: "user", content: "What is the policy?" },
            {
              id: "m2",
              role: "assistant",
              content: "Grounded stored answer [1].",
              from_documents: true,
              citations: [
                {
                  number: 1,
                  document_id: "doc-1",
                  chunk_id: "chunk-1",
                  filename: "policy.txt",
                  score: 0.91,
                },
              ],
            },
            {
              id: "m3",
              role: "user",
              content: "And off topic?",
            },
            {
              id: "m4",
              role: "assistant",
              content: "Fallback stored answer.",
              from_documents: false,
              citations: [],
            },
          ],
        },
      },
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<Chat />);

    await screen.findByText("Prior chat");
    await userEvent.setup().click(screen.getByText("Prior chat"));

    await waitFor(() =>
      expect(screen.getByText("Grounded stored answer [1].")).toBeInTheDocument(),
    );
    expect(screen.getByText("From your documents")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /source 1: policy\.txt/i })).toBeInTheDocument();

    expect(screen.getByText("Fallback stored answer.")).toBeInTheDocument();
    expect(screen.getByText("Not from your documents")).toBeInTheDocument();
  });

  it("AC-061: a provider error renders inline, does not blank the page, and the composer stays usable", async () => {
    const { fetchMock } = makeFetch({ conversations: [], chatShouldFail: true });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<Chat />);

    await waitFor(() => expect(screen.getByText("No messages yet")).toBeInTheDocument());

    await user.type(screen.getByPlaceholderText("Ask a question…"), "Will this fail?");
    await user.click(screen.getByRole("button", { name: /send/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/quota exceeded/i);

    // Composer stays enabled and usable for a retry.
    const textarea = screen.getByPlaceholderText("Ask a question…") as HTMLTextAreaElement;
    expect(textarea).not.toBeDisabled();
    await waitFor(() => expect(screen.getByRole("button", { name: /send/i })).toBeInTheDocument());

    // AC-059-adjacent: an error turn carries no badge and no citation affordance.
    expect(screen.queryByText("From your documents")).not.toBeInTheDocument();
    expect(screen.queryByText("Not from your documents")).not.toBeInTheDocument();
  });

  it("AC-063: a failed answer leaves the user's existing question on screen intact", async () => {
    const { fetchMock } = makeFetch({ conversations: [], chatShouldFail: true });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<Chat />);

    await waitFor(() => expect(screen.getByText("No messages yet")).toBeInTheDocument());
    await user.type(screen.getByPlaceholderText("Ask a question…"), "Will this fail?");
    await user.click(screen.getByRole("button", { name: /send/i }));

    const alert = await screen.findByRole("alert");
    expect(
      within(alert.closest("section") ?? document.body).getAllByText("Will this fail?").length,
    ).toBeGreaterThan(0);
  });

  it("a follow-up question posts to the same conversation id and renders the new turn's citations", async () => {
    const seenConversationIds: Array<string | undefined> = [];
    const { fetchMock } = makeFetch({
      conversations: [],
      chatResponder: (body) => {
        seenConversationIds.push(body.conversation_id);
        return {
          conversation_id: body.conversation_id,
          answer: `Answer to: ${body.question}`,
          from_documents: true,
          citations: [
            {
              number: 1,
              document_id: "doc-2",
              chunk_id: `chunk-${seenConversationIds.length}`,
              filename: `followup-${seenConversationIds.length}.pdf`,
              score: 0.8,
            },
          ],
        };
      },
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<Chat />);

    await waitFor(() => expect(screen.getByText("No messages yet")).toBeInTheDocument());

    await user.type(screen.getByPlaceholderText("Ask a question…"), "First question");
    await user.click(screen.getByRole("button", { name: /send/i }));
    await screen.findByText("Answer to: First question");

    await user.type(screen.getByPlaceholderText("Ask a question…"), "Second question");
    await user.click(screen.getByRole("button", { name: /send/i }));
    await screen.findByText("Answer to: Second question");

    expect(seenConversationIds[0]).toBeTruthy();
    expect(seenConversationIds[1]).toBe(seenConversationIds[0]);
    expect(screen.getByText(/followup-2\.pdf/i)).toBeInTheDocument();
  });

  it("shows a pending state while a request is in flight and a second submit cannot duplicate it", async () => {
    let resolveChat: ((value: unknown) => void) | undefined;
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      const u = new URL(url, "http://localhost");
      const path = u.pathname;
      const method = (init?.method ?? "GET").toUpperCase();
      if (path === "/conversations" && method === "GET") return ok([]);
      if (path === "/conversations" && method === "POST") {
        return ok({ id: "conv-1", title: null });
      }
      if (path === "/chat" && method === "POST") {
        return new Promise((resolve) => {
          resolveChat = resolve as (value: unknown) => void;
        }).then(() => ({
          ok: true,
          status: 200,
          json: async () => ({
            conversation_id: "conv-1",
            answer: "Final answer",
            from_documents: false,
            citations: [],
          }),
        }));
      }
      return Promise.reject(new Error(`unexpected ${method} ${path}`));
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<Chat />);

    await waitFor(() => expect(screen.getByText("No messages yet")).toBeInTheDocument());

    await user.type(screen.getByPlaceholderText("Ask a question…"), "Slow question");
    await user.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => expect(screen.getByRole("button", { name: /sending/i })).toBeDisabled());

    expect(countChatPosts(fetchMock)).toBe(1);

    resolveChat?.(undefined);
    await screen.findByText("Final answer");

    expect(countChatPosts(fetchMock)).toBe(1);
  });

  describe("source panel (US-023-1)", () => {
    const twoCitationResponder = (body: { conversation_id?: string; question: string }) => ({
      conversation_id: body.conversation_id,
      answer: "Grounded answer [1][2].",
      from_documents: true,
      citations: [
        {
          number: 1,
          document_id: "doc-1",
          chunk_id: "chunk-1",
          filename: "alpha.txt",
          page_ref: 3,
          text_preview: "Alpha chunk text.",
          score: 0.9,
        },
        {
          number: 2,
          document_id: "doc-2",
          chunk_id: "chunk-2",
          filename: "beta.md",
          section_ref: "Section 2",
          text_preview: "Beta chunk text.",
          score: 0.85,
        },
      ],
    });

    let originalCreateObjectURL: typeof URL.createObjectURL;
    let originalRevokeObjectURL: typeof URL.revokeObjectURL;

    beforeEach(() => {
      originalCreateObjectURL = URL.createObjectURL;
      originalRevokeObjectURL = URL.revokeObjectURL;
      URL.createObjectURL = vi.fn().mockReturnValue("blob:fake-url");
      URL.revokeObjectURL = vi.fn();
    });

    afterEach(() => {
      URL.createObjectURL = originalCreateObjectURL;
      URL.revokeObjectURL = originalRevokeObjectURL;
    });

    it("AC-055: clicking a chip opens the panel with filename, location and preview text", async () => {
      const { user } = await renderWithGroundedAnswer(twoCitationResponder);

      const chip1 = screen.getByRole("button", { name: /source 1: alpha\.txt/i });
      await user.click(chip1);

      const panel = await screen.findByRole("dialog");
      expect(within(panel).getByText("alpha.txt")).toBeInTheDocument();
      expect(within(panel).getByText("Page 3")).toBeInTheDocument();
      expect(within(panel).getByText("Alpha chunk text.")).toBeInTheDocument();
    });

    it("AC-055: keyboard-activating a chip (Enter) also opens the panel", async () => {
      const { user } = await renderWithGroundedAnswer(twoCitationResponder);

      const chip1 = screen.getByRole("button", { name: /source 1: alpha\.txt/i });
      chip1.focus();
      await user.keyboard("{Enter}");

      const panel = await screen.findByRole("dialog");
      expect(within(panel).getByText("alpha.txt")).toBeInTheDocument();
    });

    it("AC-057: selecting a different chip updates the panel without touching the thread or composer", async () => {
      const { user } = await renderWithGroundedAnswer(twoCitationResponder);

      await user.type(screen.getByPlaceholderText("Ask a question…"), "draft reply");
      await user.click(screen.getByRole("button", { name: /source 1: alpha\.txt/i }));
      let panel = await screen.findByRole("dialog");
      expect(within(panel).getByText("alpha.txt")).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: /source 2: beta\.md/i }));
      panel = screen.getByRole("dialog");
      expect(within(panel).getByText("beta.md")).toBeInTheDocument();
      expect(within(panel).getByText("Section: Section 2")).toBeInTheDocument();
      expect(within(panel).queryByText("alpha.txt")).not.toBeInTheDocument();

      // Thread and composer are untouched by the switch.
      expect(screen.getByText("Grounded answer [1][2].")).toBeInTheDocument();
      expect(screen.getByPlaceholderText("Ask a question…")).toHaveValue("draft reply");
    });

    it("AC-057/close-button: closing the panel removes it and returns focus to the originating chip", async () => {
      const { user } = await renderWithGroundedAnswer(twoCitationResponder);

      const chip1 = screen.getByRole("button", { name: /source 1: alpha\.txt/i });
      await user.click(chip1);
      await screen.findByRole("dialog");

      await user.click(screen.getByRole("button", { name: /close source panel/i }));

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(chip1).toHaveFocus();
    });

    it("closing via Escape dismisses the panel and returns focus to the chip", async () => {
      const { user } = await renderWithGroundedAnswer(twoCitationResponder);

      const chip2 = screen.getByRole("button", { name: /source 2: beta\.md/i });
      await user.click(chip2);
      await screen.findByRole("dialog");

      await user.keyboard("{Escape}");

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(chip2).toHaveFocus();
    });

    it("AC-056: the download button fetches /documents/{document_id}/download and saves under its filename", async () => {
      const { fetchMock, user } = await renderWithGroundedAnswer(twoCitationResponder);
      fetchMock.mockImplementation((url: string, init?: RequestInit) => {
        const u = new URL(url, "http://localhost");
        const path = u.pathname;
        const method = (init?.method ?? "GET").toUpperCase();
        if (/^\/documents\/[^/]+\/download$/.test(path) && method === "GET") {
          const headers = new Headers({
            "Content-Disposition": 'attachment; filename="alpha.txt"',
          });
          return Promise.resolve({
            ok: true,
            status: 200,
            headers,
            blob: async () => new Blob(["bytes"], { type: "text/plain" }),
          });
        }
        return Promise.reject(new Error(`unexpected ${method} ${path}`));
      });

      await user.click(screen.getByRole("button", { name: /source 1: alpha\.txt/i }));
      await screen.findByRole("dialog");

      let downloadAttr = "";
      const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
        this: HTMLAnchorElement,
      ) {
        downloadAttr = this.download;
      });

      await user.click(screen.getByRole("button", { name: /download original/i }));

      await waitFor(() => expect(clickSpy).toHaveBeenCalled());
      expect(downloadAttr).toBe("alpha.txt");
      const downloadCall = findCall(fetchMock, (url) => url.endsWith("/documents/doc-1/download"));
      expect(downloadCall).toBeTruthy();

      clickSpy.mockRestore();
    });

    it("the download button shows a readable error on failure instead of a silent no-op", async () => {
      const { user } = await renderWithGroundedAnswer(twoCitationResponder);

      await user.click(screen.getByRole("button", { name: /source 1: alpha\.txt/i }));
      const panel = await screen.findByRole("dialog");

      // Reconfigure the mock so the download route rejects.
      vi.stubGlobal(
        "fetch",
        vi.fn().mockImplementation((url: string) => {
          if (String(url).includes("/download")) {
            return Promise.resolve({ ok: false, status: 500, json: async () => ({}) });
          }
          return Promise.reject(new Error("unexpected"));
        }),
      );

      await user.click(within(panel).getByRole("button", { name: /download original/i }));

      await waitFor(() =>
        expect(screen.getByText(/couldn't download that document/i)).toBeInTheDocument(),
      );
    });
  });

  describe("sidebar grouping (US-027-1)", () => {
    it("AC-071: renders Today, Yesterday and Previous Conversations headings, most recent first within each", async () => {
      const { fetchMock } = makeFetch({
        conversations: [
          { id: "conv-today-early", title: "Today early", updated_at: hoursAgoIso(10) },
          { id: "conv-today-late", title: "Today late", updated_at: hoursAgoIso(1) },
          { id: "conv-yesterday", title: "Yesterday chat", updated_at: hoursAgoIso(30) },
          { id: "conv-older", title: "Old chat", updated_at: daysAgoIso(10) },
        ],
      });
      vi.stubGlobal("fetch", fetchMock);
      render(<Chat />);

      await waitFor(() => expect(screen.getByText("Today early")).toBeInTheDocument());

      expect(screen.getByText("Today")).toBeInTheDocument();
      expect(screen.getByText("Yesterday")).toBeInTheDocument();
      expect(screen.getByText("Previous Conversations")).toBeInTheDocument();

      // Most recent first within the Today group.
      const titles = screen
        .getAllByRole("button")
        .map((el) => el.textContent)
        .filter((t): t is string => Boolean(t) && t !== "New conversation");
      const todayLateIdx = titles.findIndex((t) => t?.includes("Today late"));
      const todayEarlyIdx = titles.findIndex((t) => t?.includes("Today early"));
      expect(todayLateIdx).toBeGreaterThanOrEqual(0);
      expect(todayEarlyIdx).toBeGreaterThan(todayLateIdx);

      expect(screen.getByText("Yesterday chat")).toBeInTheDocument();
      expect(screen.getByText("Old chat")).toBeInTheDocument();
    });

    it("AC-071: omits the Yesterday heading entirely when there are no conversations from yesterday", async () => {
      const { fetchMock } = makeFetch({
        conversations: [
          { id: "conv-today", title: "Today chat", updated_at: hoursAgoIso(1) },
          { id: "conv-older", title: "Old chat", updated_at: daysAgoIso(10) },
        ],
      });
      vi.stubGlobal("fetch", fetchMock);
      render(<Chat />);

      await waitFor(() => expect(screen.getByText("Today chat")).toBeInTheDocument());

      expect(screen.getByText("Today")).toBeInTheDocument();
      expect(screen.queryByText("Yesterday")).not.toBeInTheDocument();
      expect(screen.getByText("Previous Conversations")).toBeInTheDocument();
    });

    it("AC-071: a conversation with no updated_at falls back to Previous Conversations", async () => {
      const { fetchMock } = makeFetch({
        conversations: [{ id: "conv-no-date", title: "Undated chat" }],
      });
      vi.stubGlobal("fetch", fetchMock);
      render(<Chat />);

      await waitFor(() => expect(screen.getByText("Undated chat")).toBeInTheDocument());
      expect(screen.getByText("Previous Conversations")).toBeInTheDocument();
      expect(screen.queryByText("Today")).not.toBeInTheDocument();
      expect(screen.queryByText("Yesterday")).not.toBeInTheDocument();
    });

    it("AC-072/AC-067/AC-070: selecting a grouped conversation restores its history from GET /conversations/{id} alone", async () => {
      const { fetchMock } = makeFetch({
        conversations: [{ id: "conv-today", title: "Today chat", updated_at: hoursAgoIso(1) }],
        conversationDetail: {
          "conv-today": {
            id: "conv-today",
            title: "Today chat",
            messages: [
              { id: "m1", role: "user", content: "What is the refund window?" },
              {
                id: "m2",
                role: "assistant",
                content: "Thirty days [1].",
                from_documents: true,
                citations: [
                  {
                    number: 1,
                    document_id: "doc-9",
                    chunk_id: "chunk-9",
                    filename: "refunds.txt",
                    score: 0.88,
                  },
                ],
              },
            ],
          },
        },
      });
      vi.stubGlobal("fetch", fetchMock);
      render(<Chat />);

      await screen.findByText("Today chat");
      await userEvent.setup().click(screen.getByText("Today chat"));

      await waitFor(() => expect(screen.getByText("Thirty days [1].")).toBeInTheDocument());
      expect(screen.getByText("From your documents")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /source 1: refunds\.txt/i })).toBeInTheDocument();

      expect(window.localStorage.length).toBe(0);
      expect(window.sessionStorage.length).toBe(0);

      const detailCall = findCall(fetchMock, (url) => url.endsWith("/conversations/conv-today"));
      expect(detailCall).toBeTruthy();
    });
  });

  describe("history search and delete (US-030-2)", () => {
    it("AC-073: typing in the search box debounces a GET /conversations?q= request and shows only matches", async () => {
      const { fetchMock } = makeFetch({
        conversations: [{ id: "conv-1", title: "Alpha chat", updated_at: hoursAgoIso(1) }],
        conversationsByQuery: {
          budget: [{ id: "conv-2", title: "Budget chat", updated_at: hoursAgoIso(1) }],
        },
      });
      vi.stubGlobal("fetch", fetchMock);
      const user = userEvent.setup();
      render(<Chat />);

      await screen.findByText("Alpha chat");

      await user.type(screen.getByLabelText("Search conversations"), "budget");

      await waitFor(() => expect(screen.getByText("Budget chat")).toBeInTheDocument());
      expect(screen.queryByText("Alpha chat")).not.toBeInTheDocument();

      const call = findCall(fetchMock, (url) => url.includes("/conversations?q=budget"));
      expect(call).toBeTruthy();
    });

    it("AC-074: an empty filtered result renders 'No conversations found' instead of the groups", async () => {
      const { fetchMock } = makeFetch({
        conversations: [{ id: "conv-1", title: "Alpha chat", updated_at: hoursAgoIso(1) }],
        conversationsByQuery: { zzz: [] },
      });
      vi.stubGlobal("fetch", fetchMock);
      const user = userEvent.setup();
      render(<Chat />);

      await screen.findByText("Alpha chat");
      await user.type(screen.getByLabelText("Search conversations"), "zzz");

      await screen.findByText("No conversations found");
      expect(screen.queryByText("Alpha chat")).not.toBeInTheDocument();
      expect(screen.queryByText("Previous Conversations")).not.toBeInTheDocument();
    });

    it("AC-074: clearing the search restores the full conversation list", async () => {
      const { fetchMock } = makeFetch({
        conversations: [{ id: "conv-1", title: "Alpha chat", updated_at: hoursAgoIso(1) }],
        conversationsByQuery: { zzz: [] },
      });
      vi.stubGlobal("fetch", fetchMock);
      const user = userEvent.setup();
      render(<Chat />);

      await screen.findByText("Alpha chat");
      await user.type(screen.getByLabelText("Search conversations"), "zzz");
      await screen.findByText("No conversations found");

      await user.click(screen.getByRole("button", { name: /clear search/i }));

      await screen.findByText("Alpha chat");
      expect(screen.queryByText("No conversations found")).not.toBeInTheDocument();
    });

    it("AC-077: the Delete control is keyboard-reachable and does not open the conversation", async () => {
      const { fetchMock } = makeFetch({
        conversations: [{ id: "conv-1", title: "Alpha chat", updated_at: hoursAgoIso(1) }],
      });
      vi.stubGlobal("fetch", fetchMock);
      const user = userEvent.setup();
      render(<Chat />);

      await screen.findByText("Alpha chat");
      const deleteButton = screen.getByRole("button", { name: /delete alpha chat/i });
      deleteButton.focus();
      expect(deleteButton).toHaveFocus();
      await user.keyboard("{Enter}");

      await screen.findByText(/delete "alpha chat"/i);
      // Activating Delete never opened the conversation thread.
      expect(screen.getByText("No messages yet")).toBeInTheDocument();
    });

    it("AC-077: Cancel removes nothing and leaves the list unchanged", async () => {
      const { fetchMock } = makeFetch({
        conversations: [{ id: "conv-1", title: "Alpha chat", updated_at: hoursAgoIso(1) }],
      });
      vi.stubGlobal("fetch", fetchMock);
      const user = userEvent.setup();
      render(<Chat />);

      await screen.findByText("Alpha chat");
      await user.click(screen.getByRole("button", { name: /delete alpha chat/i }));
      await screen.findByText(/delete "alpha chat"/i);

      await user.click(screen.getByRole("button", { name: /^cancel$/i }));

      expect(screen.getByText("Alpha chat")).toBeInTheDocument();
      expect(fetchMock.mock.calls.some(([, init]) => init?.method === "DELETE")).toBe(false);
    });

    it("AC-078: confirming issues DELETE /conversations/{id} and removes the row, resetting an open thread", async () => {
      const { fetchMock } = makeFetch({
        conversations: [{ id: "conv-1", title: "Alpha chat", updated_at: hoursAgoIso(1) }],
        conversationDetail: { "conv-1": { id: "conv-1", title: "Alpha chat", messages: [] } },
      });
      vi.stubGlobal("fetch", fetchMock);
      const user = userEvent.setup();
      render(<Chat />);

      await screen.findByText("Alpha chat");
      await user.click(screen.getByText("Alpha chat"));
      await waitFor(() => expect(screen.getByText("No messages yet")).toBeInTheDocument());

      await user.click(screen.getByRole("button", { name: /delete alpha chat/i }));
      await screen.findByText(/delete "alpha chat"/i);
      await user.click(screen.getByRole("button", { name: /^confirm$/i }));

      await waitFor(() => expect(screen.queryByText("Alpha chat")).not.toBeInTheDocument());
      const deleteCall = findCall(
        fetchMock,
        (url, init) => url.endsWith("/conversations/conv-1") && init?.method === "DELETE",
      );
      expect(deleteCall).toBeTruthy();
      expect(screen.getByText("No messages yet")).toBeInTheDocument();
    });

    it("a failed delete surfaces an inline alert and leaves the conversation in the list", async () => {
      const { fetchMock } = makeFetch({
        conversations: [{ id: "conv-1", title: "Alpha chat", updated_at: hoursAgoIso(1) }],
        deleteShouldFail: true,
      });
      vi.stubGlobal("fetch", fetchMock);
      const user = userEvent.setup();
      render(<Chat />);

      await screen.findByText("Alpha chat");
      await user.click(screen.getByRole("button", { name: /delete alpha chat/i }));
      await screen.findByText(/delete "alpha chat"/i);
      await user.click(screen.getByRole("button", { name: /^confirm$/i }));

      await screen.findByRole("alert");
      expect(screen.getByText("Alpha chat")).toBeInTheDocument();
    });
  });
});
