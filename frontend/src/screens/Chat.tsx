// @ts-nocheck -- generated from the approved design under its JS runtime contract; not hand-written TypeScript.
/* eslint-disable @typescript-eslint/no-unused-vars */
import React from "react";

import * as UI from "@/lib/ui";
import { Icons } from "@/lib/icons";
import { brand } from "@/lib/brand";
import { useNavigate } from "@/lib/navigate";

const { Plus, Search, X, ChevronRight, ChevronDown, Menu, FileText, Package, Clock, Trash, Download, ArrowRight, AlertCircle, CheckCircle } = Icons;

// ---------------------------------------------------------------------------
// Knowledge Assistant — Chat (Operations Console direction)
// ---------------------------------------------------------------------------

const SAFE_ICONS = typeof Icons === 'object' && Icons ? Icons : {};

function Ico(name, props) {
  const C = SAFE_ICONS[name];
  if (!C) return null;
  const merged = Object.assign({ className: 'h-3.5 w-3.5', 'aria-hidden': 'true' }, props || {});
  return React.createElement(C, merged);
}

function withAlpha(hex, a) {
  const h = String(hex || '#000000').replace('#', '');
  const full = h.length === 3 ? h.split('').map(function (c) { return c + c; }).join('') : h;
  const n = parseInt(full, 16);
  return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
}

const INK = 'rgba(233,240,246,0.94)';
const INK_DIM = 'rgba(233,240,246,0.62)';
const LINE = 'rgba(255,255,255,0.09)';
const SURFACE = 'rgba(255,255,255,0.035)';
const SURFACE_2 = 'rgba(255,255,255,0.055)';

const ME = { name: 'Priya Raman', email: 'priya.raman@northaxis.com', role: 'Administrator', initials: 'PR' };

const INDEX_STATS = { documents: 38, ready: 35, processing: 2, chunks: 1284, threshold: 0.62, synced: '4 min ago' };

// Indexed chunks used by live retrieval ------------------------------------
const CHUNKS = [
  {
    chunk_id: 'ch-4821', document_id: 'doc-14', filename: 'Q3-2026-Expense-Guidelines.pdf', file_type: 'PDF',
    page_ref: 'p. 4', section_ref: '3.2 Client entertainment', score: 0.84,
    keywords: ['expense', 'dinner', 'client', 'meal', 'entertainment', 'limit', 'head'],
    answer: 'Client entertainment is capped at £65 per head including service and soft drinks',
    text_preview: '3.2 Client entertainment — A per-head limit of £65 applies to all client-facing meals, inclusive of service charge and non-alcoholic drinks. The limit is per attendee, not per booking, and is unaffected by the seniority of those present.'
  },
  {
    chunk_id: 'ch-4834', document_id: 'doc-14', filename: 'Q3-2026-Expense-Guidelines.pdf', file_type: 'PDF',
    page_ref: 'p. 5', section_ref: '3.4 Pre-approval', score: 0.79,
    keywords: ['approval', 'approve', 'finance', 'exceed', 'above', 'director', 'expense'],
    answer: 'Anything above the per-head cap needs written Finance pre-approval recorded on the claim before the event takes place',
    text_preview: '3.4 Pre-approval — Spend above a published cap must be approved in writing by Finance before the commitment is made. The approval reference is entered on the expense claim; retrospective approvals are refused at audit.'
  },
  {
    chunk_id: 'ch-1190', document_id: 'doc-07', filename: 'Employee-Handbook-v9.docx', file_type: 'DOCX',
    page_ref: null, section_ref: 'Leave and time off (table)', score: 0.81,
    keywords: ['leave', 'holiday', 'carry', 'annual', 'vacation', 'days', 'unused'],
    answer: 'Up to five days of unused annual leave carry into the next leave year and must be taken before 31 March',
    text_preview: 'Leave and time off — Carry-over | Maximum 5 days | Expires 31 March | Exceptions logged by line manager. Days above the five-day maximum lapse at year end and are not paid in lieu.'
  },
  {
    chunk_id: 'ch-2277', document_id: 'doc-18', filename: 'Remote-Work-Policy-2026.pdf', file_type: 'PDF',
    page_ref: 'p. 2', section_ref: '1.4 On-site expectation', score: 0.77,
    keywords: ['remote', 'home', 'office', 'hybrid', 'onsite', 'week', 'desk'],
    answer: 'Hybrid staff are expected on site two days a week, agreed with their manager and logged in the team calendar',
    text_preview: '1.4 On-site expectation — Colleagues on a hybrid pattern attend a company site on two working days each week. The pattern is agreed with the line manager and published in the team calendar so desks can be planned.'
  },
  {
    chunk_id: 'ch-3302', document_id: 'doc-22', filename: 'Security-Incident-Runbook.md', file_type: 'MD',
    page_ref: null, section_ref: '## Escalation matrix', score: 0.88,
    keywords: ['sev', 'severity', 'incident', 'escalation', 'page', 'oncall', 'breach', 'outage'],
    answer: 'A Sev-1 pages the on-call engineer immediately and the duty incident manager within 15 minutes',
    text_preview: '## Escalation matrix\n| Severity | First page | Escalation |\n| Sev-1 | On-call engineer, immediate | Duty incident manager within 15 min, exec sponsor at 60 min |\n| Sev-2 | On-call engineer, 30 min | Team lead at 2 h |'
  },
  {
    chunk_id: 'ch-3318', document_id: 'doc-22', filename: 'Security-Incident-Runbook.md', file_type: 'MD',
    page_ref: null, section_ref: '## Contractor and supplier access', score: 0.74,
    keywords: ['vpn', 'contractor', 'access', 'supplier', 'credential', 'laptop', 'network'],
    answer: 'Contractor VPN access is time-boxed to the contract end date and needs a sponsoring manager plus a completed security induction',
    text_preview: '## Contractor and supplier access\nVPN accounts for non-employees expire automatically on the contract end date held in the supplier record. A sponsoring manager and a completed security induction are required before the account is enabled.'
  },
  {
    chunk_id: 'ch-5009', document_id: 'doc-31', filename: 'Data-Retention-Standard-2026.pdf', file_type: 'PDF',
    page_ref: 'p. 11', section_ref: '4.1 Operational records', score: 0.80,
    keywords: ['retention', 'retain', 'delete', 'ticket', 'archive', 'records', 'purge'],
    answer: 'Support tickets and their attachments are retained for 24 months and then removed by the quarterly purge job',
    text_preview: '4.1 Operational records — Support tickets, including attachments and internal notes, are retained for 24 months from closure. The quarterly purge job removes records past that point and writes a deletion receipt to the audit log.'
  },
  {
    chunk_id: 'ch-0442', document_id: 'doc-09', filename: 'Onboarding-Checklist.txt', file_type: 'TXT',
    page_ref: null, section_ref: 'Week one', score: 0.76,
    keywords: ['onboarding', 'buddy', 'starter', 'induction', 'joiner', 'first'],
    answer: 'Every new starter is assigned an onboarding buddy from their own team on day one',
    text_preview: 'Week one\n- Day 1: assign onboarding buddy from the same team; buddy books a 30-minute daily check-in for the first week.\n- Day 2: security induction.\n- Day 4: manager sets probation objectives.'
  },
  {
    chunk_id: 'ch-1206', document_id: 'doc-07', filename: 'Employee-Handbook-v9.docx', file_type: 'DOCX',
    page_ref: null, section_ref: 'IT equipment', score: 0.72,
    keywords: ['laptop', 'refresh', 'hardware', 'device', 'replace', 'equipment'],
    answer: 'Laptops run on a 36-month refresh cycle; earlier replacement needs an IT ticket quoting a fault reference',
    text_preview: 'IT equipment — Standard laptops are refreshed every 36 months from the issue date shown in the asset register. Replacement before that point requires an IT ticket with a hardware fault reference attached.'
  }
];

