// @ts-nocheck -- generated from the approved design under its JS runtime contract; not hand-written TypeScript.
/* eslint-disable @typescript-eslint/no-unused-vars */
import React from "react";

import * as UI from "@/lib/ui";
import { Icons } from "@/lib/icons";
import { brand } from "@/lib/brand";
import { useNavigate } from "@/lib/navigate";

const { Button, Input, Label, Table, Stat } = UI;
const { Search, X, FileText, Package, Clock, Trash, Filter, Download, Upload, ArrowRight, AlertCircle, CheckCircle } = Icons;

const C = (typeof UI !== 'undefined' && UI) ? UI : {};
const I = (typeof Icons !== 'undefined' && Icons) ? Icons : {};

const Btn = C.Button || ((p) => React.createElement('button', p));
const Fld = C.Input || ((p) => React.createElement('input', p));
const Lbl = C.Label || ((p) => React.createElement('label', p));

const Icon = ({ name, className, style }) => {
  const Cmp = I[name];
  if (!Cmp) return <span className={className} aria-hidden="true" />;
  return <Cmp className={className} style={style} aria-hidden="true" />;
};

const hexA = (hex, a) => {
  let h = String(hex || '').replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h || '000000', 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};

const TEXT = 'rgba(255,255,255,0.92)';
const TEXT_2 = 'rgba(255,255,255,0.64)';
const SURFACE = 'rgba(255,255,255,0.035)';
const SURFACE_2 = 'rgba(255,255,255,0.065)';
const LINE = hexA(brand.neutralColor, 0.20);
const LINE_SOFT = hexA(brand.neutralColor, 0.12);
const DANGER = '#E0685A';

const ACCEPTED = ['pdf', 'docx', 'txt', 'md'];
const MAX_BYTES = 25 * 1024 * 1024;

const SEED_DOCS = [
  { id: 'd-914', filename: 'Employee-Handbook-2026.pdf', file_type: 'pdf', size_bytes: 4404019, status: 'ready', chunks: 312, pages: 86, uploaded_by: 'Dana Whitfield', created_at: '2026-10-13T09:14:00' },
  { id: 'd-913', filename: 'Vendor-MSA-Northwind.pdf', file_type: 'pdf', size_bytes: 1884160, status: 'processing', progress: 38, chunks: 0, pages: 34, uploaded_by: 'Dana Whitfield', created_at: '2026-10-13T08:51:00' },
  { id: 'd-912', filename: 'Benefits-Open-Enrolment-2026.pdf', file_type: 'pdf', size_bytes: 7340032, status: 'failed', chunks: 0, pages: null, uploaded_by: 'Marcus Lee', created_at: '2026-10-13T08:02:00', failure_reason: 'Encrypted PDF — a password is required before text can be extracted. The original file is retained.' },
  { id: 'd-911', filename: 'Q3-Revenue-Review.docx', file_type: 'docx', size_bytes: 962560, status: 'ready', chunks: 148, pages: 22, uploaded_by: 'Marcus Lee', created_at: '2026-10-12T17:36:00' },
  { id: 'd-910', filename: 'Scanned-Invoices-Sept.pdf', file_type: 'pdf', size_bytes: 12582912, status: 'ready', chunks: 41, pages: 58, uploaded_by: 'Dana Whitfield', created_at: '2026-10-12T14:08:00', notes: '12 image-only pages were not indexed — OCR is out of scope.' },
  { id: 'd-909', filename: 'Security-Incident-Runbook.md', file_type: 'md', size_bytes: 48128, status: 'ready', chunks: 37, pages: null, uploaded_by: 'Priya Raman', created_at: '2026-10-11T11:20:00' },
  { id: 'd-908', filename: 'Pricing-Matrix-EMEA.docx', file_type: 'docx', size_bytes: 2306867, status: 'failed', chunks: 0, pages: 19, uploaded_by: 'Dana Whitfield', created_at: '2026-10-10T16:45:00', failure_reason: 'Embedding batch 3 of 7 failed after 3 retries — provider returned 429 (rate limit). Retry when quota resets.' },
  { id: 'd-907', filename: 'Field-Service-Checklist.docx', file_type: 'docx', size_bytes: 611328, status: 'ready', chunks: 96, pages: 14, uploaded_by: 'Priya Raman', created_at: '2026-10-10T09:58:00', notes: 'Table cells extracted alongside paragraphs (31 rows).' },
  { id: 'd-906', filename: 'onboarding-faq.txt', file_type: 'txt', size_bytes: 27648, status: 'ready', chunks: 22, pages: null, uploaded_by: 'Marcus Lee', created_at: '2026-10-09T15:12:00' },
  { id: 'd-905', filename: 'Warehouse-Safety-Policy.pdf', file_type: 'pdf', size_bytes: 3355443, status: 'processing', progress: 71, chunks: 0, pages: 44, uploaded_by: 'Dana Whitfield', created_at: '2026-10-09T10:04:00' },
  { id: 'd-904', filename: 'API-Integration-Guide.md', file_type: 'md', size_bytes: 93184, status: 'ready', chunks: 74, pages: null, uploaded_by: 'Priya Raman', created_at: '2026-10-08T13:41:00' },
  { id: 'd-903', filename: 'Partner-Agreement-Halcyon.pdf', file_type: 'pdf', size_bytes: 1468006, status: 'ready', chunks: 118, pages: 27, uploaded_by: 'Dana Whitfield', created_at: '2026-10-08T09:27:00' },
  { id: 'd-902', filename: 'Support-Macros-Library.txt', file_type: 'txt', size_bytes: 156672, status: 'ready', chunks: 64, pages: null, uploaded_by: 'Marcus Lee', created_at: '2026-10-07T18:15:00' }
];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const fmtSize = (b) => {
  if (b >= 1048576) return (b / 1048576).toFixed(1) + ' MB';
  if (b >= 1024) return Math.round(b / 1024) + ' KB';
  return b + ' B';
};

