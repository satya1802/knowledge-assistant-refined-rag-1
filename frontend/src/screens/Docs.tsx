// @ts-nocheck -- generated from the approved design under its JS runtime contract; not hand-written TypeScript.
/* eslint-disable @typescript-eslint/no-unused-vars */
import React from "react";

import * as UI from "@/lib/ui";
import { Icons } from "@/lib/icons";
import { brand } from "@/lib/brand";
import { useNavigate } from "@/lib/navigate";

const { Button, Input, Textarea, Label, Table, THead, TBody, TR, TH, TD, Separator, Tabs } = UI;
const { Search, Check, ChevronRight, ChevronDown, Users, Settings, Clock, Upload, ArrowLeft, ArrowRight, AlertCircle, CheckCircle } = Icons;

const hexA = (hex, alpha) => {
  const h = String(hex || "#000000").replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
};

const TABS = [
  { id: "start", label: "Getting started", hint: "For everyone" },
  { id: "api", label: "API reference", hint: "Internal endpoints" },
];

const STEPS = [
  {
    n: "01",
    title: "Sign in with your work email",
    body:
      "Accounts are provisioned by an administrator — there is no sign-up form and no password-reset email. You will be handed a temporary password out of band; change it on the Account page the first time you sign in.",
    aside: "Five wrong attempts in 15 minutes locks the email address for 15 minutes.",
  },
  {
    n: "02",
    title: "Ask a question in plain language",
    body:
      "Every question searches your company documents before an answer is written — retrieval is never skipped, including on follow-ups inside the same conversation. Chunks have to score 0.62 or higher on similarity to be used as context.",
    aside: "Follow-ups keep the thread, so you can say \"and for contractors?\" without restating the question.",
  },
  {
    n: "03",
    title: "Check the numbered sources",
    body:
      "A grounded answer carries numbered chips beneath it. Open one and the source panel shows the filename, the page or section it came from, the exact retrieved text, and a download link for the original file.",
    aside: "Citations are stored with the message, so they look the same when you reopen the chat next month.",
  },
  {
    n: "04",
    title: "Watch for “Not from your documents”",
    body:
      "When nothing clears the threshold, the assistant answers from the model's general knowledge behind an amber badge and attaches no citations at all. Treat those answers as background, not as company policy.",
    aside: "No badge and no chips together never happens — one of the two is always shown.",
  },
  {
    n: "05",
    title: "Administrators keep the knowledge base current",
    body:
      "Admins drop PDF, DOCX, TXT or MD files up to 25 MB onto the Knowledge Base page. Documents move Processing → Ready on their own, and a Failed document keeps its file and its reason until someone deletes it deliberately.",
    aside: "Standard accounts see the document table and can download — the upload box simply is not rendered for them.",
  },
];

