import * as React from "react";

import { apiFetch, ApiError } from "@/lib/api";
import * as UI from "@/lib/ui";
import { Icons } from "@/lib/icons";

const { Button, Textarea, Card, CardContent, Badge, Empty } = UI;
const { Plus, ArrowRight, AlertCircle, FileText, CheckCircle } = Icons;

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

export default function Chat() {
  const [conversations, setConversations] = React.useState<ConversationSummary[]>([]);
  const [listState, setListState] = React.useState<ListState>("loading");

  const [conversationId, setConversationId] = React.useState<string | null>(null);
  const [detailState, setDetailState] = React.useState<DetailState>("idle");
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);

  const [input, setInput] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const sendingRef = React.useRef(false);

  const loadConversations = React.useCallback(async () => {
    setListState((prev) => (prev === "loaded" ? prev : "loading"));
    try {
      const rows = await apiFetch<ConversationSummary[]>("/conversations");
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

  const openConversation = React.useCallback(async (id: string) => {
    setConversationId(id);
    setDetailState("loading");
    try {
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

  const startNewConversation = () => {
    setConversationId(null);
    setMessages([]);
    setDetailState("idle");
    setInput("");
  };

  // Hook point for US-023-1's source panel. Selecting a chip does nothing
  // observable yet -- opening the panel is that ticket's work, not this one's.
  const handleSelectCitation = React.useCallback((citation: Citation) => {
    void citation;
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
              onClick={() => void loadConversations()}
            >
              {"Retry"}
            </Button>
          </div>
        ) : conversations.length === 0 ? (
          <p className="text-sm text-[var(--brand-fg-muted)]">{"No conversations yet."}</p>
        ) : (
          <div className="flex flex-col gap-1 overflow-y-auto">
            {conversations.map((conversation) => (
              <button
                key={conversation.id}
                type="button"
                onClick={() => void openConversation(conversation.id)}
                className="rounded-[var(--brand-radius)] px-3 py-2 text-left text-sm transition-colors hover:bg-[var(--brand-hover)]"
                style={{
                  backgroundColor:
                    conversation.id === conversationId ? "var(--brand-hover)" : "transparent",
                }}
              >
                {conversation.title || "Untitled conversation"}
              </button>
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
                            onClick={() => handleSelectCitation(citation)}
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
    </div>
  );
}