const fmtWhen = (iso) => {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const time = pad(d.getHours()) + ':' + pad(d.getMinutes());
  const same = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const yd = new Date(now.getTime() - 86400000);
  if (same(d, now)) return 'Today · ' + time;
  if (same(d, yd)) return 'Yesterday · ' + time;
  return d.getDate() + ' ' + MONTHS[d.getMonth()] + ' · ' + time;
};

const STATUS_META = {
  ready: { label: 'Ready', icon: 'CheckCircle', color: brand.primaryColor },
  processing: { label: 'Processing', icon: 'Clock', color: brand.accentColor },
  failed: { label: 'Failed', icon: 'AlertCircle', color: DANGER }
};

const CSS = `
.kb :focus-visible { outline: 2px solid ${brand.accentColor}; outline-offset: 2px; }
@keyframes kbIn { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: none; } }
@keyframes kbFade { from { opacity: 0; } to { opacity: 1; } }
@keyframes kbBlink { 0%, 100% { opacity: 1; } 50% { opacity: .28; } }
.kb-in { animation: kbIn .3s cubic-bezier(.2,.7,.3,1) both; }
.kb-fade { animation: kbFade .18s ease-out both; }
.kb-blink { animation: kbBlink 1.8s ease-in-out infinite; }
.kb-bar { transition: width .5s linear; }
.kb-row { transition: background-color .14s ease; }
@media (prefers-reduced-motion: reduce) {
  .kb-in, .kb-fade, .kb-blink { animation: none !important; }
  .kb-bar, .kb-row { transition: none !important; }
}
`;

