import * as React from "react";

import { apiFetch, ApiError } from "@/lib/api";
import * as UI from "@/lib/ui";
import { Icons } from "@/lib/icons";
import SourcePanel, { type SourcePanelCitation } from "./SourcePanel";

const { Button, Textarea, Input, Card, CardContent, Badge, Empty } = UI;
const { Plus, ArrowRight, AlertCircle, FileText, CheckCircle, Trash, X } = Icons;

type Citation = {
  number: number;
  document_id: string;
  chunk_id: string;
  filename?: string | null;
  page_ref?: number | null;
  section_ref?: string | null;
  text_preview?: string | null;
  score: number;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  fromDocuments?: boolean;
  isError?: boolean;
};

type ConversationSummary = {
  id: string;
  title?: string | null;
  updated_at?: string | null;
};

// Shape a persisted message carries over the wire (US-022-1 contract) --
// `from_documents` is the server's badge state for that turn, stored once
// and never recomputed on the client.
type PersistedMessage = {
  id?: string;
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  from_documents?: boolean;
};

type ConversationDetail = {
  id: string;
  title?: string | null;
  messages?: PersistedMessage[];
};

type ChatApiResponse = {
  conversation_id: string;
  answer: string;
  from_documents: boolean;
  citations: Citation[];
};

type ListState = "loading" | "loaded" | "error";
type DetailState = "idle" | "loading" | "loaded" | "error";

// US-030-2: per-row delete affordance state. "confirming" and "deleting"
// both render the inline confirmation (the latter with controls disabled
// while the request is in flight); "error" renders the row normally again
// plus an inline alert, since a failed delete must leave the conversation
// in the list (AC-078/failed-delete).
type DeleteState = {
  id: string;
  status: "confirming" | "deleting" | "error";
  message?: string;
};

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    return err.message || "The assistant could not answer that question. Try again.";
  }
  return "Something went wrong reaching the assistant. Try again.";
}

// US-027-1: day-level grouping of the sidebar, derived purely from
// `updated_at` -- a conversation with no (or unparsable) timestamp falls
// back to "Previous Conversations" rather than crashing the grouping.
type GroupKey = "today" | "yesterday" | "previous";

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function groupKeyFor(updatedAt: string | null | undefined, now: Date): GroupKey {
  if (!updatedAt) return "previous";
  const date = new Date(updatedAt);
  if (Number.isNaN(date.getTime())) return "previous";
  const diffDays = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "yesterday";
  return "previous";
}

function timeOf(conversation: ConversationSummary): number {
  if (!conversation.updated_at) return 0;
  const t = new Date(conversation.updated_at).getTime();
  return Number.isNaN(t) ? 0 : t;
}

const GROUP_ORDER: Array<{ key: GroupKey; label: string }> = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "previous", label: "Previous Conversations" },
];

function groupConversations(
  conversations: ConversationSummary[],
  now: Date,
): Array<{ key: GroupKey; label: string; items: ConversationSummary[] }> {
  const buckets: Record<GroupKey, ConversationSummary[]> = {
    today: [],
    yesterday: [],
    previous: [],
  };
  for (const conversation of conversations) {
    buckets[groupKeyFor(conversation.updated_at, now)].push(conversation);
  }
  for (const key of Object.keys(buckets) as GroupKey[]) {
    buckets[key].sort((a, b) => timeOf(b) - timeOf(a));
  }
  // AC-071: a heading is omitted entirely when its group has no conversations.
  return GROUP_ORDER.map(({ key, label }) => ({ key, label, items: buckets[key] })).filter(
    (group) => group.items.length > 0,
  );
}

