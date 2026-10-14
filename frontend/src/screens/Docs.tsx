import * as React from "react";

import { brand } from "@/lib/brand";
import { Table, THead, TBody, TR, TH, TD } from "@/lib/ui";

/**
 * Public documentation for the application itself (US-040-1). This screen is
 * reachable without signing in (see App.tsx's unguarded `/docs` route) and
 * never calls an authenticated endpoint on mount -- everything rendered here
 * is static prose plus a hand-maintained table of this app's own endpoints,
 * not a live fetch against anything. It replaces an earlier prototype that
 * fabricated a changelog, a build-snapshot/"last verified" strip and a fake
 * feedback form; none of that is real, so none of it is here.
 */

type TabId = "start" | "api";

const TABS: Array<{ id: TabId; label: string }> = [
  { id: "start", label: "Getting started" },
  { id: "api", label: "API reference" },
];

type Method = "GET" | "POST" | "PATCH" | "DELETE";

type Endpoint = {
  id: string;
  group: string;
  method: Method;
  path: string;
  auth: string;
  summary: string;
  request: string[];
  response: string[];
  notes?: string;
};

const METHOD_STYLES: Record<Method, string> = {
  GET: "bg-slate-100 text-slate-700",
  POST: "bg-emerald-50 text-emerald-700",
  PATCH: "bg-amber-50 text-amber-700",
  DELETE: "bg-red-50 text-red-700",
};

function MethodBadge({ method }: { method: Method }) {
  return (
    <span
      className={
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium " +
        METHOD_STYLES[method]
      }
    >
      {method}
    </span>
  );
}