function cite(chunkId, number) {
  const c = CHUNKS.filter(function (x) { return x.chunk_id === chunkId; })[0];
  return {
    number: number, chunk_id: c.chunk_id, document_id: c.document_id, filename: c.filename,
    file_type: c.file_type, page_ref: c.page_ref, section_ref: c.section_ref,
    text_preview: c.text_preview, score: c.score
  };
}

const INITIAL_CONVERSATIONS = [
  {
    id: 'c-301', title: 'Expense limit for client dinners', group: 'today', when: '11:02',
    messages: [
      { id: 'm-9011', role: 'user', content: 'What is the per-head limit for client dinners, and does it change if a director is in the room?' },
      {
        id: 'm-9012', role: 'assistant', from_documents: true,
        content: 'Client entertainment is capped at £65 per head, inclusive of service charge and non-alcoholic drinks [1]. Seniority does not raise the cap — a director being present makes no difference. Anything above £65 per head needs written Finance pre-approval recorded on the claim before the event, and retrospective approvals are refused at audit [2].',
        citations: [cite('ch-4821', 1), cite('ch-4834', 2)]
      },
      { id: 'm-9013', role: 'user', content: 'And a team dinner with no client present?' },
      {
        id: 'm-9014', role: 'assistant', from_documents: true,
        content: 'That falls under internal entertainment rather than client entertainment, so the £65 client cap does not apply — the pre-approval rule still does for any spend above a published cap [1].',
        citations: [cite('ch-4834', 1)]
      }
    ]
  },
  {
    id: 'c-302', title: 'Carry-over of unused leave', group: 'today', when: '09:41',
    messages: [
      { id: 'm-9001', role: 'user', content: 'How many days of unused leave can I carry into next year?' },
      {
        id: 'm-9002', role: 'assistant', from_documents: true,
        content: 'Up to five days of unused annual leave carry into the next leave year, and they must be taken before 31 March [1]. Days beyond the five-day maximum lapse at year end and are not paid in lieu [1].',
        citations: [cite('ch-1190', 1)]
      }
    ]
  },
  {
    id: 'c-303', title: 'VPN access for contractors', group: 'today', when: '08:17',
    messages: [
      { id: 'm-8991', role: 'user', content: 'What is the process for giving a contractor VPN access?' },
      {
        id: 'm-8992', role: 'assistant', error: true,
        errorTitle: 'Groq stopped the request — rate limited',
        content: 'The answer model returned 429 (rate limit) three times in six seconds, so we stopped rather than looping. Retrieval already found 2 matching chunks, and nothing was lost: your question is saved in this conversation.'
      }
    ]
  },
  {
    id: 'c-304', title: 'Sev-1 escalation path', group: 'yesterday', when: '16:28',
    messages: [
      { id: 'm-8801', role: 'user', content: 'Who gets paged when we declare a Sev-1, and how quickly?' },
      {
        id: 'm-8802', role: 'assistant', from_documents: true,
        content: 'A Sev-1 pages the on-call engineer immediately, with the duty incident manager escalated within 15 minutes and the exec sponsor at 60 minutes [1]. Sev-2 is a 30-minute page to the on-call engineer with the team lead at two hours [1].',
        citations: [cite('ch-3302', 1)]
      }
    ]
  },
  {
    id: 'c-305', title: 'Laptop refresh cycle', group: 'yesterday', when: '10:55',
    messages: [
      { id: 'm-8701', role: 'user', content: 'How often are laptops replaced?' },
      {
        id: 'm-8702', role: 'assistant', from_documents: true,
        content: 'Standard laptops are refreshed every 36 months from the issue date in the asset register [1]. Earlier replacement needs an IT ticket quoting a hardware fault reference [1].',
        citations: [cite('ch-1206', 1)]
      }
    ]
  },
  {
    id: 'c-306', title: 'Data retention for support tickets', group: 'earlier', when: 'Fri 9 Oct',
    messages: [
      { id: 'm-8601', role: 'user', content: 'How long do we keep closed support tickets and their attachments?' },
      {
        id: 'm-8602', role: 'assistant', from_documents: true,
        content: 'Support tickets, including attachments and internal notes, are retained for 24 months from closure [1]. The quarterly purge job removes anything past that and writes a deletion receipt to the audit log [1].',
        citations: [cite('ch-5009', 1)]
      }
    ]
  },
  {
    id: 'c-307', title: 'Onboarding buddy assignment', group: 'earlier', when: 'Tue 6 Oct',
    messages: [
      { id: 'm-8501', role: 'user', content: 'Who assigns the onboarding buddy for a new starter?' },
      {
        id: 'm-8502', role: 'assistant', from_documents: true,
        content: 'The buddy is assigned on day one from the new starter’s own team, and books a 30-minute daily check-in for the first week [1].',
        citations: [cite('ch-0442', 1)]
      }
    ]
  },
  {
    id: 'c-308', title: 'pgvector cosine distance explained', group: 'earlier', when: 'Fri 2 Oct',
    messages: [
      { id: 'm-8401', role: 'user', content: 'How does cosine distance work in pgvector?' },
      {
        id: 'm-8402', role: 'assistant', from_documents: false,
        content: 'Nothing in the knowledge base cleared the 0.62 similarity threshold for this question — the closest chunk scored 0.31. Answering from general knowledge: cosine distance is 1 minus the cosine of the angle between two vectors, so identical directions score 0 and opposites score 2. In pgvector it is written as the <=> operator, and an index built for cosine must be created with vector_cosine_ops to be used by the planner.'
      }
    ]
  }
];

