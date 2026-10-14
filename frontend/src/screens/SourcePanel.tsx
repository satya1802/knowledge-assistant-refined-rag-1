import * as React from "react";

import { apiFetchBlob, saveBlob } from "@/lib/api";
import * as UI from "@/lib/ui";
import { Icons } from "@/lib/icons";

const { Button } = UI;
const { X, Download, AlertCircle, FileText } = Icons;

export type SourcePanelCitation = {
  number: number;
  document_id: string;
  chunk_id: string;
  filename?: string | null;
  page_ref?: number | null;
  section_ref?: string | null;
  text_preview?: string | null;
  score: number;
};

type Props = {
  citation: SourcePanelCitation | null;
  onClose: () => void;
};

/**
 * The side panel opened from a citation chip (US-023-1). Mounted
 * unconditionally in Chat.tsx and renders nothing when no citation is
 * selected -- Chat owns the selection state and which chip to return focus
 * to on close; this component only ever renders what it is given and calls
 * `onClose` on a close-button click or Escape (AC-057).
 */
export default function SourcePanel({ citation, onClose }: Props) {
  const [downloading, setDownloading] = React.useState(false);
  const [downloadError, setDownloadError] = React.useState("");

  // Escape dismisses the panel exactly like the close button, but only while
  // a citation is actually selected -- otherwise there is nothing to close.
  React.useEffect(() => {
    if (!citation) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [citation, onClose]);

  // AC-057: selecting a different chip updates the panel to the newly
  // selected source. A download failure from the previous citation must not
  // bleed into the newly selected one.
  React.useEffect(() => {
    setDownloadError("");
    setDownloading(false);
  }, [citation?.chunk_id]);

  if (!citation) return null;

  const location = citation.page_ref
    ? `Page ${citation.page_ref}`
    : citation.section_ref
      ? `Section: ${citation.section_ref}`
      : null;

  // AC-056: downloads through apiFetchBlob/saveBlob, the same authenticated
  // helper the Knowledge Base page uses -- never a bare anchor to a raw URL,
  // which would drop the session cookie.
  const download = async () => {
    setDownloadError("");
    setDownloading(true);
    try {
      const { blob, filename } = await apiFetchBlob(
        `/documents/${citation.document_id}/download`,
      );
      saveBlob(blob, filename || citation.filename || "document");
    } catch {
      setDownloadError("Couldn't download that document. Try again.");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <aside
      role="dialog"
      aria-modal="true"
      aria-label={`Source ${citation.number}: ${citation.filename ?? "document"}`}
      className="fixed right-0 top-0 z-50 flex h-full w-full max-w-sm flex-col gap-4 border-l p-5"
      style={{ backgroundColor: "var(--brand-surface)", borderColor: "var(--brand-border)" }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <FileText size={16} />
          <h2 className="text-sm font-semibold">
            {citation.filename ?? `Source ${citation.number}`}
          </h2>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label="Close source panel"
          onClick={onClose}
        >
          <X size={14} />
        </Button>
      </div>

      {location ? <p className="text-xs text-[var(--brand-fg-muted)]">{location}</p> : null}

      {citation.text_preview ? (
        <div
          className="flex-1 overflow-y-auto rounded-[var(--brand-radius)] border p-3 text-sm"
          style={{ borderColor: "var(--brand-border)" }}
        >
          {citation.text_preview}
        </div>
      ) : null}

      {downloadError ? (
        <p role="alert" className="flex items-center gap-1 text-sm text-red-400">
          <AlertCircle size={14} /> {downloadError}
        </p>
      ) : null}

      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={downloading}
        onClick={() => void download()}
      >
        <Download size={14} /> {downloading ? "Downloading…" : "Download original"}
      </Button>
    </aside>
  );
}