// AC-091: documents exactly the endpoints implemented in
// backend/app/routers/* -- nothing invented, no versioning, no API keys.
const ENDPOINTS: Endpoint[] = [
  {
    id: "auth-login",
    group: "Auth",
    method: "POST",
    path: "/auth/login",
    auth: "Public",
    summary: "Exchange an email and password for an HTTP-only session cookie.",
    request: ["email — string", "password — string"],
    response: [
      "200 — sets the session cookie; body { user: { id, email, role, is_active, theme } }",
      '401 — "Email or password is incorrect" (also returned for an unknown email, a disabled account, or a locked-out email)',
    ],
    notes: "The 401 body is identical in every failure case, so nothing reveals which one occurred.",
  },
  {
    id: "auth-logout",
    group: "Auth",
    method: "POST",
    path: "/auth/logout",
    auth: "Signed in",
    summary: "Revoke the current session and clear the cookie.",
    request: ["no body"],
    response: ["204 — no body"],
  },
  {
    id: "auth-me",
    group: "Auth",
    method: "GET",
    path: "/auth/me",
    auth: "Signed in",
    summary: "The signed-in account, used to restore a session after a reload.",
    request: ["no parameters"],
    response: ["200 — { user: { id, email, role, is_active, theme } }"],
  },
  {
    id: "users-list",
    group: "Account & users",
    method: "GET",
    path: "/users",
    auth: "Admin only",
    summary: "Every provisioned account.",
    request: ["no parameters"],
    response: ["200 — [{ id, email, role, is_active, theme, created_at }]"],
    notes: "A password hash is never serialised by any endpoint.",
  },
  {
    id: "users-create",
    group: "Account & users",
    method: "POST",
    path: "/users",
    auth: "Public only until the first account exists, then Admin only",
    summary: "Create an account with a caller-supplied password.",
    request: ["email — string", "password — string"],
    response: [
      '201 — { id, email, role, is_active, theme, temporary_password } — role is "admin" for the very first account ever created, "user" for every account after that',
    ],
    notes: "The password is echoed once, in this response only — never in GET /users or /auth/me.",
  },
  {
    id: "users-patch",
    group: "Account & users",
    method: "PATCH",
    path: "/users/{id}",
    auth: "Admin only",
    summary: "Enable or disable an account, reset its password, or change its role.",
    request: [
      "is_active — boolean (optional)",
      "password — string (optional)",
      'role — "admin" | "user" (optional)',
    ],
    response: ["200 — the updated user record"],
  },
  {
    id: "account-password",
    group: "Account & users",
    method: "POST",
    path: "/account/password",
    auth: "Signed in",
    summary: "Replace your own password after confirming the current one.",
    request: ["current_password — string", "new_password — string"],
    response: ["200 — { status: \"ok\" }", "400 — current password is incorrect"],
  },
  {
    id: "account-theme",
    group: "Account & users",
    method: "PATCH",
    path: "/account/theme",
    auth: "Signed in",
    summary: "Persist the Light, Dark or System theme choice on the signed-in user.",
    request: ['theme — "light" | "dark" | "system"'],
    response: ["200 — { theme }"],
  },
  {
    id: "docs-upload",
    group: "Documents",
    method: "POST",
    path: "/documents",
    auth: "Admin only",
    summary: "Upload a file and queue it for extraction, chunking and indexing.",
    request: ["multipart/form-data — file (PDF, DOCX, TXT or MD, up to 25 MB)"],
    response: [
      '201 — { id, filename, file_type, size_bytes, status: "processing", created_at }',
      "400 — unsupported file type",
      "413 — file exceeds the 25 MB limit",
    ],
    notes: "Returns as soon as the original file is stored; processing continues in a background worker.",
  },
  {
    id: "docs-list",
    group: "Documents",
    method: "GET",
    path: "/documents",
    auth: "Signed in",
    summary: "The document table, with search and filters applied server-side.",
    request: [
      "q — filename substring (optional)",
      "status — processing | ready | failed (optional)",
      "type — pdf | docx | txt | md (optional)",
    ],
    response: [
      "200 — [{ id, filename, file_type, size_bytes, status, failure_reason, notes, chunk_count, uploaded_by, created_at }]",
    ],
  },
  {
    id: "docs-stats",
    group: "Documents",
    method: "GET",
    path: "/documents/stats",
    auth: "Signed in",
    summary: "Counts behind the Knowledge Base tiles.",
    request: ["no parameters"],
    response: ["200 — { total, ready, processing, failed, chunks, bytes }"],
  },
  {
    id: "docs-download",
    group: "Documents",
    method: "GET",
    path: "/documents/{id}/download",
    auth: "Signed in",
    summary: "Download the original uploaded file, unchanged.",
    request: ["no parameters"],
    response: [
      "200 — the original file bytes, with a Content-Disposition attachment header",
      "404 — unknown id",
    ],
  },
  {
    id: "docs-reprocess",
    group: "Documents",
    method: "POST",
    path: "/documents/{id}/reprocess",
    auth: "Admin only",
    summary: "Retry a failed document, or re-index a ready one.",
    request: ['mode — "retry" | "reindex"'],
    response: [
      "200 — the document, set back to processing",
      '409 — "retry" requires a failed document, "reindex" requires a ready one',
      "404 — unknown id",
    ],
  },
  {
    id: "docs-delete",
    group: "Documents",
    method: "DELETE",
    path: "/documents/{id}",
    auth: "Admin only",
    summary: "Remove a document, its chunks and its stored file.",
    request: ["no body"],
    response: ["204 — no body", "404 — unknown id"],
  },
  {
    id: "conversations-list",
    group: "Conversations",
    method: "GET",
    path: "/conversations",
    auth: "Signed in",
    summary: "The signed-in user's own conversations, newest first.",
    request: [
      "q — optional search term; when present, only conversations whose title or message content contains it (case-insensitive) are returned",
    ],
    response: ["200 — [{ id, title, created_at, updated_at }]"],
    notes: "A blank or absent q returns the full list; a q that matches nothing returns an empty list, never a 404.",
  },
  {
    id: "conversations-create",
    group: "Conversations",
    method: "POST",
    path: "/conversations",
    auth: "Signed in",
    summary: "Create a new, empty conversation.",
    request: ["title — string (optional)"],
    response: ["201 — { id, title, created_at, updated_at }"],
  },
  {
    id: "conversations-detail",
    group: "Conversations",
    method: "GET",
    path: "/conversations/{id}",
    auth: "Signed in",
    summary: "One conversation and every message in it, in order.",
    request: ["no parameters"],
    response: [
      "200 — { id, title, created_at, updated_at, messages: [{ id, role, content, from_documents, citations: [...], created_at }] }",
      "404 — unknown id, or an id that belongs to another account",
    ],
    notes: "A conversation belonging to someone else looks identical to one that does not exist at all.",
  },
  {
    id: "conversations-delete",
    group: "Conversations",
    method: "DELETE",
    path: "/conversations/{id}",
    auth: "Signed in",
    summary: "Delete a conversation and everything in it.",
    request: ["no body"],
    response: ["204 — no body", "404 — unknown id, or an id that belongs to another account"],
  },
  {
    id: "chat",
    group: "Chat",
    method: "POST",
    path: "/chat",
    auth: "Signed in",
    summary: "Ask a question; retrieval always runs before an answer is generated.",
    request: ["conversation_id — string (a new id starts a new conversation)", "question — string"],
    response: [
      "200 — a single JSON body: { conversation_id, answer, from_documents, citations: [{ number, document_id, chunk_id, filename, page_ref, section_ref, text_preview, score }] }",
      "503 — { code, message } when the generation provider fails; nothing is written to the database on this path",
    ],
    notes:
      "This is a plain JSON response, not a server-sent-events or streaming response — the full answer arrives in one body.",
  },
  {
    id: "settings-get",
    group: "Settings",
    method: "GET",
    path: "/settings",
    auth: "Signed in",
    summary: "The retrieval threshold and answer model in force right now.",
    request: ["no parameters"],
    response: ["200 — { similarity_threshold, answer_model }"],
  },
  {
    id: "settings-patch",
    group: "Settings",
    method: "PATCH",
    path: "/settings",
    auth: "Admin only",
    summary: "Change the retrieval threshold or the answer model.",
    request: ["similarity_threshold — number between 0 and 1 (optional)", "answer_model — string (optional)"],
    response: ["200 — { similarity_threshold, answer_model }", "422 — threshold outside 0–1"],
  },
];

