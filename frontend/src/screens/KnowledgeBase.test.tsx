import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import KnowledgeBase from "./KnowledgeBase";
import { AuthProvider } from "@/lib/auth";

type Doc = {
  id: string;
  filename: string;
  file_type: string;
  size_bytes: number;
  status: string;
  failure_reason: string | null;
  notes: string | null;
  chunk_count: number;
  uploaded_by: string;
  created_at: string;
};

function ok(body: unknown, status = 200) {
  return Promise.resolve({ ok: true, status, json: async () => body });
}

function statsFromDocs(docs: Doc[]) {
  return {
    total: docs.length,
    ready: docs.filter((d) => d.status === "ready").length,
    processing: docs.filter((d) => d.status === "processing").length,
    failed: docs.filter((d) => d.status === "failed").length,
    chunks: docs.reduce((sum, d) => sum + d.chunk_count, 0),
    bytes: docs.reduce((sum, d) => sum + d.size_bytes, 0),
  };
}

function makeFetch(opts: { role: string; documents: Doc[] }) {
  let docs = [...opts.documents];
  const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
    const u = new URL(url, "http://localhost");
    const path = u.pathname;
    const method = (init?.method ?? "GET").toUpperCase();

    if (path.endsWith("/auth/me")) {
      return ok({ id: "1", email: "me@example.com", role: opts.role, is_active: true });
    }
    if (path === "/documents" && method === "GET") {
      const q = (u.searchParams.get("q") ?? "").toLowerCase();
      const status = u.searchParams.get("status") ?? "";
      const type = u.searchParams.get("type") ?? "";
      const filtered = docs.filter(
        (d) =>
          (!q || d.filename.toLowerCase().includes(q)) &&
          (!status || d.status === status) &&
          (!type || d.file_type === type),
      );
      return ok(filtered);
    }
    if (path === "/documents/stats" && method === "GET") {
      return ok(statsFromDocs(docs));
    }
    if (/\/documents\/[^/]+\/reprocess$/.test(path) && method === "POST") {
      return ok({ endpoint: "x" });
    }
    if (/\/documents\/[^/]+$/.test(path) && method === "DELETE") {
      const id = path.split("/").pop();
      docs = docs.filter((d) => d.id !== id);
      return Promise.resolve({ ok: true, status: 204, json: async () => ({}) });
    }
    if (path.endsWith("/auth/logout")) {
      return Promise.resolve({ ok: true, status: 204, json: async () => ({}) });
    }
    return Promise.reject(new Error(`unexpected ${method} ${path}`));
  });
  return {
    fetchMock,
    setDocuments(next: Doc[]) {
      docs = next;
    },
  };
}

function renderKB() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <KnowledgeBase />
      </AuthProvider>
    </MemoryRouter>,
  );
}

function doc(overrides: Partial<Doc>): Doc {
  return {
    id: "doc-1",
    filename: "report.pdf",
    file_type: "pdf",
    size_bytes: 12_345,
    status: "ready",
    failure_reason: null,
    notes: null,
    chunk_count: 3,
    uploaded_by: "admin@example.com",
    created_at: "2026-01-15T10:00:00Z",
    ...overrides,
  };
}

// Stat tile labels ("Ready", "Processing", "Failed") share text with the
// status-filter <select> options, so tile assertions below match only the
// <p> label element the Stat component renders, not the <option>.
function statTileValue(label: string): string {
  const labelNode = screen.getByText(
    (content, element) => content === label && element?.tagName === "P",
  );
  return labelNode.closest("div")?.textContent ?? "";
}