const ENDPOINTS = [
  {
    id: "auth-login",
    group: "Auth & session",
    method: "POST",
    path: "/auth/login",
    auth: "Public",
    summary: "Exchange email and password for an HTTP-only session cookie.",
    request: ["email — string", "password — string"],
    response: ["200 — sets session cookie, returns { id, email, role }", "401 — \"Email or password is incorrect\""],
    notes:
      "The same 401 is returned for an unknown email, a wrong password, a disabled account and a locked address. Nothing reveals which.",
  },
  {
    id: "auth-logout",
    group: "Auth & session",
    method: "POST",
    path: "/auth/logout",
    auth: "Signed in",
    summary: "Revoke the current session record and clear the cookie.",
    request: ["no body"],
    response: ["204 — sessions.revoked_at is set server-side"],
    notes: "Any later request to a protected endpoint returns 401 and the browser is sent to Sign In.",
  },
  {
    id: "auth-me",
    group: "Auth & session",
    method: "GET",
    path: "/auth/me",
    auth: "Signed in",
    summary: "The signed-in account, used to restore the session after a reload.",
    request: ["no parameters"],
    response: ["200 — { id, email, role, is_active, theme, created_at }"],
    notes: "Sessions live in the database, so they survive a backend restart.",
  },
  {
    id: "users-list",
    group: "Users",
    method: "GET",
    path: "/users",
    auth: "Admin only",
    summary: "Every provisioned account with its role and active flag.",
    request: ["q — optional substring of email"],
    response: ["200 — [{ id, email, role, is_active, failed_attempts, locked_until, created_at }]"],
    notes: "password_hash is never serialised by any endpoint.",
  },
  {
    id: "users-create",
    group: "Users",
    method: "POST",
    path: "/users",
    auth: "Admin only",
    summary: "Create a standard account with a temporary password.",
    request: ["email — string", "temporary_password — string"],
    response: ["201 — { id, email, role: \"user\", temporary_password }"],
    notes:
      "The temporary password is returned once, for display in-app. No mail is sent — pass it to the person out of band.",
  },
  {
    id: "users-patch",
    group: "Users",
    method: "PATCH",
    path: "/users/{id}",
    auth: "Admin only",
    summary: "Enable or disable an account, or grant and remove the admin role.",
    request: ["is_active — boolean", "role — \"admin\" | \"user\""],
    response: ["200 — the updated user record"],
    notes: "Disabling takes effect on the account's next request, not at the end of its session.",
  },
  {
    id: "account-password",
    group: "Account",
    method: "POST",
    path: "/account/password",
    auth: "Signed in",
    summary: "Replace your own password after confirming the current one.",
    request: ["current_password — string", "new_password — string"],
    response: ["200 — { changed_at }", "400 — current password is incorrect"],
    notes: "Only a bcrypt hash is stored. The old password stops working immediately.",
  },
  {
    id: "account-theme",
    group: "Account",
    method: "PATCH",
    path: "/account/theme",
    auth: "Signed in",
    summary: "Persist the Light, Dark or System theme choice on the user record.",
    request: ["theme — \"light\" | \"dark\" | \"system\""],
    response: ["200 — { theme }"],
    notes: "Stored server-side, so the preference follows you to another browser.",
  },
  {
    id: "docs-upload",
    group: "Documents",
    method: "POST",
    path: "/documents",
    auth: "Admin only",
    summary: "Upload a file and queue it for extraction, chunking and indexing.",
    request: ["multipart/form-data — file (PDF, DOCX, TXT, MD · max 25 MB)"],
    response: ["202 — { id, filename, file_type, size_bytes, status: \"processing\" }", "415 — unsupported format", "413 — over 25 MB"],
    notes: "Returns as soon as the original is stored; extraction continues in a background worker.",
  },
  {
    id: "docs-list",
    group: "Documents",
    method: "GET",
    path: "/documents",
    auth: "Signed in",
    summary: "The document table, with search and filters applied server-side.",
    request: ["q — filename substring", "status — processing | ready | failed", "file_type — pdf | docx | txt | md"],
    response: ["200 — [{ id, filename, file_type, size_bytes, status, failure_reason, notes, created_at }]"],
    notes: "The browser never holds the authoritative list — the table is always read from here.",
  },
  {
    id: "docs-stats",
    group: "Documents",
    method: "GET",
    path: "/documents/stats",
    auth: "Signed in",
    summary: "Counts behind the Knowledge Base tiles.",
    request: ["no parameters"],
    response: ["200 — { total, ready, processing, failed, chunks }"],
    notes: "Polled while anything is processing so the tiles and the table never disagree.",
  },
  {
    id: "docs-download",
    group: "Documents",
    method: "GET",
    path: "/documents/{id}/download",
    auth: "Signed in",
    summary: "Stream the original uploaded file back, unchanged.",
    request: ["no parameters"],
    response: ["200 — the stored bytes with the original filename"],
    notes: "Used by the document table and by the download link in the chat source panel.",
  },
  {
    id: "docs-reprocess",
    group: "Documents",
    method: "POST",
    path: "/documents/{id}/reprocess",
    auth: "Admin only",
    summary: "Retry a Failed document or re-index a Ready one from the stored original.",
    request: ["no body"],
    response: ["202 — { id, status: \"processing\" }"],
    notes: "A Ready document stays answerable and citable while its chunks are rebuilt.",
  },
  {
    id: "docs-delete",
    group: "Documents",
    method: "DELETE",
    path: "/documents/{id}",
    auth: "Admin only",
    summary: "Remove the record, the stored file, its chunks and its vectors together.",
    request: ["no body — the UI requires an explicit confirmation first"],
    response: ["204 — nothing is left behind to retrieve or cite"],
    notes: "The only call in the product that destroys document data. Nothing deletes a document automatically.",
  },
  {
    id: "conv-list",
    group: "Conversations & chat",
    method: "GET",
    path: "/conversations",
    auth: "Signed in",
    summary: "Your own conversations, newest first, for the sidebar groups.",
    request: ["q — optional title or message substring"],
    response: ["200 — [{ id, title, created_at, updated_at }]"],
    notes: "Scoped to the caller. Administrators cannot read anyone else's history.",
  },
  {
    id: "conv-create",
    group: "Conversations & chat",
    method: "POST",
    path: "/conversations",
    auth: "Signed in",
    summary: "Start an empty conversation for a New Chat.",
    request: ["title — optional; derived from the first question when omitted"],
    response: ["201 — { id, title, created_at }"],
    notes: "",
  },
  {
    id: "conv-get",
    group: "Conversations & chat",
    method: "GET",
    path: "/conversations/{id}",
    auth: "Signed in",
    summary: "Full message history with badges and stored citations.",
    request: ["no parameters"],
    response: ["200 — { id, title, messages: [{ role, content, from_documents, citations[] }] }", "404 — not yours"],
    notes: "A conversation belonging to another user answers 404, never a partial record.",
  },
  {
    id: "conv-delete",
    group: "Conversations & chat",
    method: "DELETE",
    path: "/conversations/{id}",
    auth: "Signed in",
    summary: "Delete one conversation with its messages and citations.",
    request: ["no body — confirmed in the UI first"],
    response: ["204 — other conversations are untouched"],
    notes: "",
  },
  {
    id: "chat-post",
    group: "Conversations & chat",
    method: "POST",
    path: "/chat",
    auth: "Signed in",
    summary: "Ask a question. Retrieval runs before any answer is generated.",
    request: ["conversation_id — string", "content — string"],
    response: [
      "200 — server-sent events: tokens, then { from_documents, citations[] }",
      "503 — provider unavailable or out of quota",
    ],
    notes:
      "Chunks at or above the threshold become the only context. If none qualify the reply is flagged from_documents: false and carries no citations.",
  },
  {
    id: "settings-get",
    group: "Settings",
    method: "GET",
    path: "/settings",
    auth: "Admin only",
    summary: "Retrieval and model settings currently in force.",
    request: ["no parameters"],
    response: ["200 — { similarity_threshold: 0.62, answer_model, embedding_dimensions: 768, batch_size: 100 }"],
    notes: "Secrets are not part of this payload. The provider key never leaves the server.",
  },
  {
    id: "settings-patch",
    group: "Settings",
    method: "PATCH",
    path: "/settings",
    auth: "Admin only",
    summary: "Change the similarity threshold or the answer model without a redeploy.",
    request: ["similarity_threshold — number between 0 and 1", "answer_model — string"],
    response: ["200 — the persisted settings record"],
    notes: "The new value applies to the next question asked anywhere in the product.",
  },
];