export default function Screen() {
  const navigate = useNavigate();
  const [docs, setDocs] = React.useState(SEED_DOCS);
  const [role, setRole] = React.useState('admin');
  const [query, setQuery] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState('all');
  const [typeFilter, setTypeFilter] = React.useState('all');
  const [dragging, setDragging] = React.useState(false);
  const [rejects, setRejects] = React.useState([]);
  const [toast, setToast] = React.useState(null);
  const [confirmDoc, setConfirmDoc] = React.useState(null);
  const [paused, setPaused] = React.useState(false);
  const fileRef = React.useRef(null);
  const cancelRef = React.useRef(null);
  const returnRef = React.useRef(null);

  const isAdmin = role === 'admin';

  const stats = React.useMemo(() => {
    const s = { total: docs.length, ready: 0, processing: 0, failed: 0, chunks: 0, bytes: 0 };
    docs.forEach((d) => {
      s[d.status] = (s[d.status] || 0) + 1;
      s.chunks += d.chunks || 0;
      s.bytes += d.size_bytes || 0;
    });
    return s;
  }, [docs]);

  const typeCounts = React.useMemo(() => {
    const c = { pdf: 0, docx: 0, txt: 0, md: 0 };
    docs.forEach((d) => { c[d.file_type] = (c[d.file_type] || 0) + 1; });
    return c;
  }, [docs]);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return docs
      .filter((d) => (statusFilter === 'all' || d.status === statusFilter))
      .filter((d) => (typeFilter === 'all' || d.file_type === typeFilter))
      .filter((d) => (!q || d.filename.toLowerCase().includes(q)))
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }, [docs, query, statusFilter, typeFilter]);

  const filtersActive = query.trim() !== '' || statusFilter !== 'all' || typeFilter !== 'all';

  // Background indexing — advances Processing documents to Ready, like the worker does.
  const hasProcessing = docs.some((d) => d.status === 'processing');
  React.useEffect(() => {
    if (paused || !hasProcessing) return undefined;
    const t = setInterval(() => {
      setDocs((prev) => prev.map((d) => {
        if (d.status !== 'processing') return d;
        const next = Math.min(100, (d.progress || 0) + 6 + Math.random() * 10);
        if (next >= 100) {
          return {
            ...d,
            status: 'ready',
            progress: 100,
            reindexing: false,
            failure_reason: null,
            chunks: d.chunks || Math.max(8, Math.round(d.size_bytes / 14000))
          };
        }
        return { ...d, progress: next };
      }));
    }, 900);
    return () => clearInterval(t);
  }, [paused, hasProcessing]);

  React.useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), 5200);
    return () => clearTimeout(t);
  }, [toast]);

  React.useEffect(() => {
    if (!confirmDoc) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') closeConfirm(); };
    window.addEventListener('keydown', onKey);
    const f = setTimeout(() => { if (cancelRef.current) cancelRef.current.focus(); }, 0);
    return () => { window.removeEventListener('keydown', onKey); clearTimeout(f); };
  }, [confirmDoc]);

  function closeConfirm() {
    setConfirmDoc(null);
    if (returnRef.current && returnRef.current.focus) returnRef.current.focus();
  }

  function acceptFiles(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    const bad = [];
    const good = [];
    files.forEach((f) => {
      const ext = (f.name.split('.').pop() || '').toLowerCase();
      if (!ACCEPTED.includes(ext)) {
        bad.push({ name: f.name, reason: 'Unsupported format “.' + ext + '”. Accepted formats are PDF, DOCX, TXT and MD.' });
      } else if (f.size > MAX_BYTES) {
        bad.push({ name: f.name, reason: 'This file is ' + fmtSize(f.size) + '. The upload limit is 25 MB — split it or strip embedded media, then try again.' });
      } else {
        good.push({
          id: 'd-' + Date.now() + '-' + Math.round(Math.random() * 9999),
          filename: f.name,
          file_type: ext,
          size_bytes: f.size,
          status: 'processing',
          progress: 3,
          chunks: 0,
          pages: null,
          uploaded_by: 'Dana Whitfield',
          created_at: new Date().toISOString(),
          isNew: true
        });
      }
    });
    if (good.length) {
      setDocs((prev) => [...good, ...prev]);
      setToast({ kind: 'ok', text: good.length === 1 ? good[0].filename + ' stored and queued — extraction and embedding are running in the background.' : good.length + ' files stored and queued for extraction.' });
    }
    setRejects(bad);
  }

  function onDrop(e) {
    e.preventDefault();
    setDragging(false);
    if (!isAdmin) return;
    acceptFiles(e.dataTransfer && e.dataTransfer.files);
  }

  function reprocess(doc) {
    setDocs((prev) => prev.map((d) => (d.id === doc.id
      ? { ...d, status: 'processing', progress: 2, failure_reason: null, reindexing: doc.status === 'ready', chunks: doc.status === 'ready' ? d.chunks : 0 }
      : d)));
    setToast({
      kind: 'ok',
      text: doc.status === 'failed'
        ? 'Retrying ' + doc.filename + ' from the stored original — nothing was deleted.'
        : 'Re-indexing ' + doc.filename + '. It stays answerable and citable while chunks rebuild.'
    });
  }

  function doDelete() {
    const d = confirmDoc;
    setDocs((prev) => prev.filter((x) => x.id !== d.id));
    setToast({ kind: 'ok', text: d.filename + ' deleted — file, ' + (d.chunks || 0) + ' chunks and their vectors removed.' });
    closeConfirm();
  }

  function clearFilters() {
    setQuery('');
    setStatusFilter('all');
    setTypeFilter('all');
  }

  const tiles = [
    { key: 'all', label: 'Documents', value: stats.total, color: TEXT, hint: fmtSize(stats.bytes) + ' stored' },
    { key: 'ready', label: 'Ready', value: stats.ready, color: brand.primaryColor, hint: 'answerable now' },
    { key: 'processing', label: 'Processing', value: stats.processing, color: brand.accentColor, hint: paused ? 'updates paused' : 'in the worker' },
    { key: 'failed', label: 'Failed', value: stats.failed, color: DANGER, hint: 'needs a retry' }
  ];

  const selectStyle = {
    backgroundColor: SURFACE_2,
    color: TEXT,
    border: '1px solid ' + LINE,
    borderRadius: brand.radius,
    fontVariantNumeric: 'tabular-nums'
  };

  return (
    <div className="kb min-h-full" style={{ backgroundColor: brand.backgroundColor, color: TEXT, fontFamily: brand.fontBody }}>
      <style>{CSS}</style>

      <div className="mx-auto w-full max-w-[1420px] px-6 py-7">

        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight" style={{ fontFamily: brand.fontHeading }}>Knowledge Base</h1>
            <p className="mt-1.5 text-[13px]" style={{ color: TEXT_2, fontVariantNumeric: 'tabular-nums' }}>
              {stats.chunks.toLocaleString()} chunks indexed · 768-dim vectors in pgvector · similarity threshold 0.62
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPaused((p) => !p)}
              aria-pressed={paused}
              className="flex items-center gap-2 px-3 h-9 text-[12px] font-medium kb-row"
              style={{
                backgroundColor: paused ? hexA(brand.accentColor, 0.10) : SURFACE,
                border: '1px solid ' + (paused ? hexA(brand.accentColor, 0.45) : LINE),
                borderRadius: brand.radius,
                color: paused ? brand.accentColor : TEXT_2
              }}
            >
              <span
                className={paused ? '' : 'kb-blink'}
                style={{ width: 7, height: 7, borderRadius: 99, backgroundColor: paused ? brand.accentColor : brand.primaryColor, display: 'inline-block' }}
                aria-hidden="true"
              />
              {paused ? 'Paused · list may be out of date' : 'Live status updates'}
            </button>

            <div role="group" aria-label="Preview the page as a role" className="flex p-0.5" style={{ backgroundColor: SURFACE, border: '1px solid ' + LINE, borderRadius: brand.radius }}>
              {[['admin', 'Administrator'], ['user', 'Standard user']].map(([val, label]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setRole(val)}
                  aria-pressed={role === val}
                  className="px-3 h-8 text-[12px] font-medium kb-row"
                  style={{
                    borderRadius: 'calc(' + brand.radius + ' - 2px)',
                    backgroundColor: role === val ? hexA(brand.primaryColor, 0.16) : 'transparent',
                    color: role === val ? brand.primaryColor : TEXT_2
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Stat tiles — each one filters the table */}
        <h2 className="sr-only">Knowledge base statistics</h2>
        <div className="mt-5 grid grid-cols-2 lg:grid-cols-4 gap-3">
          {tiles.map((t) => {
            const active = statusFilter === t.key || (t.key === 'all' && statusFilter === 'all');
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setStatusFilter(t.key)}
                aria-pressed={active}
                className="text-left px-4 py-3 kb-row"
                style={{
                  backgroundColor: active ? SURFACE_2 : SURFACE,
                  border: '1px solid ' + (active ? hexA(brand.primaryColor, 0.4) : LINE_SOFT),
                  borderRadius: brand.radius
                }}
              >
                <span className="block text-[11px] uppercase tracking-[0.09em]" style={{ color: TEXT_2 }}>{t.label}</span>
                <span className="mt-1.5 flex items-baseline gap-2">
                  <span className="text-[26px] leading-none font-semibold" style={{ color: t.color, fontVariantNumeric: 'tabular-nums' }}>{t.value}</span>
                  <span className="text-[11px]" style={{ color: TEXT_2 }}>{t.hint}</span>
                </span>
              </button>
            );
          })}
        </div>

        <p aria-live="polite" className="sr-only">
          {stats.total} documents, {stats.ready} ready, {stats.processing} processing, {stats.failed} failed.
        </p>

        {/* Upload */}
        <section aria-labelledby="kb-upload-h" className="mt-4">
          <h2 id="kb-upload-h" className="sr-only">Upload documents</h2>

          {isAdmin ? (
            <div
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              className="flex flex-wrap items-center justify-between gap-4 px-5 py-4 kb-row"
              style={{
                border: '1px dashed ' + (dragging ? brand.accentColor : hexA(brand.neutralColor, 0.38)),
                backgroundColor: dragging ? hexA(brand.accentColor, 0.08) : SURFACE,
                borderRadius: brand.radius
              }}
            >
              <div className="flex items-center gap-3.5">
                <span
                  className="flex items-center justify-center shrink-0"
                  style={{ width: 38, height: 38, borderRadius: brand.radius, backgroundColor: hexA(brand.primaryColor, 0.14), color: brand.primaryColor }}
                >
                  <Icon name="Upload" className="w-[18px] h-[18px]" />
                </span>
                <div>
                  <p className="text-[14px] font-medium">
                    {dragging ? 'Release to upload into the knowledge base' : 'Drop PDF, DOCX, TXT or MD files here'}
                  </p>
                  <p className="text-[12px] mt-0.5" style={{ color: TEXT_2 }}>
                    Up to 25 MB each. Extraction, chunking (~1,000 chars / 150 overlap) and embedding run in the background.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Lbl htmlFor="kb-file" className="sr-only">Choose documents to upload</Lbl>
                <input
                  ref={fileRef}
                  id="kb-file"
                  type="file"
                  multiple
                  accept=".pdf,.docx,.txt,.md"
                  className="sr-only"
                  onChange={(e) => { acceptFiles(e.target.files); e.target.value = ''; }}
                />
                <Btn
                  type="button"
                  onClick={() => fileRef.current && fileRef.current.click()}
                  className="h-9 px-4 text-[13px] font-semibold"
                  style={{ backgroundColor: brand.primaryColor, color: brand.backgroundColor, borderRadius: brand.radius, border: 'none' }}
                >
                  Browse files
                </Btn>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4" style={{ backgroundColor: SURFACE, border: '1px solid ' + LINE_SOFT, borderRadius: brand.radius }}>
              <div className="flex items-start gap-3">
                <span style={{ color: brand.neutralColor }}><Icon name="AlertCircle" className="w-[18px] h-[18px] mt-0.5" /></span>
                <div>
                  <p className="text-[14px] font-medium">Uploading is an administrator action</p>
                  <p className="text-[12px] mt-0.5" style={{ color: TEXT_2 }}>
                    Dana Whitfield and Marcus Lee maintain this knowledge base. Ask either of them to add a file, or to grant you the admin role. You can still search, read and download everything below.
                  </p>
                </div>
              </div>
              <Btn
                type="button"
                onClick={() => navigate('docs')}
                className="h-9 px-4 text-[13px] font-medium"
                style={{ backgroundColor: 'transparent', color: TEXT, border: '1px solid ' + LINE, borderRadius: brand.radius }}
              >
                Read the upload guide
              </Btn>
            </div>
          )}
        </section>

        {/* Rejected uploads */}
        {rejects.length > 0 && (
          <div className="mt-3 kb-in px-4 py-3" style={{ backgroundColor: hexA(DANGER, 0.09), border: '1px solid ' + hexA(DANGER, 0.42), borderRadius: brand.radius }} role="alert">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <span style={{ color: DANGER }}><Icon name="AlertCircle" className="w-[17px] h-[17px] mt-0.5" /></span>
                <div>
                  <p className="text-[13px] font-semibold" style={{ color: DANGER }}>
                    {rejects.length === 1 ? '1 file was not stored' : rejects.length + ' files were not stored'}
                  </p>
                  <ul className="mt-1.5 space-y-1">
                    {rejects.map((r) => (
                      <li key={r.name} className="text-[12px]" style={{ color: TEXT_2 }}>
                        <span style={{ color: TEXT }}>{r.name}</span> — {r.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              <button type="button" onClick={() => setRejects([])} aria-label="Dismiss upload errors" className="shrink-0 p-1" style={{ color: TEXT_2, borderRadius: brand.radius }}>
                <Icon name="X" className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Action confirmation */}
        {toast && (
          <div className="mt-3 kb-in flex items-start justify-between gap-4 px-4 py-2.5" style={{ backgroundColor: hexA(brand.primaryColor, 0.10), border: '1px solid ' + hexA(brand.primaryColor, 0.35), borderRadius: brand.radius }} role="status">
            <span className="flex items-start gap-2.5 text-[12.5px]">
              <span style={{ color: brand.primaryColor }}><Icon name="CheckCircle" className="w-4 h-4 mt-0.5" /></span>
              {toast.text}
            </span>
            <button type="button" onClick={() => setToast(null)} aria-label="Dismiss message" className="shrink-0 p-1" style={{ color: TEXT_2, borderRadius: brand.radius }}>
              <Icon name="X" className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Document table */}
        <section aria-labelledby="kb-docs-h" className="mt-5" style={{ backgroundColor: SURFACE, border: '1px solid ' + LINE_SOFT, borderRadius: brand.radius }}>
          <div className="flex flex-wrap items-end justify-between gap-4 px-4 py-3.5" style={{ borderBottom: '1px solid ' + LINE_SOFT }}>
            <div>
              <h2 id="kb-docs-h" className="text-[15px] font-semibold">Indexed documents</h2>
              <p className="text-[12px] mt-0.5" style={{ color: TEXT_2, fontVariantNumeric: 'tabular-nums' }}>
                Showing {filtered.length} of {stats.total} · served from the backend on every load
              </p>
            </div>

            <div className="flex flex-wrap items-end gap-2.5">
              <div>
                <Lbl htmlFor="kb-search" className="block text-[11px] mb-1 uppercase tracking-[0.08em]" style={{ color: TEXT_2 }}>Search filename</Lbl>
                <div className="relative">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: brand.neutralColor }}>
                    <Icon name="Search" className="w-4 h-4" />
                  </span>
                  <Fld
                    id="kb-search"
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="handbook, msa, runbook…"
                    className="h-9 w-56 pl-8 pr-3 text-[13px]"
                    style={{ backgroundColor: SURFACE_2, color: TEXT, border: '1px solid ' + LINE, borderRadius: brand.radius }}
                  />
                </div>
              </div>

              <div>
                <Lbl htmlFor="kb-status" className="block text-[11px] mb-1 uppercase tracking-[0.08em]" style={{ color: TEXT_2 }}>Status</Lbl>
                <select id="kb-status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-9 px-2.5 text-[13px]" style={selectStyle}>
                  <option value="all" style={{ backgroundColor: brand.backgroundColor }}>All statuses ({stats.total})</option>
                  <option value="ready" style={{ backgroundColor: brand.backgroundColor }}>Ready ({stats.ready})</option>
                  <option value="processing" style={{ backgroundColor: brand.backgroundColor }}>Processing ({stats.processing})</option>
                  <option value="failed" style={{ backgroundColor: brand.backgroundColor }}>Failed ({stats.failed})</option>
                </select>
              </div>

              <div>
                <Lbl htmlFor="kb-type" className="block text-[11px] mb-1 uppercase tracking-[0.08em]" style={{ color: TEXT_2 }}>File type</Lbl>
                <select id="kb-type" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="h-9 px-2.5 text-[13px]" style={selectStyle}>
                  <option value="all" style={{ backgroundColor: brand.backgroundColor }}>All types</option>
                  <option value="pdf" style={{ backgroundColor: brand.backgroundColor }}>PDF ({typeCounts.pdf || 0})</option>
                  <option value="docx" style={{ backgroundColor: brand.backgroundColor }}>DOCX ({typeCounts.docx || 0})</option>
                  <option value="txt" style={{ backgroundColor: brand.backgroundColor }}>TXT ({typeCounts.txt || 0})</option>
                  <option value="md" style={{ backgroundColor: brand.backgroundColor }}>MD ({typeCounts.md || 0})</option>
                </select>
              </div>

              {filtersActive && (
                <button type="button" onClick={clearFilters} className="h-9 px-3 text-[12px] font-medium" style={{ color: brand.accentColor, border: '1px solid ' + hexA(brand.accentColor, 0.4), borderRadius: brand.radius, backgroundColor: 'transparent' }}>
                  Clear filters
                </button>
              )}
            </div>
          </div>

          {docs.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <span className="inline-flex items-center justify-center mb-4" style={{ width: 44, height: 44, borderRadius: brand.radius, backgroundColor: hexA(brand.accentColor, 0.12), color: brand.accentColor }}>
                <Icon name="Package" className="w-5 h-5" />
              </span>
              <h3 className="text-[15px] font-semibold">Nothing is indexed yet</h3>
              <p className="mx-auto mt-2 max-w-md text-[13px]" style={{ color: TEXT_2 }}>
                With an empty knowledge base every answer in Chat comes back behind the amber “Not from your documents” badge.
                {isAdmin ? ' Upload a PDF, DOCX, TXT or MD file to start indexing.' : ' An administrator needs to upload documents before the assistant can cite anything.'}
              </p>
              {isAdmin && (
                <Btn
                  type="button"
                  onClick={() => fileRef.current && fileRef.current.click()}
                  className="mt-5 h-9 px-4 text-[13px] font-semibold"
                  style={{ backgroundColor: brand.primaryColor, color: brand.backgroundColor, borderRadius: brand.radius, border: 'none' }}
                >
                  Upload the first document
                </Btn>
              )}
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <span className="inline-flex items-center justify-center mb-4" style={{ width: 44, height: 44, borderRadius: brand.radius, backgroundColor: SURFACE_2, color: brand.neutralColor }}>
                <Icon name="Filter" className="w-5 h-5" />
              </span>
              <h3 className="text-[15px] font-semibold">No documents match these filters</h3>
              <p className="mx-auto mt-2 max-w-md text-[13px]" style={{ color: TEXT_2 }}>
                Nothing matches {query.trim() ? <>“{query.trim()}”</> : 'the current filename search'}
                {statusFilter !== 'all' ? ' with status ' + STATUS_META[statusFilter].label : ''}
                {typeFilter !== 'all' ? ' and type ' + typeFilter.toUpperCase() : ''}.
              </p>
              <Btn
                type="button"
                onClick={clearFilters}
                className="mt-5 h-9 px-4 text-[13px] font-medium"
                style={{ backgroundColor: 'transparent', color: TEXT, border: '1px solid ' + LINE, borderRadius: brand.radius }}
              >
                Clear filters and search
              </Btn>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[13px]" style={{ fontVariantNumeric: 'tabular-nums' }}>
                <caption className="sr-only">Knowledge base documents with type, size, chunk count, uploader, date, status and actions</caption>
                <thead>
                  <tr style={{ color: TEXT_2 }}>
                    <th scope="col" className="text-left font-medium text-[11px] uppercase tracking-[0.08em] px-4 py-2.5">Document</th>
                    <th scope="col" className="text-left font-medium text-[11px] uppercase tracking-[0.08em] px-3 py-2.5">Type</th>
                    <th scope="col" className="text-right font-medium text-[11px] uppercase tracking-[0.08em] px-3 py-2.5">Size</th>
                    <th scope="col" className="text-right font-medium text-[11px] uppercase tracking-[0.08em] px-3 py-2.5">Chunks</th>
                    <th scope="col" className="text-left font-medium text-[11px] uppercase tracking-[0.08em] px-3 py-2.5">Uploaded by</th>
                    <th scope="col" className="text-left font-medium text-[11px] uppercase tracking-[0.08em] px-3 py-2.5">Uploaded</th>
                    <th scope="col" className="text-left font-medium text-[11px] uppercase tracking-[0.08em] px-3 py-2.5">Status</th>
                    <th scope="col" className="text-right font-medium text-[11px] uppercase tracking-[0.08em] px-4 py-2.5">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((d) => {
                    const meta = STATUS_META[d.status];
                    const initials = d.uploaded_by.split(' ').map((p) => p[0]).join('');
                    return (
                      <tr
                        key={d.id}
                        className={'kb-row hover:bg-[rgba(255,255,255,0.03)] ' + (d.isNew ? 'kb-in' : '')}
                        style={{ borderTop: '1px solid ' + LINE_SOFT }}
                      >
                        <td className="px-4 py-2.5 align-top">
                          <div className="flex items-start gap-2.5">
                            <span className="mt-0.5 shrink-0" style={{ color: brand.neutralColor }}><Icon name="FileText" className="w-4 h-4" /></span>
                            <div className="min-w-0">
                              <span className="block font-medium truncate max-w-[320px]" title={d.filename}>{d.filename}</span>
                              {d.status === 'processing' && (
                                <span className="mt-1.5 flex items-center gap-2 max-w-[320px]">
                                  <span className="h-[3px] flex-1" style={{ backgroundColor: SURFACE_2, borderRadius: 99 }}>
                                    <span className="kb-bar block h-full" style={{ width: Math.round(d.progress || 0) + '%', backgroundColor: brand.accentColor, borderRadius: 99 }} />
                                  </span>
                                  <span className="text-[11px]" style={{ color: brand.accentColor }}>
                                    {Math.round(d.progress || 0)}% · {d.reindexing ? 're-embedding' : 'embedding batches of 100'}
                                  </span>
                                </span>
                              )}
                              {d.status === 'failed' && d.failure_reason && (
                                <span className="mt-1 block text-[11.5px] max-w-[380px]" style={{ color: hexA(DANGER, 0.92) }}>{d.failure_reason}</span>
                              )}
                              {d.status === 'ready' && d.notes && (
                                <span className="mt-1 block text-[11.5px] max-w-[380px]" style={{ color: brand.accentColor }}>{d.notes}</span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 align-top">
                          <span className="inline-block px-1.5 py-0.5 text-[10.5px] font-semibold tracking-wide" style={{ backgroundColor: SURFACE_2, color: TEXT_2, borderRadius: 4 }}>
                            {d.file_type.toUpperCase()}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 align-top text-right whitespace-nowrap" style={{ color: TEXT_2 }}>{fmtSize(d.size_bytes)}</td>
                        <td className="px-3 py-2.5 align-top text-right" style={{ color: d.chunks ? TEXT : TEXT_2 }}>{d.chunks ? d.chunks.toLocaleString() : '—'}</td>
                        <td className="px-3 py-2.5 align-top">
                          <span className="flex items-center gap-2 whitespace-nowrap" style={{ color: TEXT_2 }}>
                            <span className="flex items-center justify-center text-[10px] font-semibold shrink-0" style={{ width: 22, height: 22, borderRadius: 99, backgroundColor: SURFACE_2, color: TEXT }}>{initials}</span>
                            {d.uploaded_by}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 align-top whitespace-nowrap" style={{ color: TEXT_2 }}>{fmtWhen(d.created_at)}</td>
                        <td className="px-3 py-2.5 align-top">
                          <span
                            className="inline-flex items-center gap-1.5 px-2 py-1 text-[11.5px] font-medium whitespace-nowrap"
                            style={{ backgroundColor: hexA(meta.color, 0.13), color: meta.color, borderRadius: 999 }}
                          >
                            <span className={d.status === 'processing' ? 'kb-blink flex' : 'flex'}><Icon name={meta.icon} className="w-3.5 h-3.5" /></span>
                            {d.status === 'processing' && d.reindexing ? 'Re-indexing' : meta.label}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 align-top">
                          <div className="flex items-center justify-end gap-1.5">
                            {isAdmin && d.status !== 'processing' && (
                              <button
                                type="button"
                                onClick={() => reprocess(d)}
                                className="h-7 px-2.5 text-[12px] font-medium kb-row"
                                style={{
                                  color: d.status === 'failed' ? brand.accentColor : TEXT_2,
                                  border: '1px solid ' + (d.status === 'failed' ? hexA(brand.accentColor, 0.42) : LINE),
                                  borderRadius: brand.radius,
                                  backgroundColor: 'transparent'
                                }}
                              >
                                {d.status === 'failed' ? 'Retry' : 'Re-index'}
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => setToast({ kind: 'ok', text: 'Downloading ' + d.filename + ' (' + fmtSize(d.size_bytes) + ') — the original file, unchanged.' })}
                              aria-label={'Download ' + d.filename}
                              className="flex items-center justify-center kb-row"
                              style={{ width: 28, height: 28, borderRadius: brand.radius, color: TEXT_2, border: '1px solid ' + LINE }}
                            >
                              <Icon name="Download" className="w-3.5 h-3.5" />
                            </button>
                            {isAdmin && (
                              <button
                                type="button"
                                onClick={(e) => { returnRef.current = e.currentTarget; setConfirmDoc(d); }}
                                aria-label={'Delete ' + d.filename}
                                className="flex items-center justify-center kb-row"
                                style={{ width: 28, height: 28, borderRadius: brand.radius, color: hexA(DANGER, 0.9), border: '1px solid ' + hexA(DANGER, 0.3) }}
                              >
                                <Icon name="Trash" className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 text-[11.5px]" style={{ borderTop: '1px solid ' + LINE_SOFT, color: TEXT_2 }}>
            <span>Documents, chunks and vectors persist across reload, sign-out and backend restart. Deletes are never automatic.</span>
            <button type="button" onClick={() => navigate('chat')} className="inline-flex items-center gap-1 font-medium" style={{ color: brand.primaryColor }}>
              Ask the assistant about these documents
              <Icon name="ArrowRight" className="w-3.5 h-3.5" />
            </button>
          </div>
        </section>
      </div>

      {/* Confirmed delete */}
      {confirmDoc && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 kb-fade"
          style={{ backgroundColor: 'rgba(4,8,13,0.74)' }}
          onMouseDown={(e) => { if (e.target === e.currentTarget) closeConfirm(); }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="kb-del-title"
            aria-describedby="kb-del-desc"
            className="w-full max-w-md p-5"
            style={{ backgroundColor: brand.backgroundColor, border: '1px solid ' + hexA(brand.neutralColor, 0.3), borderRadius: brand.radius, boxShadow: '0 24px 60px rgba(0,0,0,0.55)' }}
          >
            <div className="flex items-start gap-3">
              <span className="shrink-0 flex items-center justify-center" style={{ width: 32, height: 32, borderRadius: brand.radius, backgroundColor: hexA(DANGER, 0.14), color: DANGER }}>
                <Icon name="Trash" className="w-4 h-4" />
              </span>
              <div>
                <h2 id="kb-del-title" className="text-[15px] font-semibold">Delete {confirmDoc.filename}?</h2>
                <p id="kb-del-desc" className="mt-2 text-[13px]" style={{ color: TEXT_2, fontVariantNumeric: 'tabular-nums' }}>
                  This removes the stored file, its {(confirmDoc.chunks || 0).toLocaleString()} chunks and their vectors. The assistant will stop retrieving and citing it immediately, and it will not come back on reload. This cannot be undone.
                </p>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Btn
                ref={cancelRef}
                type="button"
                onClick={closeConfirm}
                className="h-9 px-4 text-[13px] font-medium"
                style={{ backgroundColor: 'transparent', color: TEXT, border: '1px solid ' + LINE, borderRadius: brand.radius }}
              >
                Keep document
              </Btn>
              <Btn
                type="button"
                onClick={doDelete}
                className="h-9 px-4 text-[13px] font-semibold"
                style={{ backgroundColor: DANGER, color: brand.backgroundColor, border: 'none', borderRadius: brand.radius }}
              >
                Delete permanently
              </Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