const GROUPS = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'earlier', label: 'Previous conversations' }
];

const SUGGESTIONS = [
  'How many days of unused leave carry over?',
  'Who gets paged for a Sev-1 incident?',
  'How long do we keep closed support tickets?'
];

function retrieve(question) {
  const terms = (question.toLowerCase().match(/[a-z0-9']+/g) || []).filter(function (t) { return t.length > 2; });
  const scored = CHUNKS.map(function (c) {
    let hits = 0;
    c.keywords.forEach(function (k) {
      const match = terms.some(function (t) { return t === k || t.indexOf(k) === 0 || k.indexOf(t) === 0; });
      if (match) hits += 1;
    });
    return { chunk: c, hits: hits, score: hits ? Math.min(0.94, c.score + 0.02 * (hits - 1)) : 0.18 + (c.score / 10) };
  }).sort(function (a, b) { return b.score - a.score; });

  const relevant = scored.filter(function (s) { return s.hits > 0 && s.score >= INDEX_STATS.threshold; }).slice(0, 3);
  return { relevant: relevant, best: scored[0] ? scored[0].score : 0 };
}

function buildAnswer(question) {
  const r = retrieve(question);
  if (r.relevant.length) {
    const citations = r.relevant.map(function (s, i) { return cite(s.chunk.chunk_id, i + 1); });
    const body = r.relevant.map(function (s, i) { return s.chunk.answer + ' [' + (i + 1) + '].'; }).join(' ');
    return { from_documents: true, content: body, citations: citations };
  }
  return {
    from_documents: false,
    content: 'Nothing in the knowledge base cleared the ' + INDEX_STATS.threshold.toFixed(2) +
      ' similarity threshold for this question — the closest chunk scored ' + r.best.toFixed(2) +
      '. Answering from general knowledge instead: this is usually set out in an internal policy rather than anything universal, so treat the general view as a starting point. If it should be answerable here, ask an administrator to add the source document to the knowledge base.'
  };
}

function clock() {
  const d = new Date();
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

// ---------------------------------------------------------------------------

export default function Screen() {
  const navigate = useNavigate();
  const [conversations, setConversations] = React.useState(INITIAL_CONVERSATIONS);
  const [activeId, setActiveId] = React.useState('c-301');
  const [search, setSearch] = React.useState('');
  const [draft, setDraft] = React.useState('');
  const [pending, setPending] = React.useState(null);
  const [source, setSource] = React.useState(null);
  const [deleteTarget, setDeleteTarget] = React.useState(null);
  const [toast, setToast] = React.useState(null);
  const [live, setLive] = React.useState('');
  const [historyOpen, setHistoryOpen] = React.useState(false);

  const nextId = React.useRef(400);
  const threadRef = React.useRef(null);
  const cancelRef = React.useRef(null);
  const composerRef = React.useRef(null);

  const active = conversations.filter(function (c) { return c.id === activeId; })[0] || null;
  const messages = active ? active.messages : [];

  // answer generation ------------------------------------------------------
  React.useEffect(function () {
    if (!pending) return undefined;
    const t = setTimeout(function () {
      const built = buildAnswer(pending.question);
      const msg = Object.assign({ id: 'm-' + (nextId.current++), role: 'assistant' }, built);
      setConversations(function (prev) {
        return prev.map(function (c) {
          return c.id === pending.convId ? Object.assign({}, c, { messages: c.messages.concat([msg]) }) : c;
        });
      });
      setLive(built.from_documents
        ? 'Answer ready, grounded in ' + built.citations.length + ' source' + (built.citations.length === 1 ? '' : 's') + '.'
        : 'Answer ready. Not from your documents — no sources attached.');
      setPending(null);
    }, 1300);
    return function () { clearTimeout(t); };
  }, [pending]);

  React.useEffect(function () {
    if (!toast) return undefined;
    const t = setTimeout(function () { setToast(null); }, 2800);
    return function () { clearTimeout(t); };
  }, [toast]);

  React.useEffect(function () {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [activeId, messages.length, pending]);

  React.useEffect(function () {
    if (deleteTarget && cancelRef.current) cancelRef.current.focus();
  }, [deleteTarget]);

  // actions ----------------------------------------------------------------
  function ask(text) {
    const q = String(text || '').trim();
    if (!q || pending) return;
    let convId = activeId;
    const userMsg = { id: 'm-' + (nextId.current++), role: 'user', content: q };

    if (!convId) {
      convId = 'c-' + (nextId.current++);
      const title = q.length > 44 ? q.slice(0, 44).replace(/\s+\S*$/, '') + '…' : q.replace(/\?$/, '');
      const conv = { id: convId, title: title, group: 'today', when: clock(), messages: [userMsg] };
      setConversations(function (prev) { return [conv].concat(prev); });
      setActiveId(convId);
    } else {
      setConversations(function (prev) {
        return prev.map(function (c) {
          return c.id === convId
            ? Object.assign({}, c, { when: clock(), messages: c.messages.concat([userMsg]) })
            : c;
        });
      });
    }
    setDraft('');
    setLive('Question sent. Searching ' + INDEX_STATS.chunks.toLocaleString() + ' indexed chunks.');
    setPending({ convId: convId, question: q });
  }

  function retry(convId, errorMsgId) {
    const conv = conversations.filter(function (c) { return c.id === convId; })[0];
    if (!conv) return;
    const idx = conv.messages.findIndex(function (m) { return m.id === errorMsgId; });
    const question = idx > 0 ? conv.messages[idx - 1].content : '';
    setConversations(function (prev) {
      return prev.map(function (c) {
        return c.id === convId
          ? Object.assign({}, c, { messages: c.messages.filter(function (m) { return m.id !== errorMsgId; }) })
          : c;
      });
    });
    setLive('Retrying. Retrieval runs again for this question.');
    setPending({ convId: convId, question: question });
  }

  function confirmDelete() {
    const target = deleteTarget;
    setConversations(function (prev) { return prev.filter(function (c) { return c.id !== target.id; }); });
    if (activeId === target.id) { setActiveId(null); setSource(null); }
    setDeleteTarget(null);
    setToast({ title: 'Conversation deleted', detail: '“' + target.title + '” and its messages and citations are gone.' });
    setLive('Conversation deleted.');
    if (composerRef.current) composerRef.current.focus();
  }

  function startNewChat() {
    setActiveId(null);
    setSource(null);
    setHistoryOpen(false);
    if (composerRef.current) composerRef.current.focus();
  }

  // filtering --------------------------------------------------------------
  const term = search.trim().toLowerCase();
  const filtered = term
    ? conversations.filter(function (c) {
      if (c.title.toLowerCase().indexOf(term) !== -1) return true;
      return c.messages.some(function (m) { return String(m.content).toLowerCase().indexOf(term) !== -1; });
    })
    : conversations;

  const citedCount = messages.reduce(function (n, m) { return n + (m.citations ? m.citations.length : 0); }, 0);

  // shared styles ----------------------------------------------------------
  const cardStyle = { backgroundColor: SURFACE, borderColor: LINE, borderRadius: brand.radius };
  const label = 'text-[10px] font-semibold uppercase tracking-[0.12em]';

  function pill(tone) {
    const c = tone === 'accent' ? brand.accentColor : tone === 'primary' ? brand.primaryColor : brand.neutralColor;
    return {
      color: c,
      backgroundColor: withAlpha(c, 0.12),
      borderColor: withAlpha(c, 0.35),
      borderRadius: brand.radius
    };
  }

  // renderers --------------------------------------------------------------
  function renderCitationChip(m, c) {
    const selected = source && source.chunk_id === c.chunk_id && source.messageId === m.id;
    return (
      <li key={c.chunk_id}>
        <button
          type="button"
          onClick={function () { setSource(Object.assign({}, c, { messageId: m.id })); }}
          aria-pressed={selected ? 'true' : 'false'}
          aria-label={'Source ' + c.number + ': ' + c.filename + ', ' + (c.page_ref || c.section_ref)}
          className="ka-focus group flex max-w-[20rem] items-center gap-1.5 border px-2 py-1 text-[11px] transition-colors"
          style={{
            borderRadius: brand.radius,
            borderColor: selected ? withAlpha(brand.primaryColor, 0.65) : LINE,
            backgroundColor: selected ? withAlpha(brand.primaryColor, 0.16) : SURFACE_2,
            color: selected ? brand.primaryColor : INK
          }}
        >
          <span
            className="tabular-nums flex h-4 w-4 shrink-0 items-center justify-center text-[10px] font-bold"
            style={{ borderRadius: '3px', backgroundColor: withAlpha(brand.primaryColor, 0.22), color: brand.primaryColor }}
          >
            {c.number}
          </span>
          <span className="truncate">{c.filename}</span>
          <span className="tabular-nums shrink-0" style={{ color: INK_DIM }}>{c.page_ref || 'sect.'}</span>
        </button>
      </li>
    );
  }

  function renderMessage(m) {
    if (m.role === 'user') {
      return (
        <li key={m.id} className="ka-rise flex justify-end">
          <div className="flex max-w-[46rem] items-start gap-2.5">
            <p
              className="border px-3 py-2 text-[13px] leading-relaxed"
              style={{ borderRadius: brand.radius, borderColor: withAlpha(brand.primaryColor, 0.3), backgroundColor: withAlpha(brand.primaryColor, 0.1), color: INK }}
            >
              {m.content}
            </p>
            <span
              className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center text-[10px] font-bold"
              style={{ borderRadius: brand.radius, backgroundColor: withAlpha(brand.primaryColor, 0.2), color: brand.primaryColor }}
              aria-hidden="true"
            >
              {ME.initials}
            </span>
          </div>
        </li>
      );
    }

    if (m.error) {
      return (
        <li key={m.id} className="ka-rise">
          <div
            className="max-w-[48rem] border p-3.5"
            style={{ borderRadius: brand.radius, borderColor: withAlpha(brand.accentColor, 0.45), backgroundColor: withAlpha(brand.accentColor, 0.08) }}
          >
            <div className="flex items-center gap-2" style={{ color: brand.accentColor }}>
              {Ico('AlertCircle', { className: 'h-4 w-4' })}
              <h4 className="text-[13px] font-semibold">{m.errorTitle}</h4>
            </div>
            <p className="mt-2 text-[13px] leading-relaxed" style={{ color: INK }}>{m.content}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={function () { retry(active.id, m.id); }}
                className="ka-focus inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[12px] font-semibold"
                style={{ borderRadius: brand.radius, backgroundColor: brand.accentColor, color: '#15202B' }}
              >
                {Ico('ArrowRight')}
                Retry this question
              </button>
              <span className="tabular-nums text-[11px]" style={{ color: INK_DIM }}>3 attempts · 6.0s · model llama-3.1-70b</span>
            </div>
          </div>
        </li>
      );
    }

    const grounded = m.from_documents;
    return (
      <li key={m.id} className="ka-rise">
        <div className="flex items-start gap-2.5">
          <span
            className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center"
            style={{ borderRadius: brand.radius, backgroundColor: withAlpha(brand.primaryColor, 0.9), color: '#08121A' }}
            aria-hidden="true"
          >
            {Ico('FileText', { className: 'h-3.5 w-3.5' })}
          </span>
          <div className="min-w-0 flex-1">
            <span
              className="inline-flex items-center gap-1.5 border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em]"
              style={pill(grounded ? 'primary' : 'accent')}
            >
              {Ico(grounded ? 'CheckCircle' : 'AlertCircle', { className: 'h-3 w-3' })}
              {grounded ? 'From your documents' : 'Not from your documents'}
            </span>
            <p className="mt-2 max-w-[48rem] text-[13.5px] leading-relaxed" style={{ color: INK }}>{m.content}</p>
            {grounded && m.citations && m.citations.length ? (
              <div className="mt-2.5">
                <h4 className={label + ' mb-1.5'} style={{ color: INK_DIM }}>
                  Sources ({m.citations.length})
                </h4>
                <ul className="flex flex-wrap gap-1.5">
                  {m.citations.map(function (c) { return renderCitationChip(m, c); })}
                </ul>
              </div>
            ) : null}
            {!grounded ? (
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                <span className="text-[11px]" style={{ color: INK_DIM }}>No citations attached — nothing cleared the threshold.</span>
                <button
                  type="button"
                  onClick={function () { navigate('knowledge-base'); }}
                  className="ka-focus inline-flex items-center gap-1 text-[11px] font-semibold underline underline-offset-2"
                  style={{ color: brand.accentColor }}
                >
                  Add a source document
                  {Ico('ChevronRight', { className: 'h-3 w-3' })}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </li>
    );
  }

  // -------------------------------------------------------------------------
  return (
    <div style={{ fontFamily: brand.fontBody, color: INK }}>
      <style>{`
        @keyframes ka-rise { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
        @keyframes ka-scan { 0% { transform: translateX(-110%); } 100% { transform: translateX(420%); } }
        @keyframes ka-blink { 0%, 100% { opacity: .25; } 50% { opacity: 1; } }
        .ka-rise { animation: ka-rise .26s cubic-bezier(.2,.7,.3,1) both; }
        .ka-scan { position: relative; overflow: hidden; }
        .ka-scan::after { content: ''; position: absolute; top: 0; bottom: 0; width: 24%;
          background: linear-gradient(90deg, transparent, ${withAlpha(brand.primaryColor, 0.6)}, transparent);
          animation: ka-scan 1.5s linear infinite; }
        .ka-blink { animation: ka-blink 1.3s ease-in-out infinite; }
        .ka-focus:focus-visible { outline: 2px solid ${brand.primaryColor}; outline-offset: 2px; }
        @media (prefers-reduced-motion: reduce) {
          .ka-rise, .ka-scan::after, .ka-blink { animation: none !important; }
        }
      `}</style>

      <p className="sr-only" role="status" aria-live="polite">{live}</p>

      {/* Screen header -------------------------------------------------- */}
      <header className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight" style={{ fontFamily: brand.fontHeading }}>Chat</h1>
          <p className="mt-0.5 text-[12px]" style={{ color: INK_DIM }}>
            Knowledge base is searched before every answer. Signed in as {ME.email} — session restored, history is private to you.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="tabular-nums inline-flex items-center gap-1.5 border px-2 py-1 text-[11px] font-medium" style={pill('primary')}>
            <span className="h-1.5 w-1.5 rounded-full ka-blink" style={{ backgroundColor: brand.primaryColor }} aria-hidden="true" />
            Threshold {INDEX_STATS.threshold.toFixed(2)}
          </span>
          <span className="tabular-nums inline-flex items-center gap-1.5 border px-2 py-1 text-[11px] font-medium" style={pill('neutral')}>
            {Ico('Package')}
            {INDEX_STATS.ready} ready · {INDEX_STATS.chunks.toLocaleString()} chunks
          </span>
          <button
            type="button"
            onClick={function () { navigate('knowledge-base'); }}
            className="ka-focus tabular-nums inline-flex items-center gap-1.5 border px-2 py-1 text-[11px] font-medium"
            style={pill('accent')}
          >
            {Ico('Clock')}
            {INDEX_STATS.processing} processing · synced {INDEX_STATS.synced}
          </button>
        </div>
      </header>

      <button
        type="button"
        onClick={function () { setHistoryOpen(!historyOpen); }}
        aria-expanded={historyOpen ? 'true' : 'false'}
        className="ka-focus mb-2 inline-flex items-center gap-1.5 border px-2.5 py-1.5 text-[12px] font-medium lg:hidden"
        style={{ borderRadius: brand.radius, borderColor: LINE, backgroundColor: SURFACE, color: INK }}
      >
        {Ico(historyOpen ? 'ChevronDown' : 'Menu')}
        {historyOpen ? 'Hide history' : 'Show history'} ({conversations.length})
      </button>

      <div className="flex flex-col gap-3 lg:h-[calc(100vh-11rem)] lg:min-h-[32rem] lg:flex-row">

        {/* History rail ------------------------------------------------- */}
        <aside
          className={(historyOpen ? 'flex' : 'hidden') + ' w-full shrink-0 flex-col border lg:flex lg:w-[16.5rem]'}
          style={cardStyle}
          aria-label="Conversation history"
        >
          <div className="border-b p-2.5" style={{ borderColor: LINE }}>
            <button
              type="button"
              onClick={startNewChat}
              className="ka-focus flex w-full items-center justify-center gap-1.5 px-3 py-2 text-[12.5px] font-semibold transition-opacity hover:opacity-90"
              style={{ borderRadius: brand.radius, backgroundColor: brand.primaryColor, color: '#08121A' }}
            >
              {Ico('Plus', { className: 'h-4 w-4' })}
              New chat
            </button>
            <div className="mt-2.5">
              <label htmlFor="history-search" className={label + ' block mb-1'} style={{ color: INK_DIM }}>
                Search your history
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2" style={{ color: INK_DIM }}>
                  {Ico('Search')}
                </span>
                <input
                  id="history-search"
                  type="text"
                  value={search}
                  onChange={function (e) { setSearch(e.target.value); }}
                  placeholder="leave, Sev-1, retention…"
                  className="ka-focus w-full border bg-transparent py-1.5 pl-7 pr-2 text-[12px] outline-none placeholder:opacity-50"
                  style={{ borderRadius: brand.radius, borderColor: LINE, color: INK }}
                />
              </div>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
            {conversations.length === 0 ? (
              <div className="px-2 py-8 text-center">
                <span className="inline-flex h-8 w-8 items-center justify-center" style={{ borderRadius: brand.radius, backgroundColor: SURFACE_2, color: brand.primaryColor }} aria-hidden="true">
                  {Ico('Clock', { className: 'h-4 w-4' })}
                </span>
                <h3 className="mt-2 text-[12.5px] font-semibold">No conversations yet</h3>
                <p className="mt-1 text-[11.5px] leading-relaxed" style={{ color: INK_DIM }}>
                  Ask your first question below. Chats are saved server-side and visible only to you.
                </p>
              </div>
            ) : filtered.length === 0 ? (
              <div className="px-2 py-8 text-center">
                <h3 className="text-[12.5px] font-semibold">No conversations found</h3>
                <p className="mt-1 text-[11.5px] leading-relaxed" style={{ color: INK_DIM }}>
                  Nothing in your history matches “{search}”.
                </p>
                <button
                  type="button"
                  onClick={function () { setSearch(''); }}
                  className="ka-focus mt-2.5 inline-flex items-center gap-1 border px-2 py-1 text-[11.5px] font-semibold"
                  style={{ borderRadius: brand.radius, borderColor: withAlpha(brand.primaryColor, 0.4), color: brand.primaryColor }}
                >
                  {Ico('X')}
                  Clear search
                </button>
              </div>
            ) : (
              GROUPS.map(function (g) {
                const rows = filtered.filter(function (c) { return c.group === g.key; });
                if (!rows.length) return null;
                return (
                  <section key={g.key} className="mb-3">
                    <h3 className={label + ' px-1 pb-1.5'} style={{ color: INK_DIM }}>{g.label}</h3>
                    <ul className="space-y-0.5">
                      {rows.map(function (c) {
                        const isActive = c.id === activeId;
                        return (
                          <li key={c.id} className="ka-rise flex items-stretch gap-1">
                            <button
                              type="button"
                              onClick={function () { setActiveId(c.id); setSource(null); setHistoryOpen(false); }}
                              aria-current={isActive ? 'true' : undefined}
                              className="ka-focus min-w-0 flex-1 px-2 py-1.5 text-left transition-colors"
                              style={{
                                borderRadius: brand.radius,
                                backgroundColor: isActive ? withAlpha(brand.primaryColor, 0.14) : 'transparent',
                                boxShadow: isActive ? 'inset 2px 0 0 0 ' + brand.primaryColor : 'none'
                              }}
                            >
                              <span className="block truncate text-[12.5px] font-medium" style={{ color: isActive ? INK : 'rgba(233,240,246,0.82)' }}>
                                {c.title}
                              </span>
                              <span className="tabular-nums mt-0.5 block text-[10.5px]" style={{ color: INK_DIM }}>
                                {c.when} · {c.messages.length} message{c.messages.length === 1 ? '' : 's'}
                              </span>
                            </button>
                            <button
                              type="button"
                              onClick={function () { setDeleteTarget(c); }}
                              aria-label={'Delete conversation: ' + c.title}
                              className="ka-focus flex w-7 shrink-0 items-center justify-center transition-colors hover:bg-white/5"
                              style={{ borderRadius: brand.radius, color: INK_DIM }}
                            >
                              {Ico('Trash')}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                );
              })
            )}
          </div>

          <div className="border-t p-2.5" style={{ borderColor: LINE }}>
            <div className="flex items-center gap-2">
              <span
                className="flex h-7 w-7 shrink-0 items-center justify-center text-[10px] font-bold"
                style={{ borderRadius: brand.radius, backgroundColor: withAlpha(brand.primaryColor, 0.2), color: brand.primaryColor }}
                aria-hidden="true"
              >
                {ME.initials}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12px] font-medium">{ME.name}</p>
                <p className="truncate text-[10.5px]" style={{ color: INK_DIM }}>{ME.role}</p>
              </div>
              <button
                type="button"
                onClick={function () { navigate('sign-in'); }}
                className="ka-focus px-1.5 py-1 text-[11px] font-semibold underline underline-offset-2"
                style={{ color: INK_DIM }}
              >
                Sign out
              </button>
            </div>
          </div>
        </aside>

        {/* Thread -------------------------------------------------------- */}
        <section className="flex min-h-[28rem] min-w-0 flex-1 flex-col border" style={cardStyle} aria-label="Conversation">
          <div className="flex items-center justify-between gap-3 border-b px-3.5 py-2.5" style={{ borderColor: LINE }}>
            <div className="min-w-0">
              <h2 className="truncate text-[14px] font-semibold" style={{ fontFamily: brand.fontHeading }}>
                {active ? active.title : 'New chat'}
              </h2>
              <p className="tabular-nums mt-0.5 text-[11px]" style={{ color: INK_DIM }}>
                {active
                  ? messages.length + ' messages · ' + citedCount + ' source' + (citedCount === 1 ? '' : 's') + ' cited · saved server-side'
                  : 'Nothing sent yet — your first question creates the conversation'}
              </p>
            </div>
            {active ? (
              <button
                type="button"
                onClick={function () { setDeleteTarget(active); }}
                className="ka-focus inline-flex shrink-0 items-center gap-1.5 border px-2 py-1.5 text-[11.5px] font-medium transition-colors hover:bg-white/5"
                style={{ borderRadius: brand.radius, borderColor: LINE, color: INK_DIM }}
              >
                {Ico('Trash')}
                Delete chat
              </button>
            ) : null}
          </div>

          <div ref={threadRef} className="min-h-0 flex-1 overflow-y-auto px-3.5 py-4">
            {!active || messages.length === 0 ? (
              <div className="mx-auto max-w-[34rem] py-10 text-center">
                <span
                  className="inline-flex h-10 w-10 items-center justify-center"
                  style={{ borderRadius: brand.radius, backgroundColor: withAlpha(brand.primaryColor, 0.14), color: brand.primaryColor }}
                  aria-hidden="true"
                >
                  {Ico('Search', { className: 'h-5 w-5' })}
                </span>
                <h3 className="mt-3 text-[15px] font-semibold" style={{ fontFamily: brand.fontHeading }}>
                  Ask the knowledge base
                </h3>
                <p className="mx-auto mt-1.5 max-w-[26rem] text-[12.5px] leading-relaxed" style={{ color: INK_DIM }}>
                  Every question is embedded and matched against {INDEX_STATS.chunks.toLocaleString()} indexed chunks first.
                  Answers that clear {INDEX_STATS.threshold.toFixed(2)} carry numbered sources; anything else is badged
                  “Not from your documents”.
                </p>
                <ul className="mx-auto mt-4 flex max-w-[28rem] flex-col gap-1.5">
                  {SUGGESTIONS.map(function (s) {
                    return (
                      <li key={s}>
                        <button
                          type="button"
                          onClick={function () { ask(s); }}
                          className="ka-focus flex w-full items-center justify-between gap-2 border px-3 py-2 text-left text-[12.5px] transition-colors hover:bg-white/5"
                          style={{ borderRadius: brand.radius, borderColor: LINE, color: INK }}
                        >
                          {s}
                          {Ico('ArrowRight', { className: 'h-3.5 w-3.5 shrink-0' })}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : (
              <ul className="space-y-5">
                {messages.map(renderMessage)}
                {pending && pending.convId === active.id ? (
                  <li className="ka-rise">
                    <div className="flex items-start gap-2.5">
                      <span
                        className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center"
                        style={{ borderRadius: brand.radius, backgroundColor: withAlpha(brand.primaryColor, 0.9), color: '#08121A' }}
                        aria-hidden="true"
                      >
                        {Ico('FileText', { className: 'h-3.5 w-3.5' })}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="tabular-nums flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px]" style={{ color: INK_DIM }}>
                          <span style={{ color: brand.primaryColor }}>Embedding query · 768-dim</span>
                          <span>Scanning {INDEX_STATS.chunks.toLocaleString()} chunks at ≥ {INDEX_STATS.threshold.toFixed(2)}</span>
                        </div>
                        <div
                          className="ka-scan mt-2 h-1 w-full max-w-[22rem]"
                          style={{ borderRadius: '999px', backgroundColor: SURFACE_2 }}
                          aria-hidden="true"
                        />
                      </div>
                    </div>
                  </li>
                ) : null}
              </ul>
            )}
          </div>

          {/* Composer --------------------------------------------------- */}
          <div className="border-t p-3" style={{ borderColor: LINE }}>
            <form
              onSubmit={function (e) { e.preventDefault(); ask(draft); }}
              className="border p-2.5"
              style={{ borderRadius: brand.radius, borderColor: withAlpha(brand.primaryColor, 0.28), backgroundColor: 'rgba(255,255,255,0.02)' }}
            >
              <label htmlFor="composer" className={label + ' block mb-1.5'} style={{ color: INK_DIM }}>
                {active && messages.length ? 'Ask a follow-up in this conversation' : 'Ask a question'}
              </label>
              <textarea
                id="composer"
                ref={composerRef}
                rows={2}
                value={draft}
                onChange={function (e) { setDraft(e.target.value); }}
                onKeyDown={function (e) {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(draft); }
                }}
                placeholder="e.g. What is the per-head limit for client dinners?"
                className="ka-focus w-full resize-none bg-transparent text-[13.5px] leading-relaxed outline-none placeholder:opacity-45"
                style={{ color: INK }}
              />
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-[11px]" style={{ color: INK_DIM }}>
                  Enter sends · Shift + Enter adds a line · retrieval runs on every turn, follow-ups included
                </p>
                <button
                  type="submit"
                  disabled={!draft.trim() || !!pending}
                  className="ka-focus inline-flex items-center gap-1.5 px-3.5 py-2 text-[12.5px] font-semibold transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
                  style={{ borderRadius: brand.radius, backgroundColor: brand.primaryColor, color: '#08121A' }}
                >
                  {Ico(pending ? 'Clock' : 'ArrowRight', { className: 'h-4 w-4' })}
                  {pending ? 'Searching…' : 'Search and answer'}
                </button>
              </div>
            </form>
          </div>
        </section>

        {/* Source panel --------------------------------------------------- */}
        {source ? (
          <aside
            className="ka-rise flex w-full shrink-0 flex-col border lg:w-[20rem]"
            style={cardStyle}
            aria-label={'Source ' + source.number + ' detail'}
            onKeyDown={function (e) { if (e.key === 'Escape') setSource(null); }}
          >
            <div className="flex items-center justify-between gap-2 border-b px-3 py-2.5" style={{ borderColor: LINE }}>
              <h2 className="text-[13px] font-semibold" style={{ fontFamily: brand.fontHeading }}>
                Source {source.number}
              </h2>
              <button
                type="button"
                onClick={function () { setSource(null); }}
                aria-label="Close source panel"
                className="ka-focus flex h-6 w-6 items-center justify-center transition-colors hover:bg-white/5"
                style={{ borderRadius: brand.radius, color: INK_DIM }}
              >
                {Ico('X', { className: 'h-4 w-4' })}
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              <p className="break-all text-[12.5px] font-semibold leading-snug">{source.filename}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <span className="inline-flex items-center border px-1.5 py-0.5 text-[10px] font-semibold tracking-wide" style={pill('neutral')}>
                  {source.file_type}
                </span>
                <span className="inline-flex items-center border px-1.5 py-0.5 text-[10px] font-semibold tracking-wide" style={pill('neutral')}>
                  {source.page_ref || 'Section'}
                </span>
                <span className="tabular-nums inline-flex items-center border px-1.5 py-0.5 text-[10px] font-semibold" style={pill('primary')}>
                  {source.score.toFixed(2)} ≥ {INDEX_STATS.threshold.toFixed(2)}
                </span>
              </div>

              <dl className="mt-3 space-y-2">
                <div>
                  <dt className={label} style={{ color: INK_DIM }}>Section</dt>
                  <dd className="mt-0.5 text-[12px]">{source.section_ref}</dd>
                </div>
                <div>
                  <dt className={label} style={{ color: INK_DIM }}>Chunk</dt>
                  <dd className="tabular-nums mt-0.5 text-[12px]">{source.chunk_id} · {source.document_id}</dd>
                </div>
              </dl>

              <h3 className={label + ' mt-3.5 mb-1.5'} style={{ color: INK_DIM }}>Retrieved text</h3>
              <p
                className="whitespace-pre-wrap border p-2.5 font-mono text-[11.5px] leading-relaxed"
                style={{ borderRadius: brand.radius, borderColor: LINE, backgroundColor: 'rgba(0,0,0,0.25)', color: 'rgba(233,240,246,0.85)' }}
              >
                {source.text_preview}
              </p>
            </div>

            <div className="flex flex-col gap-1.5 border-t p-3" style={{ borderColor: LINE }}>
              <button
                type="button"
                onClick={function () { setToast({ title: 'Download started', detail: source.filename + ' — original file, unchanged.' }); }}
                className="ka-focus inline-flex items-center justify-center gap-1.5 px-3 py-2 text-[12.5px] font-semibold"
                style={{ borderRadius: brand.radius, backgroundColor: brand.primaryColor, color: '#08121A' }}
              >
                {Ico('Download', { className: 'h-4 w-4' })}
                Download original
              </button>
              <button
                type="button"
                onClick={function () { navigate('knowledge-base'); }}
                className="ka-focus inline-flex items-center justify-center gap-1.5 border px-3 py-2 text-[12px] font-medium transition-colors hover:bg-white/5"
                style={{ borderRadius: brand.radius, borderColor: LINE, color: INK }}
              >
                {Ico('Package')}
                Open in Knowledge Base
              </button>
            </div>
          </aside>
        ) : null}
      </div>

      {/* Delete confirmation ------------------------------------------- */}
      {deleteTarget ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(5,10,16,0.72)' }}
          onKeyDown={function (e) { if (e.key === 'Escape') setDeleteTarget(null); }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-title"
            aria-describedby="delete-desc"
            className="ka-rise w-full max-w-sm border p-4"
            style={{ borderRadius: brand.radius, borderColor: LINE, backgroundColor: brand.backgroundColor, boxShadow: '0 24px 60px rgba(0,0,0,0.55)' }}
          >
            <h2 id="delete-title" className="text-[14px] font-semibold" style={{ fontFamily: brand.fontHeading }}>
              Delete “{deleteTarget.title}”?
            </h2>
            <p id="delete-desc" className="mt-1.5 text-[12.5px] leading-relaxed" style={{ color: INK_DIM }}>
              This removes the conversation, its {deleteTarget.messages.length} message{deleteTarget.messages.length === 1 ? '' : 's'} and
              every citation attached to them, on the server. It stays deleted after a reload or a new sign-in. Documents are untouched.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                ref={cancelRef}
                onClick={function () { setDeleteTarget(null); }}
                className="ka-focus border px-3 py-1.5 text-[12.5px] font-medium transition-colors hover:bg-white/5"
                style={{ borderRadius: brand.radius, borderColor: LINE, color: INK }}
              >
                Keep conversation
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                className="ka-focus px-3 py-1.5 text-[12.5px] font-semibold"
                style={{ borderRadius: brand.radius, backgroundColor: brand.accentColor, color: '#15202B' }}
              >
                Delete permanently
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Toast ----------------------------------------------------------- */}
      {toast ? (
        <div
          role="status"
          className="ka-rise fixed bottom-4 right-4 z-50 flex max-w-xs items-start gap-2 border p-3"
          style={{ borderRadius: brand.radius, borderColor: withAlpha(brand.primaryColor, 0.4), backgroundColor: brand.backgroundColor, boxShadow: '0 16px 40px rgba(0,0,0,0.5)' }}
        >
          <span style={{ color: brand.primaryColor }} aria-hidden="true">{Ico('CheckCircle', { className: 'h-4 w-4' })}</span>
          <div>
            <p className="text-[12.5px] font-semibold">{toast.title}</p>
            <p className="mt-0.5 text-[11.5px] leading-relaxed" style={{ color: INK_DIM }}>{toast.detail}</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