describe("KnowledgeBase screen", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders name, file type, size, uploaded date and status for each row (AC-021)", async () => {
    const { fetchMock } = makeFetch({
      role: "admin",
      documents: [doc({ filename: "Quarterly-Report.pdf", file_type: "pdf", size_bytes: 12_345 })],
    });
    vi.stubGlobal("fetch", fetchMock);
    renderKB();

    await waitFor(() => expect(screen.getByText("Quarterly-Report.pdf")).toBeInTheDocument());
    const row = screen.getByRole("row", { name: /Quarterly-Report\.pdf/i });
    expect(within(row).getByText("PDF")).toBeInTheDocument();
    expect(within(row).getByText(/KB/)).toBeInTheDocument();
    expect(within(row).getByText("ready")).toBeInTheDocument();
    expect(within(row).getByText(/\d{1,2}\/\d{1,2}\/\d{4}/)).toBeInTheDocument();
  });

  it("an administrator's row shows download, delete and retry/re-index actions (AC-022)", async () => {
    const { fetchMock } = makeFetch({
      role: "admin",
      documents: [
        doc({ id: "d-ready", filename: "ready.pdf", status: "ready" }),
        doc({ id: "d-failed", filename: "failed.pdf", status: "failed", failure_reason: "bad" }),
      ],
    });
    vi.stubGlobal("fetch", fetchMock);
    renderKB();

    const readyRow = await screen.findByRole("row", { name: /ready\.pdf/i });
    expect(within(readyRow).getByRole("button", { name: /download/i })).toBeInTheDocument();
    expect(within(readyRow).getByRole("button", { name: /delete/i })).toBeInTheDocument();
    expect(within(readyRow).getByRole("button", { name: /re-?index/i })).toBeInTheDocument();

    const failedRow = screen.getByRole("row", { name: /failed\.pdf/i });
    expect(within(failedRow).getByRole("button", { name: /^retry$/i })).toBeInTheDocument();
    expect(within(failedRow).getByRole("button", { name: /delete/i })).toBeInTheDocument();
  });

  it("a standard user's row shows download only (AC-022)", async () => {
    const { fetchMock } = makeFetch({
      role: "member",
      documents: [doc({ filename: "ready.pdf", status: "ready" })],
    });
    vi.stubGlobal("fetch", fetchMock);
    renderKB();

    const row = await screen.findByRole("row", { name: /ready\.pdf/i });
    expect(within(row).getByRole("button", { name: /download/i })).toBeInTheDocument();
    expect(within(row).queryByRole("button", { name: /delete/i })).not.toBeInTheDocument();
    expect(within(row).queryByRole("button", { name: /re-?index/i })).not.toBeInTheDocument();
    expect(within(row).queryByRole("button", { name: /^retry$/i })).not.toBeInTheDocument();
  });

  it("shows the administrator-upload empty state when there are no documents at all, for an admin (AC-153)", async () => {
    const { fetchMock } = makeFetch({ role: "admin", documents: [] });
    vi.stubGlobal("fetch", fetchMock);
    renderKB();

    await waitFor(() =>
      expect(screen.getByText(/administrator needs to upload documents/i)).toBeInTheDocument(),
    );
  });

  it("shows the same administrator-upload empty state when there are no documents at all, for a standard user (AC-153)", async () => {
    const { fetchMock } = makeFetch({ role: "member", documents: [] });
    vi.stubGlobal("fetch", fetchMock);
    renderKB();

    await waitFor(() =>
      expect(screen.getByText(/administrator needs to upload documents/i)).toBeInTheDocument(),
    );
  });

  it("shows correct total, Ready, Processing and Failed counts from GET /documents/stats (AC-023)", async () => {
    const { fetchMock } = makeFetch({
      role: "admin",
      documents: [
        doc({ id: "1", filename: "a.pdf", status: "ready" }),
        doc({ id: "2", filename: "b.pdf", status: "processing" }),
        doc({ id: "3", filename: "c.pdf", status: "failed" }),
        doc({ id: "4", filename: "d.pdf", status: "failed" }),
      ],
    });
    vi.stubGlobal("fetch", fetchMock);
    renderKB();

    await screen.findByText("a.pdf");
    expect(screen.getByText("Total").closest("div")?.textContent).toContain("4");
    expect(statTileValue("Ready")).toContain("1");
    expect(statTileValue("Processing")).toContain("1");
    expect(statTileValue("Failed")).toContain("2");
  });

  it("a document that fails shows status Failed with its failure_reason rendered as readable text (AC-020)", async () => {
    const { fetchMock } = makeFetch({
      role: "admin",
      documents: [
        doc({
          filename: "broken.pdf",
          status: "failed",
          failure_reason: "The file could not be parsed as a valid PDF.",
        }),
      ],
    });
    vi.stubGlobal("fetch", fetchMock);
    renderKB();

    const row = await screen.findByRole("row", { name: /broken\.pdf/i });
    expect(within(row).getByText("failed")).toBeInTheDocument();
    expect(
      within(row).getByText("The file could not be parsed as a valid PDF."),
    ).toBeInTheDocument();
  });

  it("typing part of a filename filters the list case-insensitively (AC-025)", async () => {
    const { fetchMock } = makeFetch({
      role: "admin",
      documents: [
        doc({ id: "1", filename: "Alpha-Report.pdf" }),
        doc({ id: "2", filename: "beta-notes.txt", file_type: "txt" }),
      ],
    });
    vi.stubGlobal("fetch", fetchMock);
    renderKB();

    await screen.findByText("Alpha-Report.pdf");
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Search"), "alpha");

    await waitFor(() => {
      expect(screen.getByText("Alpha-Report.pdf")).toBeInTheDocument();
      expect(screen.queryByText("beta-notes.txt")).not.toBeInTheDocument();
    });
  });

  it("status and type filters combine with the search term so only matching documents are listed (AC-026)", async () => {
    const { fetchMock } = makeFetch({
      role: "admin",
      documents: [
        doc({ id: "1", filename: "Alpha-Report.pdf", file_type: "pdf", status: "ready" }),
        doc({ id: "2", filename: "Alpha-Notes.txt", file_type: "txt", status: "ready" }),
        doc({ id: "3", filename: "Alpha-Draft.pdf", file_type: "pdf", status: "failed" }),
      ],
    });
    vi.stubGlobal("fetch", fetchMock);
    renderKB();

    await screen.findByText("Alpha-Report.pdf");
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Search"), "alpha");
    await user.selectOptions(screen.getByLabelText("Status"), "ready");
    await user.selectOptions(screen.getByLabelText("Type"), "pdf");

    await waitFor(() => {
      expect(screen.getByText("Alpha-Report.pdf")).toBeInTheDocument();
      expect(screen.queryByText("Alpha-Notes.txt")).not.toBeInTheDocument();
      expect(screen.queryByText("Alpha-Draft.pdf")).not.toBeInTheDocument();
    });
  });

  it("shows a distinct 'no documents match' message with a clear-filters control when filters match nothing (AC-154)", async () => {
    const { fetchMock } = makeFetch({
      role: "admin",
      documents: [doc({ filename: "report.pdf" })],
    });
    vi.stubGlobal("fetch", fetchMock);
    renderKB();

    await screen.findByText("report.pdf");
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Search"), "nonexistent");

    await waitFor(() =>
      expect(screen.getByText(/no documents match your filters/i)).toBeInTheDocument(),
    );
    expect(screen.queryByText(/administrator needs to upload documents/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /clear filters/i }));

    await waitFor(() => expect(screen.getByText("report.pdf")).toBeInTheDocument());
  });

  it("deleting a document updates the table and tiles without a manual refresh (AC-024)", async () => {
    const { fetchMock } = makeFetch({
      role: "admin",
      documents: [doc({ id: "del-1", filename: "to-delete.pdf" })],
    });
    vi.stubGlobal("fetch", fetchMock);
    renderKB();

    const row = await screen.findByRole("row", { name: /to-delete\.pdf/i });
    const user = userEvent.setup();
    await user.click(within(row).getByRole("button", { name: /delete/i }));

    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: /^delete$/i }));

    await waitFor(() => expect(screen.queryByText("to-delete.pdf")).not.toBeInTheDocument());
    await waitFor(() =>
      expect(screen.getByText("Total").closest("div")?.textContent).toContain("0"),
    );
  });

  it("a document in Processing moves to Ready with no manual refresh once backend processing completes (AC-019/AC-024)", async () => {
    const processingDoc = doc({ id: "p-1", filename: "pending.pdf", status: "processing" });
    const { fetchMock, setDocuments } = makeFetch({ role: "admin", documents: [processingDoc] });
    vi.stubGlobal("fetch", fetchMock);
    renderKB();

    const row = await screen.findByRole("row", { name: /pending\.pdf/i });
    expect(within(row).getByText("processing")).toBeInTheDocument();

    setDocuments([{ ...processingDoc, status: "ready" }]);

    await waitFor(
      () => {
        const updatedRow = screen.getByRole("row", { name: /pending\.pdf/i });
        expect(within(updatedRow).getByText("ready")).toBeInTheDocument();
      },
      { timeout: 7000 },
    );
  }, 8000);
});