const CHANGELOG = [
  { date: "8 Oct 2026", text: "POST /documents/{id}/reprocess replaced the separate retry and re-index calls." },
  { date: "2 Oct 2026", text: "/chat now streams over server-sent events with 15-second keep-alive pings." },
  { date: "24 Sep 2026", text: "similarity_threshold moved from an environment variable to PATCH /settings." },
];

const GROUPS = ["Auth & session", "Users", "Account", "Documents", "Conversations & chat", "Settings"];

export default function Screen() {
  const navigate = useNavigate();
  const [tab, setTab] = React.useState("start");
  const [query, setQuery] = React.useState("");
  const [group, setGroup] = React.useState("All");
  const [openId, setOpenId] = React.useState(null);
  const [note, setNote] = React.useState("");
  const [noteError, setNoteError] = React.useState("");
  const [sent, setSent] = React.useState(null);

  const tabRefs = React.useRef({});

  const surface = hexA(brand.neutralColor, 0.07);
  const surfaceAlt = hexA(brand.neutralColor, 0.12);
  const line = hexA(brand.neutralColor, 0.2);
  const ink = "color-mix(in srgb, " + brand.neutralColor + " 32%, white)";
  const inkSoft = brand.neutralColor;

  const filtered = ENDPOINTS.filter((e) => {
    const inGroup = group === "All" || e.group === group;
    const q = query.trim().toLowerCase();
    const inQuery =
      q === "" ||
      e.path.toLowerCase().includes(q) ||
      e.summary.toLowerCase().includes(q) ||
      e.method.toLowerCase().includes(q) ||
      e.group.toLowerCase().includes(q);
    return inGroup && inQuery;
  });

  const methodStyle = (m) => {
    if (m === "GET") return { color: brand.primaryColor, backgroundColor: hexA(brand.primaryColor, 0.14), borderColor: hexA(brand.primaryColor, 0.35) };
    if (m === "DELETE") return { color: ink, backgroundColor: hexA(brand.neutralColor, 0.16), borderColor: hexA(brand.neutralColor, 0.4) };
    return { color: brand.accentColor, backgroundColor: hexA(brand.accentColor, 0.13), borderColor: hexA(brand.accentColor, 0.34) };
  };

  const onTabKeyDown = (e) => {
    const i = TABS.findIndex((t) => t.id === tab);
    let next = null;
    if (e.key === "ArrowRight") next = TABS[(i + 1) % TABS.length];
    if (e.key === "ArrowLeft") next = TABS[(i - 1 + TABS.length) % TABS.length];
    if (next) {
      e.preventDefault();
      setTab(next.id);
      const el = tabRefs.current[next.id];
      if (el) el.focus();
    }
  };

  const submitNote = (e) => {
    e.preventDefault();
    if (note.trim().length < 10) {
      setNoteError("Give us a sentence at least — we need to know which page and what was missing.");
      return;
    }
    setNoteError("");
    setSent(note.trim());
  };

  return (
    <div
      className="min-h-full w-full"
      style={{ backgroundColor: brand.backgroundColor, fontFamily: brand.fontBody, color: inkSoft }}
    >
      <style>{`
        .ka-reveal { animation: kaReveal 180ms ease-out both; }
        @keyframes kaReveal { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }
        .ka-focus:focus-visible { outline: 2px solid ${brand.primaryColor}; outline-offset: 2px; border-radius: ${brand.radius}; }
        .ka-row { transition: background-color 140ms ease; }
        @media (prefers-reduced-motion: reduce) {
          .ka-reveal { animation: none; }
          .ka-row { transition: none; }
        }
      `}</style>

      <div className="mx-auto w-full max-w-6xl px-6 py-9">
        {/* Header */}
        <header className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl">
            <p
              className="text-[11px] font-semibold uppercase tracking-[0.18em]"
              style={{ color: brand.primaryColor }}
            >
              Public documentation
            </p>
            <h1
              className="mt-2 text-3xl font-semibold leading-tight"
              style={{ fontFamily: brand.fontHeading, color: "white", letterSpacing: "-0.01em" }}
            >
              How Knowledge Assistant works
            </h1>
            <p className="mt-3 text-[13.5px] leading-relaxed" style={{ color: inkSoft }}>
              Everything a new employee needs to ask their first question, and a static reference of the
              endpoints this application calls. No sign-in required to read either.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              onClick={() => navigate("chat")}
              className="ka-focus text-[13px] font-medium"
              style={{ backgroundColor: "transparent", color: ink, border: `1px solid ${line}`, borderRadius: brand.radius }}
            >
              Open Chat
            </Button>
            <Button
              type="button"
              onClick={() => navigate("sign-in")}
              className="ka-focus text-[13px] font-semibold"
              style={{ backgroundColor: brand.primaryColor, color: brand.backgroundColor, borderRadius: brand.radius }}
            >
              Sign in
            </Button>
          </div>
        </header>

        {/* Stale / build strip */}
        <div
          className="mt-7 flex flex-wrap items-center gap-x-3 gap-y-2 px-3.5 py-2.5 text-[12px]"
          style={{ backgroundColor: surface, border: `1px solid ${line}`, borderRadius: brand.radius }}
        >
          <Clock className="h-3.5 w-3.5" aria-hidden="true" style={{ color: brand.neutralColor }} />
          <span style={{ color: inkSoft, fontVariantNumeric: "tabular-nums" }}>
            Static snapshot of build <span style={{ color: ink }}>2026.10.08</span> · endpoints last verified 5 days ago
          </span>
          <span aria-hidden="true" style={{ color: hexA(brand.neutralColor, 0.4) }}>·</span>
          <span style={{ color: inkSoft }}>
            Written by the platform team. If the app disagrees with this page, the app is right.
          </span>
        </div>

        {/* Tabs */}
        <div
          role="tablist"
          aria-label="Documentation sections"
          onKeyDown={onTabKeyDown}
          className="mt-8 flex items-center gap-1 border-b"
          style={{ borderColor: line }}
        >
          {TABS.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                ref={(el) => (tabRefs.current[t.id] = el)}
                role="tab"
                type="button"
                id={`tab-${t.id}`}
                aria-selected={active}
                aria-controls={`panel-${t.id}`}
                tabIndex={active ? 0 : -1}
                onClick={() => setTab(t.id)}
                className="ka-focus -mb-px px-3.5 pb-2.5 pt-1 text-[13px] font-medium"
                style={{
                  color: active ? "white" : inkSoft,
                  borderBottom: `2px solid ${active ? brand.primaryColor : "transparent"}`,
                }}
              >
                {t.label}
                <span className="ml-2 text-[11px]" style={{ color: hexA(brand.neutralColor, 0.75) }}>
                  {t.hint}
                </span>
              </button>
            );
          })}
        </div>

        {/* Getting started */}
        {tab === "start" && (
          <div
            role="tabpanel"
            id="panel-start"
            aria-labelledby="tab-start"
            tabIndex={0}
            className="ka-reveal ka-focus mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_320px]"
          >
            <section aria-labelledby="h-steps">
              <h2 id="h-steps" className="text-[12px] font-semibold uppercase tracking-[0.16em]" style={{ color: inkSoft }}>
                Five steps, start to answer
              </h2>
              <ol className="mt-5 space-y-3">
                {STEPS.map((s) => (
                  <li
                    key={s.n}
                    className="flex gap-4 p-5"
                    style={{ backgroundColor: surface, border: `1px solid ${line}`, borderRadius: brand.radius }}
                  >
                    <span
                      className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center text-[12px] font-semibold"
                      style={{
                        color: brand.primaryColor,
                        backgroundColor: hexA(brand.primaryColor, 0.12),
                        border: `1px solid ${hexA(brand.primaryColor, 0.3)}`,
                        borderRadius: brand.radius,
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {s.n}
                    </span>
                    <div className="min-w-0">
                      <h3 className="text-[15px] font-semibold" style={{ color: "white", fontFamily: brand.fontHeading }}>
                        {s.title}
                      </h3>
                      <p className="mt-1.5 text-[13.5px] leading-relaxed" style={{ color: inkSoft }}>
                        {s.body}
                      </p>
                      <p
                        className="mt-3 pl-3 text-[12.5px] leading-relaxed"
                        style={{ color: hexA(brand.neutralColor, 0.9), borderLeft: `2px solid ${hexA(brand.primaryColor, 0.45)}` }}
                      >
                        {s.aside}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </section>

            <aside className="space-y-5" aria-label="Reading an answer">
              <section
                className="p-5"
                style={{ backgroundColor: surface, border: `1px solid ${line}`, borderRadius: brand.radius }}
                aria-labelledby="h-badges"
              >
                <h2 id="h-badges" className="text-[13px] font-semibold" style={{ color: "white" }}>
                  The two kinds of answer
                </h2>

                <div className="mt-4">
                  <span
                    className="inline-flex items-center gap-1.5 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide"
                    style={{
                      color: brand.primaryColor,
                      backgroundColor: hexA(brand.primaryColor, 0.12),
                      border: `1px solid ${hexA(brand.primaryColor, 0.35)}`,
                      borderRadius: brand.radius,
                    }}
                  >
                    <CheckCircle className="h-3.5 w-3.5" aria-hidden="true" />
                    From your documents
                  </span>
                  <p className="mt-2.5 text-[12.5px] leading-relaxed" style={{ color: inkSoft }}>
                    Built only from chunks that scored 0.62 or above. Numbered chips sit under the answer:
                  </p>
                  <ul className="mt-2.5 flex flex-wrap gap-1.5">
                    {[
                      { n: 1, f: "Field-Service-Handbook.pdf", p: "p. 14" },
                      { n: 2, f: "Expenses-Policy-2026.docx", p: "§ 3.2" },
                      { n: 3, f: "onboarding-checklist.md", p: "Week one" },
                    ].map((c) => (
                      <li key={c.n}>
                        <span
                          className="inline-flex items-center gap-1.5 px-2 py-1 text-[11px]"
                          style={{
                            color: ink,
                            backgroundColor: surfaceAlt,
                            border: `1px solid ${line}`,
                            borderRadius: brand.radius,
                            fontVariantNumeric: "tabular-nums",
                          }}
                        >
                          <span style={{ color: brand.primaryColor }}>{c.n}</span>
                          <span className="font-mono">{c.f}</span>
                          <span style={{ color: hexA(brand.neutralColor, 0.85) }}>{c.p}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>

                <Separator className="my-5" style={{ backgroundColor: line }} />

                <div>
                  <span
                    className="inline-flex items-center gap-1.5 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide"
                    style={{
                      color: brand.accentColor,
                      backgroundColor: hexA(brand.accentColor, 0.12),
                      border: `1px solid ${hexA(brand.accentColor, 0.38)}`,
                      borderRadius: brand.radius,
                    }}
                  >
                    <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
                    Not from your documents
                  </span>
                  <p className="mt-2.5 text-[12.5px] leading-relaxed" style={{ color: inkSoft }}>
                    Nothing in the knowledge base cleared the threshold, so the model answered from general
                    knowledge. No chips appear, and no citation is ever invented to fill the gap.
                  </p>
                </div>
              </section>

              <section
                className="p-5"
                style={{ backgroundColor: surface, border: `1px solid ${line}`, borderRadius: brand.radius }}
                aria-labelledby="h-admin"
              >
                <h2 id="h-admin" className="text-[13px] font-semibold" style={{ color: "white" }}>
                  For administrators
                </h2>
                <dl className="mt-3 space-y-2.5 text-[12.5px]">
                  {[
                    ["Accepted files", "PDF · DOCX · TXT · MD"],
                    ["Size limit", "25 MB per file"],
                    ["Chunking", "~1,000 chars, ~150 overlap"],
                    ["Embeddings", "768-dim, batches of 100"],
                    ["Match threshold", "0.62 cosine similarity"],
                  ].map(([k, v]) => (
                    <div key={k} className="flex items-baseline justify-between gap-3">
                      <dt style={{ color: inkSoft }}>{k}</dt>
                      <dd className="text-right font-mono" style={{ color: ink, fontVariantNumeric: "tabular-nums" }}>
                        {v}
                      </dd>
                    </div>
                  ))}
                </dl>
                <Button
                  type="button"
                  onClick={() => navigate("knowledge-base")}
                  className="ka-focus mt-4 w-full text-[12.5px] font-medium"
                  style={{ backgroundColor: "transparent", color: ink, border: `1px solid ${line}`, borderRadius: brand.radius }}
                >
                  Go to the Knowledge Base
                </Button>
              </section>
            </aside>
          </div>
        )}

        {/* API reference */}
        {tab === "api" && (
          <div
            role="tabpanel"
            id="panel-api"
            aria-labelledby="tab-api"
            tabIndex={0}
            className="ka-reveal ka-focus mt-8"
          >
            <div
              className="flex items-start gap-3 p-4"
              style={{ backgroundColor: hexA(brand.accentColor, 0.07), border: `1px solid ${hexA(brand.accentColor, 0.28)}`, borderRadius: brand.radius }}
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" style={{ color: brand.accentColor }} />
              <p className="text-[12.5px] leading-relaxed" style={{ color: inkSoft }}>
                <span className="font-semibold" style={{ color: ink }}>Documentation only.</span>{" "}
                These are the endpoints the Knowledge Assistant interface calls on your behalf. There are no
                external API keys, no versioning scheme and no rate-limit plan, because there is no public API.
                Admin-only routes answer 403 for a standard account — ask an administrator for the admin role.
              </p>
            </div>

            <div className="mt-7 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_280px]">
              <section aria-labelledby="h-endpoints">
                <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                  <div>
                    <h2 id="h-endpoints" className="text-[12px] font-semibold uppercase tracking-[0.16em]" style={{ color: inkSoft }}>
                      Endpoint index
                    </h2>
                    <p className="mt-2 text-[12.5px]" style={{ color: inkSoft, fontVariantNumeric: "tabular-nums" }}>
                      Showing <span style={{ color: ink }}>{filtered.length}</span> of {ENDPOINTS.length} endpoints
                    </p>
                  </div>
                  <div className="w-full md:w-72">
                    <Label htmlFor="docs-search" className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider" style={{ color: inkSoft }}>
                      Find an endpoint
                    </Label>
                    <div className="relative">
                      <Search
                        className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2"
                        aria-hidden="true"
                        style={{ color: brand.neutralColor }}
                      />
                      <Input
                        id="docs-search"
                        type="search"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="/documents, chat, delete…"
                        className="ka-focus w-full pl-9 text-[13px]"
                        style={{
                          backgroundColor: surface,
                          border: `1px solid ${line}`,
                          borderRadius: brand.radius,
                          color: "white",
                        }}
                      />
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-1.5">
                  {["All", ...GROUPS].map((g) => {
                    const count = g === "All" ? ENDPOINTS.length : ENDPOINTS.filter((e) => e.group === g).length;
                    const active = group === g;
                    return (
                      <button
                        key={g}
                        type="button"
                        aria-pressed={active}
                        onClick={() => setGroup(g)}
                        className="ka-focus px-2.5 py-1 text-[12px] font-medium"
                        style={{
                          color: active ? brand.backgroundColor : inkSoft,
                          backgroundColor: active ? brand.primaryColor : surface,
                          border: `1px solid ${active ? brand.primaryColor : line}`,
                          borderRadius: brand.radius,
                        }}
                      >
                        {g}
                        <span className="ml-1.5 text-[11px]" style={{ fontVariantNumeric: "tabular-nums", opacity: 0.8 }}>
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {filtered.length === 0 ? (
                  <div
                    className="ka-reveal mt-5 flex flex-col items-center px-6 py-12 text-center"
                    style={{ backgroundColor: surface, border: `1px dashed ${line}`, borderRadius: brand.radius }}
                  >
                    <Search className="h-5 w-5" aria-hidden="true" style={{ color: brand.neutralColor }} />
                    <h3 className="mt-3 text-[14px] font-semibold" style={{ color: "white" }}>
                      Nothing in the reference matches “{query}”
                    </h3>
                    <p className="mt-1.5 max-w-sm text-[12.5px] leading-relaxed" style={{ color: inkSoft }}>
                      Try a path fragment like <span className="font-mono">/documents</span>, a verb like{" "}
                      <span className="font-mono">patch</span>, or clear the filters to see all {ENDPOINTS.length}.
                    </p>
                    <Button
                      type="button"
                      onClick={() => {
                        setQuery("");
                        setGroup("All");
                      }}
                      className="ka-focus mt-4 text-[12.5px] font-medium"
                      style={{ backgroundColor: "transparent", color: ink, border: `1px solid ${line}`, borderRadius: brand.radius }}
                    >
                      Clear search and filters
                    </Button>
                  </div>
                ) : (
                  <div
                    className="mt-5 overflow-hidden"
                    style={{ border: `1px solid ${line}`, borderRadius: brand.radius, backgroundColor: surface }}
                  >
                    <Table className="w-full text-left" style={{ fontVariantNumeric: "tabular-nums" }}>
                      <THead>
                        <TR style={{ borderBottom: `1px solid ${line}` }}>
                          <TH scope="col" className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: inkSoft }}>
                            Method
                          </TH>
                          <TH scope="col" className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: inkSoft }}>
                            Endpoint
                          </TH>
                          <TH scope="col" className="hidden px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider md:table-cell" style={{ color: inkSoft }}>
                            Access
                          </TH>
                          <TH scope="col" className="hidden px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider lg:table-cell" style={{ color: inkSoft }}>
                            What it does
                          </TH>
                        </TR>
                      </THead>
                      <TBody>
                        {filtered.map((e) => {
                          const open = openId === e.id;
                          return (
                            <React.Fragment key={e.id}>
                              <TR
                                className="ka-row"
                                style={{
                                  borderTop: `1px solid ${hexA(brand.neutralColor, 0.12)}`,
                                  backgroundColor: open ? surfaceAlt : "transparent",
                                }}
                              >
                                <TD className="px-4 py-2.5 align-top">
                                  <span
                                    className="inline-block px-1.5 py-0.5 font-mono text-[10.5px] font-bold tracking-wide"
                                    style={{ ...methodStyle(e.method), border: `1px solid`, borderRadius: "0.25rem" }}
                                  >
                                    {e.method}
                                  </span>
                                </TD>
                                <TD className="px-4 py-2.5 align-top">
                                  <button
                                    type="button"
                                    onClick={() => setOpenId(open ? null : e.id)}
                                    aria-expanded={open}
                                    aria-controls={`detail-${e.id}`}
                                    className="ka-focus flex items-center gap-2 text-left font-mono text-[12.5px]"
                                    style={{ color: "white" }}
                                  >
                                    {e.path}
                                    {open ? (
                                      <ChevronDown className="h-3.5 w-3.5 shrink-0" aria-hidden="true" style={{ color: brand.primaryColor }} />
                                    ) : (
                                      <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" style={{ color: brand.neutralColor }} />
                                    )}
                                  </button>
                                  <span className="mt-1 block text-[12px] lg:hidden" style={{ color: inkSoft }}>
                                    {e.summary}
                                  </span>
                                </TD>
                                <TD className="hidden px-4 py-2.5 align-top text-[12px] md:table-cell" style={{ color: e.auth === "Admin only" ? brand.accentColor : inkSoft }}>
                                  {e.auth}
                                </TD>
                                <TD className="hidden px-4 py-2.5 align-top text-[12.5px] lg:table-cell" style={{ color: inkSoft }}>
                                  {e.summary}
                                </TD>
                              </TR>
                              {open && (
                                <TR style={{ backgroundColor: surfaceAlt }}>
                                  <TD colSpan={4} className="px-4 pb-5 pt-1">
                                    <div id={`detail-${e.id}`} className="ka-reveal grid grid-cols-1 gap-5 pl-0 sm:grid-cols-2 sm:pl-16">
                                      <div>
                                        <h4 className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: brand.primaryColor }}>
                                          Request
                                        </h4>
                                        <ul className="mt-2 space-y-1.5">
                                          {e.request.map((r, i) => (
                                            <li key={i} className="font-mono text-[12px] leading-relaxed" style={{ color: ink }}>
                                              {r}
                                            </li>
                                          ))}
                                        </ul>
                                      </div>
                                      <div>
                                        <h4 className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: brand.primaryColor }}>
                                          Response
                                        </h4>
                                        <ul className="mt-2 space-y-1.5">
                                          {e.response.map((r, i) => (
                                            <li key={i} className="font-mono text-[12px] leading-relaxed" style={{ color: ink }}>
                                              {r}
                                            </li>
                                          ))}
                                        </ul>
                                      </div>
                                      {e.notes ? (
                                        <p className="text-[12.5px] leading-relaxed sm:col-span-2" style={{ color: inkSoft }}>
                                          {e.notes}
                                        </p>
                                      ) : null}
                                    </div>
                                  </TD>
                                </TR>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </TBody>
                    </Table>
                  </div>
                )}
              </section>

              <aside className="space-y-5" aria-label="Reference details">
                <section
                  className="p-5"
                  style={{ backgroundColor: surface, border: `1px solid ${line}`, borderRadius: brand.radius }}
                  aria-labelledby="h-conventions"
                >
                  <h2 id="h-conventions" className="text-[13px] font-semibold" style={{ color: "white" }}>
                    Conventions
                  </h2>
                  <ul className="mt-3 space-y-2.5 text-[12.5px] leading-relaxed" style={{ color: inkSoft }}>
                    <li>Every call carries the HTTP-only session cookie; there is no bearer token to manage.</li>
                    <li>All responses are JSON except the download and chat-stream routes.</li>
                    <li>401 means signed out, 403 means signed in without the admin role.</li>
                    <li>Deletes are the only destructive calls and the interface confirms each one first.</li>
                  </ul>
                </section>

                <section
                  className="p-5"
                  style={{ backgroundColor: surface, border: `1px solid ${line}`, borderRadius: brand.radius }}
                  aria-labelledby="h-changelog"
                >
                  <h2 id="h-changelog" className="text-[13px] font-semibold" style={{ color: "white" }}>
                    Recent changes
                  </h2>
                  <ul className="mt-3 space-y-3">
                    {CHANGELOG.map((c) => (
                      <li key={c.date}>
                        <p className="text-[11px] font-medium" style={{ color: brand.primaryColor, fontVariantNumeric: "tabular-nums" }}>
                          {c.date}
                        </p>
                        <p className="mt-0.5 text-[12.5px] leading-relaxed" style={{ color: inkSoft }}>
                          {c.text}
                        </p>
                      </li>
                    ))}
                  </ul>
                </section>
              </aside>
            </div>
          </div>
        )}

        {/* Feedback */}
        <section
          className="mt-10 p-5"
          style={{ backgroundColor: surface, border: `1px solid ${line}`, borderRadius: brand.radius }}
          aria-labelledby="h-feedback"
        >
          <h2 id="h-feedback" className="text-[14px] font-semibold" style={{ color: "white", fontFamily: brand.fontHeading }}>
            Something here out of date?
          </h2>

          {sent ? (
            <div className="ka-reveal mt-3 max-w-2xl">
              <p className="flex items-center gap-2 text-[13px] font-medium" style={{ color: brand.primaryColor }}>
                <CheckCircle className="h-4 w-4" aria-hidden="true" />
                Logged as DOC-214 · 13 Oct 2026
              </p>
              <blockquote
                className="mt-3 px-3 py-2 text-[12.5px] leading-relaxed"
                style={{ color: inkSoft, borderLeft: `2px solid ${hexA(brand.primaryColor, 0.45)}`, backgroundColor: surfaceAlt, borderRadius: brand.radius }}
              >
                {sent}
              </blockquote>
              <Button
                type="button"
                onClick={() => {
                  setSent(null);
                  setNote("");
                }}
                className="ka-focus mt-4 text-[12.5px] font-medium"
                style={{ backgroundColor: "transparent", color: ink, border: `1px solid ${line}`, borderRadius: brand.radius }}
              >
                Write another note
              </Button>
            </div>
          ) : (
            <form className="mt-3 max-w-2xl" onSubmit={submitNote} noValidate>
              <Label htmlFor="docs-note" className="mb-1.5 block text-[12.5px]" style={{ color: inkSoft }}>
                Tell the platform team which page and what is wrong. It reaches us in #knowledge-assistant.
              </Label>
              <Textarea
                id="docs-note"
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                aria-invalid={noteError ? "true" : "false"}
                aria-describedby={noteError ? "docs-note-error" : undefined}
                placeholder="The reprocess endpoint still shows the old retry path…"
                className="ka-focus w-full p-3 text-[13px]"
                style={{
                  backgroundColor: brand.backgroundColor,
                  border: `1px solid ${noteError ? brand.accentColor : line}`,
                  borderRadius: brand.radius,
                  color: "white",
                }}
              />
              {noteError ? (
                <p
                  id="docs-note-error"
                  role="alert"
                  className="ka-reveal mt-2 flex items-start gap-1.5 text-[12.5px]"
                  style={{ color: brand.accentColor }}
                >
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  {noteError}
                </p>
              ) : null}
              <Button
                type="submit"
                className="ka-focus mt-3 text-[13px] font-semibold"
                style={{ backgroundColor: brand.primaryColor, color: brand.backgroundColor, borderRadius: brand.radius }}
              >
                Send to the docs team
              </Button>
            </form>
          )}
        </section>

        <p className="mt-8 text-[12px]" style={{ color: hexA(brand.neutralColor, 0.8) }}>
          Knowledge Assistant is an internal tool. Accounts are created by an administrator — there is no sign-up,
          no billing and no public API.
        </p>
      </div>
    </div>
  );
}