const GROUPS = Array.from(new Set(ENDPOINTS.map((e) => e.group)));

function DocsOnlyNotice() {
  return (
    <div
      role="note"
      className="rounded-[var(--brand-radius)] border px-4 py-3 text-sm"
      style={{
        borderColor: brand.warningColor,
        backgroundColor: "color-mix(in srgb, " + brand.warningColor + " 12%, transparent)",
        fontFamily: brand.fontBody,
      }}
    >
      <p className="font-semibold">{"This page documents this application only."}</p>
      <p className="mt-1">
        {
          "No external API keys are issued, and there is no external consumption, versioning or rate-limit scheme — a public API is out of scope for this application. Everything below describes endpoints this app's own frontend calls, for engineers and administrators working on it."
        }
      </p>
    </div>
  );
}

function GettingStarted() {
  const sectionCls = "space-y-2";
  const headingCls = "text-base font-semibold";
  const bodyCls = "text-sm leading-relaxed";

  return (
    <div className="space-y-6" style={{ fontFamily: brand.fontBody }}>
      <section className={sectionCls}>
        <h2 className={headingCls} style={{ fontFamily: brand.fontHeading }}>
          {"Signing in"}
        </h2>
        <p className={bodyCls}>
          {
            "There is no sign-up form. An administrator provisions your account and hands you a temporary password out of band — enter your email and that password on the Sign In page. Once you are in, change your password on the Account page; there is no self-service password reset."
          }
        </p>
      </section>

      <section className={sectionCls}>
        <h2 className={headingCls} style={{ fontFamily: brand.fontHeading }}>
          {"Asking a question"}
        </h2>
        <p className={bodyCls}>
          {
            "Type a question in plain language on the Chat page and send it. Every question searches the company's indexed documents before an answer is written, including follow-up questions in the same conversation — you can ask \"and for contractors?\" without repeating the original question."
          }
        </p>
      </section>

      <section className={sectionCls}>
        <h2 className={headingCls} style={{ fontFamily: brand.fontHeading }}>
          {"Reading numbered citations and the source panel"}
        </h2>
        <p className={bodyCls}>
          {
            "When an answer is grounded in your documents, it carries small numbered chips, like [1] and [2]. Opening a chip shows the source panel: the filename it came from, the page or section, the exact retrieved text, and a link to download the original file. Citations are saved with the message, so reopening a past conversation shows the same ones."
          }
        </p>
      </section>

      <section className={sectionCls}>
        <h2 className={headingCls} style={{ fontFamily: brand.fontHeading }}>
          {'What "Not from your documents" means'}
        </h2>
        <p className={bodyCls}>
          {
            "When nothing in the knowledge base is a close enough match, the assistant still answers — from its general knowledge rather than your documents — and marks that answer with a \"Not from your documents\" badge instead of any citations. Treat those answers as background, not as your organisation's policy."
          }
        </p>
      </section>

      <section className={sectionCls}>
        <h2 className={headingCls} style={{ fontFamily: brand.fontHeading }}>
          {"Adding documents (administrators)"}
        </h2>
        <p className={bodyCls}>
          {
            "On the Knowledge Base page, an administrator uploads PDF, DOCX, TXT or MD files up to 25 MB. A new document shows as Processing and moves to Ready on its own once it has been extracted, chunked and indexed. A document that fails keeps its file and its failure reason until an administrator retries, re-indexes or deletes it — standard accounts can view and download documents on this page, but cannot upload, retry, re-index or delete."
          }
        </p>
      </section>
    </div>
  );
}

