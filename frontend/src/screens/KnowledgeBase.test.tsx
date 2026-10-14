import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

function makeFetch(opts: {
  role: string;
  documents: Doc[];
  downloadHeaders?: Record<string, string>;
  downloadOk?: boolean;
}) {
  let docs = [...opts.documents];
  const reprocessCalls: Array<{ id: string; mode: string }> = [];
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
    if (/\/documents\/[^/]+\/download$/.test(path) && method === "GET") {
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
    if (/\/documents\/[^/]+\/reprocess$/.test(path) && method === "POST") {
      const id = path.split("/")[2];
      const body = init?.body ? JSON.parse(init.body as string) : {};
      reprocessCalls.push({ id, mode: body.mode });
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
    reprocessCalls,
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

function findCall(
  fetchMock: ReturnType<typeof vi.fn>,
  predicate: (url: string, init: RequestInit | undefined) => boolean,
) {
  return fetchMock.mock.calls.find((call) =>
    predicate(call[0] as string, call[1] as RequestInit | undefined),
  );
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

  it("Retry is offered only on Failed rows and Re-index only on Ready rows (AC-031/AC-032)", async () => {
    const { fetchMock } = makeFetch({
      role: "admin",
      documents: [
        doc({ id: "d-ready", filename: "ready.pdf", status: "ready" }),
        doc({ id: "d-failed", filename: "failed.pdf", status: "failed" }),
        doc({ id: "d-processing", filename: "processing.pdf", status: "processing" }),
      ],
    });
    vi.stubGlobal("fetch", fetchMock);
    renderKB();

    const readyRow = await screen.findByRole("row", { name: /ready\.pdf/i });
    expect(within(readyRow).queryByRole("button", { name: /^retry$/i })).not.toBeInTheDocument();
    const failedRow = screen.getByRole("row", { name: /failed\.pdf/i });
    expect(within(failedRow).queryByRole("button", { name: /re-?index/i })).not.toBeInTheDocument();
    const processingRow = screen.getByRole("row", { name: /processing\.pdf/i });
    expect(
      within(processingRow).queryByRole("button", { name: /^retry$/i }),
    ).not.toBeInTheDocument();
    expect(
      within(processingRow).queryByRole("button", { name: /re-?index/i }),
    ).not.toBeInTheDocument();
  });

  it("Retry posts /documents/{id}/reprocess with mode retry and refreshes (AC-031)", async () => {
    const { fetchMock, reprocessCalls } = makeFetch({
      role: "admin",
      documents: [doc({ id: "d-failed", filename: "failed.pdf", status: "failed" })],
    });
    vi.stubGlobal("fetch", fetchMock);
    renderKB();

    const row = await screen.findByRole("row", { name: /failed\.pdf/i });
    const user = userEvent.setup();
    await user.click(within(row).getByRole("button", { name: /^retry$/i }));

    await waitFor(() => expect(reprocessCalls).toContainEqual({ id: "d-failed", mode: "retry" }));
  });

  it("Re-index posts /documents/{id}/reprocess with mode reindex and refreshes (AC-032)", async () => {
    const { fetchMock, reprocessCalls } = makeFetch({
      role: "admin",
      documents: [doc({ id: "d-ready", filename: "ready.pdf", status: "ready" })],
    });
    vi.stubGlobal("fetch", fetchMock);
    renderKB();

    const row = await screen.findByRole("row", { name: /ready\.pdf/i });
    const user = userEvent.setup();
    await user.click(within(row).getByRole("button", { name: /re-?index/i }));

    await waitFor(() => expect(reprocessCalls).toContainEqual({ id: "d-ready", mode: "reindex" }));
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

  it("deleting a document updates the table and tiles without a manual refresh (AC-024/AC-029)", async () => {
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
    const deleteCall = findCall(
      fetchMock,
      (url, init) => url.endsWith("/documents/del-1") && init?.method === "DELETE",
    );
    expect(deleteCall).toBeTruthy();
  });

  it("cancelling the delete confirmation issues no DELETE request and leaves the row in Ready (AC-028)", async () => {
    const { fetchMock } = makeFetch({
      role: "admin",
      documents: [doc({ id: "keep-1", filename: "keep-me.pdf", status: "ready" })],
    });
    vi.stubGlobal("fetch", fetchMock);
    renderKB();

    const row = await screen.findByRole("row", { name: /keep-me\.pdf/i });
    const user = userEvent.setup();
    await user.click(within(row).getByRole("button", { name: /delete/i }));

    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: /cancel/i }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByRole("row", { name: /keep-me\.pdf/i })).toBeInTheDocument();
    expect(
      within(screen.getByRole("row", { name: /keep-me\.pdf/i })).getByText("ready"),
    ).toBeInTheDocument();
    const deleteCall = findCall(fetchMock, (_url, init) => init?.method === "DELETE");
    expect(deleteCall).toBeFalsy();
  });

  describe("delete confirmation keyboard behaviour (US-039-2/AC-087)", () => {
    it("Escape closes the delete confirmation without issuing a DELETE request", async () => {
      const { fetchMock } = makeFetch({
        role: "admin",
        documents: [doc({ id: "keep-2", filename: "keep-esc.pdf", status: "ready" })],
      });
      vi.stubGlobal("fetch", fetchMock);
      renderKB();

      const row = await screen.findByRole("row", { name: /keep-esc\.pdf/i });
      const user = userEvent.setup();
      const deleteButton = within(row).getByRole("button", { name: /delete/i });
      await user.click(deleteButton);

      await screen.findByRole("dialog");
      await user.keyboard("{Escape}");

      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      const deleteCall = findCall(fetchMock, (_url, init) => init?.method === "DELETE");
      expect(deleteCall).toBeFalsy();
      // Focus returns to the row control that opened the dialog.
      expect(deleteButton).toHaveFocus();
    });

    it("opening the dialog moves focus into it and Tab cannot escape it (focus trap)", async () => {
      const { fetchMock } = makeFetch({
        role: "admin",
        documents: [doc({ id: "trap-1", filename: "trap.pdf", status: "ready" })],
      });
      vi.stubGlobal("fetch", fetchMock);
      renderKB();

      const row = await screen.findByRole("row", { name: /trap\.pdf/i });
      const user = userEvent.setup();
      await user.click(within(row).getByRole("button", { name: /delete/i }));

      const dialog = await screen.findByRole("dialog");
      const cancelButton = within(dialog).getByRole("button", { name: /cancel/i });
      const deleteConfirmButton = within(dialog).getByRole("button", { name: /^delete$/i });

      expect(cancelButton).toHaveFocus();

      deleteConfirmButton.focus();
      await user.tab();
      expect(cancelButton).toHaveFocus();

      await user.tab({ shift: true });
      expect(deleteConfirmButton).toHaveFocus();
    });

    it("Cancel also returns focus to the row's delete control", async () => {
      const { fetchMock } = makeFetch({
        role: "admin",
        documents: [doc({ id: "keep-3", filename: "keep-cancel.pdf", status: "ready" })],
      });
      vi.stubGlobal("fetch", fetchMock);
      renderKB();

      const row = await screen.findByRole("row", { name: /keep-cancel\.pdf/i });
      const user = userEvent.setup();
      const deleteButton = within(row).getByRole("button", { name: /delete/i });
      await user.click(deleteButton);

      const dialog = await screen.findByRole("dialog");
      await user.click(within(dialog).getByRole("button", { name: /cancel/i }));

      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(deleteButton).toHaveFocus();
    });
  });

  it("the document table declares column header semantics for every column", async () => {
    const { fetchMock } = makeFetch({
      role: "admin",
      documents: [doc({ filename: "headers.pdf" })],
    });
    vi.stubGlobal("fetch", fetchMock);
    renderKB();

    await screen.findByText("headers.pdf");
    const headers = screen.getAllByRole("columnheader");
    expect(headers.length).toBeGreaterThanOrEqual(8);
    headers.forEach((header) => expect(header).toHaveAttribute("scope", "col"));
  });

  describe("download (AC-027)", () => {
    let originalCreateObjectURL: typeof URL.createObjectURL;
    let originalRevokeObjectURL: typeof URL.revokeObjectURL;

    beforeEach(() => {
      originalCreateObjectURL = URL.createObjectURL;
      originalRevokeObjectURL = URL.revokeObjectURL;
    });

    afterEach(() => {
      URL.createObjectURL = originalCreateObjectURL;
      URL.revokeObjectURL = originalRevokeObjectURL;
    });

    it("fetches the binary and saves it under the Content-Disposition filename", async () => {
      const { fetchMock } = makeFetch({
        role: "admin",
        documents: [doc({ id: "dl-1", filename: "row-name.pdf" })],
        downloadHeaders: { "Content-Disposition": 'attachment; filename="original-name.pdf"' },
      });
      vi.stubGlobal("fetch", fetchMock);
      const createObjectURL = vi.fn().mockReturnValue("blob:fake-url");
      const revokeObjectURL = vi.fn();
      URL.createObjectURL = createObjectURL;
      URL.revokeObjectURL = revokeObjectURL;
      let downloadAttr = "";
      const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
        this: HTMLAnchorElement,
      ) {
        downloadAttr = this.download;
      });

      renderKB();
      const row = await screen.findByRole("row", { name: /row-name\.pdf/i });
      const user = userEvent.setup();
      await user.click(within(row).getByRole("button", { name: /download/i }));

      await waitFor(() => expect(createObjectURL).toHaveBeenCalled());
      expect(clickSpy).toHaveBeenCalled();
      expect(downloadAttr).toBe("original-name.pdf");
      const downloadCall = findCall(fetchMock, (url) => url.endsWith("/documents/dl-1/download"));
      expect(downloadCall).toBeTruthy();

      clickSpy.mockRestore();
    });

    it("falls back to the row's filename when Content-Disposition is missing", async () => {
      const { fetchMock } = makeFetch({
        role: "admin",
        documents: [doc({ id: "dl-2", filename: "row-fallback.pdf" })],
        downloadHeaders: {},
      });
      vi.stubGlobal("fetch", fetchMock);
      URL.createObjectURL = vi.fn().mockReturnValue("blob:fake-url");
      URL.revokeObjectURL = vi.fn();
      let downloadAttr = "";
      const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
        this: HTMLAnchorElement,
      ) {
        downloadAttr = this.download;
      });

      renderKB();
      const row = await screen.findByRole("row", { name: /row-fallback\.pdf/i });
      const user = userEvent.setup();
      await user.click(within(row).getByRole("button", { name: /download/i }));

      await waitFor(() => expect(clickSpy).toHaveBeenCalled());
      expect(downloadAttr).toBe("row-fallback.pdf");

      clickSpy.mockRestore();
    });

    it("surfaces a readable row-level error instead of a silent no-op on failure", async () => {
      const { fetchMock } = makeFetch({
        role: "admin",
        documents: [doc({ id: "dl-3", filename: "will-fail.pdf" })],
        downloadOk: false,
      });
      vi.stubGlobal("fetch", fetchMock);

      renderKB();
      const row = await screen.findByRole("row", { name: /will-fail\.pdf/i });
      const user = userEvent.setup();
      await user.click(within(row).getByRole("button", { name: /download/i }));

      await waitFor(() =>
        expect(screen.getByText(/couldn't download that document/i)).toBeInTheDocument(),
      );
    });
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