// US-030-2: an inline, focus-trapped confirmation rendered in place of a
// conversation row -- deliberately not window.confirm, and deliberately not
// a change to lib/ui.tsx (owned this sprint by US-039-1). `UI.Button` is a
// plain function component (no forwardRef), so focus management here goes
// through the wrapping group's DOM rather than a ref on the button itself.
function DeleteConfirmRow({
  title,
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  title: string;
  busy: boolean;
  error?: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const groupRef = React.useRef<HTMLDivElement | null>(null);

  const focusables = (): HTMLButtonElement[] =>
    groupRef.current ? Array.from(groupRef.current.querySelectorAll("button")) : [];

  React.useEffect(() => {
    focusables()[0]?.focus();
  }, []);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
      return;
    }
    if (event.key !== "Tab") return;
    const buttons = focusables();
    if (buttons.length === 0) return;
    // A minimal focus trap: only Cancel and Confirm live inside this
    // widget, so Tab/Shift+Tab just ping-pongs between the two.
    event.preventDefault();
    const [first, last] = [buttons[0], buttons[buttons.length - 1]];
    const next = document.activeElement === last ? first : last;
    (event.shiftKey ? (document.activeElement === first ? last : first) : next).focus();
  };

  return (
    <div
      ref={groupRef}
      role="group"
      aria-label={`Confirm delete of ${title}`}
      onKeyDown={handleKeyDown}
      className="flex flex-col gap-2 rounded-[var(--brand-radius)] border px-3 py-2"
      style={{ borderColor: "var(--brand-border)" }}
    >
      <p className="text-sm">{`Delete "${title}"? This cannot be undone.`}</p>
      {error ? (
        <p role="alert" className="flex items-center gap-1 text-xs text-red-400">
          <AlertCircle size={12} /> {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={onCancel}>
          {"Cancel"}
        </Button>
        <Button type="button" variant="danger" size="sm" disabled={busy} onClick={onConfirm}>
          {busy ? "Deleting…" : "Confirm"}
        </Button>
      </div>
    </div>
  );
}

export default function Chat() {
  const [conversations, setConversations] = React.useState<ConversationSummary[]>([]);
  const [listState, setListState] = React.useState<ListState>("loading");

  // US-030-2: `searchInput` is what the user is typing; the request to the
  // server is debounced off it. The server is the sole arbiter of which
  // conversations match -- there is no client-side substring filtering here.
  const [searchInput, setSearchInput] = React.useState("");
  const isFirstSearchRender = React.useRef(true);

  const [conversationId, setConversationId] = React.useState<string | null>(null);
  const [detailState, setDetailState] = React.useState<DetailState>("idle");
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);

  const [input, setInput] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const sendingRef = React.useRef(false);

  const [deleteState, setDeleteState] = React.useState<DeleteState | null>(null);

  // US-023-1: which citation's source panel is open, if any, and the chip
  // that opened it -- so closing the panel returns focus to exactly where
  // the user's keyboard was (AC-057).
  const [selectedCitation, setSelectedCitation] = React.useState<SourcePanelCitation | null>(null);
  const selectedChipRef = React.useRef<HTMLButtonElement | null>(null);

  const loadConversations = React.useCallback(async (query?: string) => {
    setListState((prev) => (prev === "loaded" ? prev : "loading"));
    try {
      const trimmed = query?.trim();
      const path = trimmed ? `/conversations?q=${encodeURIComponent(trimmed)}` : "/conversations";
      const rows = await apiFetch<ConversationSummary[]>(path);
      setConversations(rows);
      setListState("loaded");
    } catch {
      setListState("error");
    }
  }, []);

  // Chat loads its conversation list from the backend on mount -- nothing
  // here is seeded prototype data.
  React.useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  // AC-073: typing in the search box debounces a fresh GET /conversations?q=
  // request -- the first render (mount) is already covered by the effect
  // above and must not fire a second, redundant request.
  React.useEffect(() => {
    if (isFirstSearchRender.current) {
      isFirstSearchRender.current = false;
      return;
    }
    const handle = setTimeout(() => {
      void loadConversations(searchInput);
    }, 300);
    return () => clearTimeout(handle);
  }, [searchInput, loadConversations]);

  const isSearching = searchInput.trim().length > 0;

  const groupedConversations = React.useMemo(
    () => groupConversations(conversations, new Date()),
    [conversations],
  );

  const handleClearSearch = () => {
    setSearchInput("");
    // AC-074: clearing restores the full list immediately rather than
    // waiting out the debounce window.
    void loadConversations("");
  };

  const openConversation = React.useCallback(async (id: string) => {
    setConversationId(id);
    setDetailState("loading");
    try {
      // AC-072/AC-067/AC-070: the full turn history is re-fetched from the
      // backend every time a conversation is selected (including after a
      // reload) -- there is no sessionStorage, localStorage or module-level
      // cache standing in as the source of truth.
      const detail = await apiFetch<ConversationDetail>(`/conversations/${id}`);
      setMessages(
        (detail.messages ?? []).map((message) => ({
          id: message.id ?? newId(),
          role: message.role,
          content: message.content,
          citations: message.citations,
          // AC-054: the badge state restored on reload is exactly what was
          // persisted with the message, not recomputed from citations.
          fromDocuments: message.from_documents,
        })),
      );
      setDetailState("loaded");
    } catch {
      setDetailState("error");
    }
  }, []);

  const startNewConversation = React.useCallback(() => {
    setConversationId(null);
    setMessages([]);
    setDetailState("idle");
    setInput("");
  }, []);

  const requestDelete = (id: string) => {
    setDeleteState({ id, status: "confirming" });
  };

  const cancelDelete = () => {
    // AC-077: Cancel removes nothing and leaves the list unchanged.
    setDeleteState(null);
  };

  const confirmDelete = async (id: string) => {
    setDeleteState({ id, status: "deleting" });
    try {
      await apiFetch(`/conversations/${id}`, { method: "DELETE" });
      setConversations((prev) => prev.filter((conversation) => conversation.id !== id));
      // AC-078: if the deleted conversation was open, the thread resets to
      // the empty new-conversation state.
      if (conversationId === id) {
        startNewConversation();
      }
      setDeleteState(null);
    } catch {
      setDeleteState({
        id,
        status: "error",
        message: "Couldn't delete that conversation. Try again.",
      });
    }
  };

  // AC-055/AC-057: clicking or keyboard-activating a chip opens the side
  // panel for that citation; selecting a different chip while the panel is
  // already open just swaps which citation it shows -- the conversation
  // thread, scroll position and composer input are untouched either way,
  // since this only ever updates local selection state.
  const handleSelectCitation = React.useCallback((citation: Citation, chip: HTMLButtonElement) => {
    selectedChipRef.current = chip;
    setSelectedCitation(citation);
  }, []);

  const closeSourcePanel = React.useCallback(() => {
    setSelectedCitation(null);
    selectedChipRef.current?.focus();
  }, []);

  const handleSend = async (event?: React.FormEvent) => {
    event?.preventDefault();
    const question = input.trim();
    // Guarded synchronously via the ref, not just the `sending` state, so a
    // second submit fired before React re-renders cannot slip through and
    // duplicate the request.
    if (!question || sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    setInput("");

    const userMessage: ChatMessage = { id: newId(), role: "user", content: question };
    setMessages((prev) => [...prev, userMessage]);

    try {
      let activeConversationId = conversationId;
      if (!activeConversationId) {
        const created = await apiFetch<ConversationSummary>("/conversations", {
          method: "POST",
          body: JSON.stringify({ title: question.slice(0, 60) }),
        });
        activeConversationId = created.id;
        setConversationId(created.id);
        setDetailState("loaded");
        setConversations((prev) => [created, ...prev]);
      }

      const response = await apiFetch<ChatApiResponse>("/chat", {
        method: "POST",
        body: JSON.stringify({ conversation_id: activeConversationId, question }),
      });

      const assistantMessage: ChatMessage = {
        id: newId(),
        role: "assistant",
        content: response.answer,
        citations: response.citations,
        fromDocuments: response.from_documents,
      };
      // AC-063: the failure path below never touches this branch, and this
      // branch never removes anything already on screen -- messages only
      // ever grow.
      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err) {
      // AC-061: a provider quota/auth failure renders inline, right in the
      // thread, immediately -- the page neither hangs nor blanks, and
      // nothing already saved (the user's own question above) is cleared.
      const failureMessage: ChatMessage = {
        id: newId(),
        role: "assistant",
        content: errorMessage(err),
        isError: true,
      };
      setMessages((prev) => [...prev, failureMessage]);
    } finally {
      // The composer re-enables either way, so a retry is always possible.
      setSending(false);
      sendingRef.current = false;
    }
  };

  return (
    <div className="flex h-full min-h-screen">
      <aside
        className="flex w-64 shrink-0 flex-col gap-3 border-r p-4"
        style={{ borderColor: "var(--brand-border)" }}
      >
        <Button type="button" variant="secondary" size="sm" onClick={startNewConversation}>
          <Plus size={14} /> {"New conversation"}
        </Button>

        <div className="flex flex-col gap-1">
          <label
            htmlFor="conversation-search"
            className="px-1 text-xs font-medium text-[var(--brand-fg-muted)]"
          >
            {"Search conversations"}
          </label>
          <div className="relative">
            <Input
              id="conversation-search"
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search conversations…"
              className="pr-8"
            />
            {searchInput ? (
              <button
                type="button"
                aria-label="Clear search"
                onClick={handleClearSearch}
                className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center justify-center text-[var(--brand-fg-muted)] hover:text-inherit"
              >
                <X size={14} />
              </button>
            ) : null}
          </div>
        </div>

        {listState === "loading" ? (
          <p className="text-sm text-[var(--brand-fg-muted)]">{"Loading conversations…"}</p>
        ) : listState === "error" ? (
          <div className="flex flex-col items-start gap-2">
            <p role="alert" className="flex items-center gap-1 text-sm text-red-400">
              <AlertCircle size={14} /> {"Couldn't load conversations."}
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => void loadConversations(searchInput)}
            >
              {"Retry"}
            </Button>
          </div>
        ) : conversations.length === 0 ? (
          // AC-074: a filtered empty result gets its own clear message,
          // distinct from the plain "no conversations at all" state.
          <p className="text-sm text-[var(--brand-fg-muted)]">
            {isSearching ? "No conversations found" : "No conversations yet."}
          </p>
        ) : (
          <div className="flex flex-col gap-3 overflow-y-auto">
            {groupedConversations.map((group) => (
              <div key={group.key} className="flex flex-col gap-1">
                <h2 className="px-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--brand-fg-muted)]">
                  {group.label}
                </h2>
                {group.items.map((conversation) => {
                  const title = conversation.title || "Untitled conversation";
                  const isConfirming =
                    deleteState?.id === conversation.id &&
                    (deleteState.status === "confirming" || deleteState.status === "deleting");
                  const rowError =
                    deleteState?.id === conversation.id && deleteState.status === "error"
                      ? deleteState.message
                      : undefined;

                  if (isConfirming) {
                    return (
                      <DeleteConfirmRow
                        key={conversation.id}
                        title={title}
                        busy={deleteState?.status === "deleting"}
                        onCancel={cancelDelete}
                        onConfirm={() => void confirmDelete(conversation.id)}
                      />
                    );
                  }

                  return (
                    <div key={conversation.id} className="flex flex-col gap-1">
                      <div
                        className="group flex items-center gap-1 rounded-[var(--brand-radius)]"
                        style={{
                          backgroundColor:
                            conversation.id === conversationId
                              ? "var(--brand-hover)"
                              : "transparent",
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => void openConversation(conversation.id)}
                          className="flex-1 truncate rounded-[var(--brand-radius)] px-3 py-2 text-left text-sm transition-colors hover:bg-[var(--brand-hover)]"
                        >
                          {title}
                        </button>
                        <button
                          type="button"
                          aria-label={`Delete ${title}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            requestDelete(conversation.id);
                          }}
                          className="mr-1 flex shrink-0 items-center justify-center rounded-[var(--brand-radius)] p-1.5 text-[var(--brand-fg-muted)] hover:bg-[var(--brand-hover)] hover:text-red-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]"
                        >
                          <Trash size={14} />
                        </button>
                      </div>
                      {rowError ? (
                        <p
                          role="alert"
                          className="flex items-center gap-1 px-3 text-xs text-red-400"
                        >
                          <AlertCircle size={12} /> {rowError}
                        </p>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </aside>

      <section className="flex flex-1 flex-col gap-4 p-6">
        <div>
          <h1 className="text-lg font-semibold" style={{ fontFamily: "var(--brand-font-heading)" }}>
            {"Chat"}
          </h1>
          <p className="text-sm text-[var(--brand-fg-muted)]">
            {"Ask a question about the knowledge base."}
          </p>
        </div>

        <Card className="flex flex-1 flex-col">
          <CardContent className="flex flex-1 flex-col gap-4 overflow-y-auto">
            {detailState === "loading" ? (
              <p className="text-sm text-[var(--brand-fg-muted)]">{"Loading conversation…"}</p>
            ) : detailState === "error" ? (
              <div className="flex flex-col items-start gap-2">
                <p role="alert" className="flex items-center gap-1 text-sm text-red-400">
                  <AlertCircle size={14} /> {"Couldn't load that conversation. Try again."}
                </p>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => conversationId && void openConversation(conversationId)}
                >
                  {"Retry"}
                </Button>
              </div>
            ) : messages.length === 0 ? (
              <Empty title="No messages yet" description="Ask a question below to get started." />
            ) : (
              messages.map((message) => {
                const isAssistant = message.role === "assistant" && !message.isError;
                // AC-052/AC-058: the two badge states are mutually exclusive
                // and only ever shown on a real (non-error) assistant turn.
                const groundedChips =
                  isAssistant && message.fromDocuments && message.citations
                    ? message.citations
                    : [];
                return (
                  <div
                    key={message.id}
                    className="flex flex-col gap-1"
                    style={{ alignItems: message.role === "user" ? "flex-end" : "flex-start" }}
                  >
                    <div
                      role={message.isError ? "alert" : undefined}
                      className="max-w-xl rounded-[var(--brand-radius)] px-3 py-2 text-sm"
                      style={{
                        backgroundColor: message.isError
                          ? "rgba(248, 113, 113, 0.12)"
                          : message.role === "user"
                            ? "var(--brand-hover)"
                            : "var(--brand-surface)",
                        color: message.isError ? "#f87171" : "inherit",
                        border: "1px solid var(--brand-border)",
                      }}
                    >
                      {message.isError ? (
                        <span className="flex items-center gap-1">
                          <AlertCircle size={14} /> {message.content}
                        </span>
                      ) : (
                        message.content
                      )}
                    </div>
                    {isAssistant ? (
                      message.fromDocuments ? (
                        <Badge variant="success" className="flex items-center gap-1">
                          <CheckCircle size={10} /> {"From your documents"}
                        </Badge>
                      ) : (
                        <Badge variant="warning" className="flex items-center gap-1">
                          <AlertCircle size={10} /> {"Not from your documents"}
                        </Badge>
                      )
                    ) : null}
                    {groundedChips.length > 0 ? (
                      <div role="group" aria-label="Sources" className="flex flex-wrap gap-1">
                        {groundedChips.map((citation) => (
                          <button
                            key={citation.chunk_id}
                            type="button"
                            onClick={(e) => handleSelectCitation(citation, e.currentTarget)}
                            aria-label={`Source ${citation.number}: ${
                              citation.filename ?? "Untitled document"
                            }`}
                            className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium transition-colors hover:bg-[var(--brand-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]"
                            style={{ borderColor: "var(--brand-border)" }}
                          >
                            <FileText size={10} />
                            {citation.number}. {citation.filename ?? `Source ${citation.number}`}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        <form onSubmit={(e) => void handleSend(e)} className="flex items-end gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void handleSend();
              }
            }}
            placeholder="Ask a question…"
            className="flex-1"
            disabled={sending}
          />
          <Button type="submit" disabled={sending || !input.trim()}>
            {sending ? (
              "Sending…"
            ) : (
              <>
                {"Send"} <ArrowRight size={14} />
              </>
            )}
          </Button>
        </form>
      </section>

      <SourcePanel citation={selectedCitation} onClose={closeSourcePanel} />
    </div>
  );
}