function ApiReference() {
  return (
    <div className="space-y-6">
      {GROUPS.map((group) => (
        <section key={group} className="space-y-2">
          <h2 className="text-base font-semibold" style={{ fontFamily: brand.fontHeading }}>
            {group}
          </h2>
          <Table>
            <THead>
              <TR>
                <TH>Method</TH>
                <TH>Path</TH>
                <TH>Access</TH>
                <TH>Summary</TH>
                <TH>Request</TH>
                <TH>Response</TH>
              </TR>
            </THead>
            <TBody>
              {ENDPOINTS.filter((e) => e.group === group).map((endpoint) => (
                <TR key={endpoint.id}>
                  <TD>
                    <MethodBadge method={endpoint.method} />
                  </TD>
                  <TD>
                    <code>{endpoint.path}</code>
                  </TD>
                  <TD>{endpoint.auth}</TD>
                  <TD>
                    <p>{endpoint.summary}</p>
                    {endpoint.notes ? <p className="mt-1 text-xs text-slate-500">{endpoint.notes}</p> : null}
                  </TD>
                  <TD>
                    <ul className="list-disc pl-4">
                      {endpoint.request.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  </TD>
                  <TD>
                    <ul className="list-disc pl-4">
                      {endpoint.response.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </section>
      ))}
    </div>
  );
}

export default function Docs() {
  const [tab, setTab] = React.useState<TabId>("start");

  return (
    <div className="min-h-full px-5 py-6 lg:px-8" style={{ fontFamily: brand.fontBody }}>
      <div className="mx-auto max-w-5xl space-y-5">
        <div>
          <h1 className="text-2xl font-semibold" style={{ fontFamily: brand.fontHeading }}>
            {"Documentation"}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {"How to use this application, and the endpoints it is built on."}
          </p>
        </div>

        <DocsOnlyNotice />

        <div role="tablist" aria-label="Documentation sections" className="flex gap-1 border-b">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className="-mb-px border-b-2 px-3 py-2 text-sm font-medium"
              style={{
                borderColor: tab === t.id ? brand.primaryColor : "transparent",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "start" ? <GettingStarted /> : <ApiReference />}
      </div>
    </div>
  );
}
