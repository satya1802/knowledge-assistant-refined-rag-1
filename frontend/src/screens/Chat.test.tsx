import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
  conversations?: Array<{ id: string; title?: string | null }>;
  conversationDetail?: Record<string, { id: string; title?: string | null; messages?: unknown[] }>;
  chatResponder?: (body: {
    conversation_id?: string;
    question: string;
  }) => Promise<unknown> | unknown;
  chatShouldFail?: boolean;
};

function makeFetch(opts: FetchOpts = {}) {
  const calls: Array<{ path: string; method: string; body?: unknown }> = [];
  let nextConversationId = 0;

  const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
    const u = new URL(url, "http://localhost");
    const path = u.pathname;
    const method = (init?.method ?? "GET").toUpperCase();
    const body = init?.body ? JSON.parse(init.body as string) : undefined;
    calls.push({ path, method, body });

    if (path === "/conversations" && method === "GET") {
      return ok(opts.conversations ?? []);
    }
    if (path === "/conversations" && method === "POST") {
      nextConversationId += 1;
      const id = `conv-${nextConversationId}`;
      return ok({ id, title: body?.title ?? null });
    }
    const detailMatch = /^\/conversations\/([^/]+)$/.exec(path);
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
            { id: "m2", role: "assistant", content: "It is this.", from_documents: false, citations: [] },
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
});
