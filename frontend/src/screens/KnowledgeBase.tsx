import * as React from "react";

import { apiFetch, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import * as UI from "@/lib/ui";
import { Icons } from "@/lib/icons";

const {
  Button,
  Input,
  Label,
  Select,
  Badge,
  Table,
  THead,
  TBody,
  TR,
  TH,
  TD,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Stat,
  Empty,
} = UI;
const { Search, X, FileText, Trash, Download, Upload, AlertCircle, CheckCircle } = Icons;

const ACCEPTED_EXTENSIONS = ["pdf", "docx", "txt", "md"];
const ACCEPTED_LABEL = "PDF, DOCX, TXT and MD";
const MAX_BYTES = 25 * 1024 * 1024;
const POLL_INTERVAL_MS = 4000;

type DocumentRow = {
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

type DocumentStats = {
  total: number;
  ready: number;
  processing: number;
  failed: number;
  chunks: number;
  bytes: number;
};

type LoadState = "loading" | "loaded" | "error";

function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;
  return `${value.toFixed(exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}

function statusVariant(status: string): string {
  if (status === "ready") return "success";
  if (status === "failed") return "danger";
  if (status === "processing") return "warning";
  return "default";
}

function fileExtension(filename: string): string {
  const parts = filename.split(".");
  return parts.length > 1 ? (parts[parts.length - 1] ?? "").toLowerCase() : "";
}

function validateFile(file: File): string | null {
  const ext = fileExtension(file.name);
  if (!ACCEPTED_EXTENSIONS.includes(ext)) {
    return `Unsupported file type. Accepted formats are ${ACCEPTED_LABEL}.`;
  }
  if (file.size > MAX_BYTES) {
    return "This file is larger than the 25 MB size limit.";
  }
  return null;
}

export default function KnowledgeBase() {
  const { status: authStatus, user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [documents, setDocuments] = React.useState<DocumentRow[]>([]);
  const [stats, setStats] = React.useState<DocumentStats | null>(null);
  const [loadState, setLoadState] = React.useState<LoadState>("loading");

  const [query, setQuery] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState("");
  const [typeFilter, setTypeFilter] = React.useState("");

  const [dragOver, setDragOver] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [uploadError, setUploadError] = React.useState("");
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const [deleteTarget, setDeleteTarget] = React.useState<DocumentRow | null>(null);
  const [deleting, setDeleting] = React.useState(false);
  const [rowError, setRowError] = React.useState("");

  const hasActiveFilters = Boolean(query.trim() || statusFilter || typeFilter);

  const buildQuery = React.useCallback(() => {
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (statusFilter) params.set("status", statusFilter);
    if (typeFilter) params.set("type", typeFilter);
    const qs = params.toString();
    return qs ? `?${qs}` : "";
  }, [query, statusFilter, typeFilter]);

  const loadDocuments = React.useCallback(async () => {
    try {
      const rows = await apiFetch<DocumentRow[]>(`/documents${buildQuery()}`);
      setDocuments(rows);
      setLoadState("loaded");
    } catch {
      setLoadState("error");
    }
  }, [buildQuery]);

  const loadStats = React.useCallback(async () => {
    try {
      const data = await apiFetch<DocumentStats>("/documents/stats");
      setStats(data);
    } catch {
      /* stat tiles degrade to their previous values on a transient failure */
    }
  }, []);

  const loadAll = React.useCallback(async () => {
    setLoadState((prev) => (prev === "loaded" ? prev : "loading"));
    await Promise.all([loadDocuments(), loadStats()]);
  }, [loadDocuments, loadStats]);

  // AC-021/AC-023: the table and tiles come from the backend on mount and on
  // every reload -- nothing here is seeded or read back from localStorage.
  React.useEffect(() => {
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, statusFilter, typeFilter]);

  // AC-019/AC-024: a document sitting in Processing is polled -- never faster
  // than the 4s interval -- until it leaves that state, so completion (or a
  // deletion made elsewhere) shows up without a manual refresh. Polling stops
  // the moment nothing is Processing.
  React.useEffect(() => {
    const hasProcessing = documents.some((doc) => doc.status === "processing");
    if (!hasProcessing) return undefined;
    const interval = window.setInterval(() => {
      void loadDocuments();
      void loadStats();
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [documents, loadDocuments, loadStats]);

  const handleFiles = async (files: FileList | File[]) => {
    const file = Array.from(files)[0];
    if (!file) return;
    setUploadError("");
    const clientError = validateFile(file);
    if (clientError) {
      setUploadError(clientError);
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      await apiFetch<DocumentRow>("/documents", { method: "POST", body: form });
      await loadAll();
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) {
        setUploadError(`Unsupported file type. Accepted formats are ${ACCEPTED_LABEL}.`);
      } else if (err instanceof ApiError && err.status === 413) {
        setUploadError("This file is larger than the 25 MB size limit.");
      } else {
        setUploadError("Something went wrong uploading that file. Try again.");
      }
    } finally {
      setUploading(false);
    }
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    if (!isAdmin) return;
    void handleFiles(e.dataTransfer.files);
  };

  const onBrowseChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) void handleFiles(e.target.files);
    e.target.value = "";
  };

  const reprocess = async (doc: DocumentRow, mode: "retry" | "reindex") => {
    setRowError("");
    try {
      await apiFetch(`/documents/${doc.id}/reprocess`, {
        method: "POST",
        body: JSON.stringify({ mode }),
      });
      await loadAll();
    } catch {
      setRowError("Couldn't start that action. Try again.");
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setRowError("");
    try {
      await apiFetch(`/documents/${deleteTarget.id}`, { method: "DELETE" });
      setDeleteTarget(null);
      // AC-024: the table and tiles reflect a deletion immediately -- no
      // manual page refresh required.
      await loadAll();
    } catch {
      setRowError("Couldn't delete that document. Try again.");
    } finally {
      setDeleting(false);
    }
  };

  const download = (doc: DocumentRow) => {
    void apiFetch(`/documents/${doc.id}/download`).catch(() => {
      setRowError("Couldn't download that document. Try again.");
    });
  };

  const clearFilters = () => {
    setQuery("");
    setStatusFilter("");
    setTypeFilter("");
  };

  if (authStatus === "loading") {
    return (
      <div className="p-6">
        <p className="text-sm text-[var(--brand-fg-muted)]">{"Loading…"}</p>
      </div>
    );
  }

  // AC-153 vs AC-154: an empty table can mean two different things, and they
  // must read differently. If the backend's unfiltered total is zero, there
  // is truly nothing in the knowledge base yet -- the message below is
  // intentionally identical for an administrator and a standard user (both
  // need to know an admin has to upload something). If the total is
  // non-zero, the current filters are simply too narrow, and that empty
  // state carries its own copy plus a control to clear them. When the stats
  // call itself has failed, fall back to whether a filter is active so the
  // screen never has to guess at a count it does not have.
  const noDocumentsAtAll =
    documents.length === 0 && (stats ? stats.total === 0 : !hasActiveFilters);
  const noDocumentsMatchFilters = documents.length === 0 && !noDocumentsAtAll;

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-lg font-semibold" style={{ fontFamily: "var(--brand-font-heading)" }}>
          {"Knowledge Base"}
        </h1>
        <p className="text-sm text-[var(--brand-fg-muted)]">
          {"Documents available to the assistant, and their processing status."}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Stat label="Total" value={stats ? stats.total : "—"} />
        <Stat label="Ready" value={stats ? stats.ready : "—"} />
        <Stat label="Processing" value={stats ? stats.processing : "—"} />
        <Stat label="Failed" value={stats ? stats.failed : "—"} />
        <Stat
          label="Chunks"
          value={stats ? stats.chunks : "—"}
          hint={stats ? formatBytes(stats.bytes) : undefined}
        />
      </div>

      {isAdmin ? (
        <Card>
          <CardHeader>
            <CardTitle>{"Upload a document"}</CardTitle>
            <CardDescription>{`Accepted formats: ${ACCEPTED_LABEL}. Max size 25 MB.`}</CardDescription>
          </CardHeader>
          <CardContent>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              data-testid="dropzone"
              className="flex flex-col items-center justify-center gap-2 rounded-[var(--brand-radius)] border border-dashed px-6 py-10 text-center"
              style={{
                borderColor: dragOver ? "var(--brand-primary)" : "var(--brand-border)",
                backgroundColor: dragOver ? "var(--brand-hover)" : "transparent",
              }}
            >
              <Upload size={20} />
              <p className="text-sm text-[var(--brand-fg-muted)]">
                {"Drag and drop a file here, or"}
              </p>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploading ? "Uploading…" : "Browse"}
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.docx,.txt,.md"
                className="hidden"
                onChange={onBrowseChange}
                data-testid="file-input"
              />
            </div>
            {uploadError ? (
              <p role="alert" className="mt-2 flex items-center gap-1 text-sm text-red-400">
                <AlertCircle size={14} /> {uploadError}
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{"Filters"}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <Label htmlFor="kb-search">{"Search"}</Label>
              <div className="relative">
                <Search
                  size={14}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"
                />
                <Input
                  id="kb-search"
                  className="pl-8"
                  placeholder="Search by filename"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="kb-status">{"Status"}</Label>
              <Select
                id="kb-status"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                options={[
                  { value: "", label: "All statuses" },
                  { value: "processing", label: "Processing" },
                  { value: "ready", label: "Ready" },
                  { value: "failed", label: "Failed" },
                ]}
              />
            </div>
            <div>
              <Label htmlFor="kb-type">{"Type"}</Label>
              <Select
                id="kb-type"
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                options={[
                  { value: "", label: "All types" },
                  { value: "pdf", label: "PDF" },
                  { value: "docx", label: "DOCX" },
                  { value: "txt", label: "TXT" },
                  { value: "md", label: "MD" },
                ]}
              />
            </div>
            {hasActiveFilters ? (
              <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>
                <X size={14} /> {"Clear"}
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {rowError ? (
        <p role="alert" className="flex items-center gap-1 text-sm text-red-400">
          <AlertCircle size={14} /> {rowError}
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{"Documents"}</CardTitle>
        </CardHeader>
        <CardContent>
          {loadState === "loading" ? (
            <p className="text-sm text-[var(--brand-fg-muted)]">{"Loading documents…"}</p>
          ) : loadState === "error" ? (
            <div className="flex flex-col items-start gap-2">
              <p role="alert" className="flex items-center gap-1 text-sm text-red-400">
                <AlertCircle size={14} /> {"Couldn't load documents. Try again."}
              </p>
              <Button type="button" variant="secondary" size="sm" onClick={() => void loadAll()}>
                {"Retry"}
              </Button>
            </div>
          ) : noDocumentsAtAll ? (
            <Empty
              title="No documents yet"
              description="There is nothing in the knowledge base yet. An administrator needs to upload documents before they will appear here."
            />
          ) : noDocumentsMatchFilters ? (
            <Empty
              title="No documents match your filters"
              description="Try a different search term, or clear the filters to see everything in the knowledge base."
              action={
                <Button type="button" variant="secondary" size="sm" onClick={clearFilters}>
                  <X size={14} /> {"Clear filters"}
                </Button>
              }
            />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>{"Filename"}</TH>
                  <TH>{"Type"}</TH>
                  <TH>{"Size"}</TH>
                  <TH>{"Status"}</TH>
                  <TH>{"Chunks"}</TH>
                  <TH>{"Uploaded by"}</TH>
                  <TH>{"Created"}</TH>
                  <TH>{"Actions"}</TH>
                </TR>
              </THead>
              <TBody>
                {documents.map((doc) => (
                  <TR key={doc.id}>
                    <TD>
                      <div className="flex items-center gap-1">
                        <FileText size={14} />
                        {doc.filename}
                      </div>
                      {doc.status === "failed" && doc.failure_reason ? (
                        <p className="mt-1 flex items-center gap-1 text-xs text-red-400">
                          <AlertCircle size={12} /> {doc.failure_reason}
                        </p>
                      ) : null}
                      {doc.status === "ready" && doc.notes ? (
                        <p className="mt-1 flex items-center gap-1 text-xs text-[var(--brand-fg-muted)]">
                          <CheckCircle size={12} /> {doc.notes}
                        </p>
                      ) : null}
                    </TD>
                    <TD>{doc.file_type.toUpperCase()}</TD>
                    <TD>{formatBytes(doc.size_bytes)}</TD>
                    <TD>
                      <Badge variant={statusVariant(doc.status)}>{doc.status}</Badge>
                    </TD>
                    <TD>{doc.chunk_count}</TD>
                    <TD>{doc.uploaded_by}</TD>
                    <TD>{new Date(doc.created_at).toLocaleDateString()}</TD>
                    <TD>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => download(doc)}
                        >
                          <Download size={14} /> {"Download"}
                        </Button>
                        {isAdmin && doc.status === "failed" ? (
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => void reprocess(doc, "retry")}
                          >
                            {"Retry"}
                          </Button>
                        ) : null}
                        {isAdmin && doc.status === "ready" ? (
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => void reprocess(doc, "reindex")}
                          >
                            {"Re-index"}
                          </Button>
                        ) : null}
                        {isAdmin ? (
                          <Button
                            type="button"
                            variant="danger"
                            size="sm"
                            onClick={() => setDeleteTarget(doc)}
                          >
                            <Trash size={14} /> {"Delete"}
                          </Button>
                        ) : null}
                      </div>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {deleteTarget ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-doc-title"
        >
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle id="delete-doc-title">{"Delete this document?"}</CardTitle>
              <CardDescription>
                {`"${deleteTarget.filename}" will be removed from the knowledge base. This cannot be undone.`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={deleting}
                  onClick={() => setDeleteTarget(null)}
                >
                  {"Cancel"}
                </Button>
                <Button
                  type="button"
                  variant="danger"
                  size="sm"
                  disabled={deleting}
                  onClick={() => void confirmDelete()}
                >
                  {deleting ? "Deleting…" : "Delete"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
