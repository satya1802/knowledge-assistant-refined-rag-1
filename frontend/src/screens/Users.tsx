// @ts-nocheck -- generated from the approved design under its JS runtime contract; not hand-written TypeScript.
/* eslint-disable @typescript-eslint/no-unused-vars */
import React from "react";

import * as UI from "@/lib/ui";
import { Icons } from "@/lib/icons";
import { brand } from "@/lib/brand";
import { useNavigate } from "@/lib/navigate";

const { Button, Input, Label, Select, Table, THead, TBody, TR, TH, TD, Separator, Tabs } = UI;
const { Plus, Search, Check, X, ChevronRight, Users, Settings, Clock, Filter, Upload, ArrowLeft, ArrowRight, AlertCircle, CheckCircle } = Icons;

const hexA = (hex, a) => {
  const h = String(hex || "").replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  if (isNaN(n)) return `rgba(135,149,166,${a})`;
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};

const PW_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
const genPassword = () => {
  let out = "";
  for (let i = 0; i < 16; i++) {
    out += PW_ALPHABET[Math.floor(Math.random() * PW_ALPHABET.length)];
    if (i === 3 || i === 9) out += "-";
  }
  return out;
};

const CURRENT_USER = { id: "u_002", name: "Marco Leite", email: "marco.leite@northgate.co" };

const INITIAL_USERS = [
  { id: "u_001", email: "dana.whitfield@northgate.co", role: "admin", is_active: true, failed_attempts: 0, locked_until: null, created_at: "4 Nov 2025", last_seen: "Today 09:12", first_account: true },
  { id: "u_002", email: "marco.leite@northgate.co", role: "admin", is_active: true, failed_attempts: 0, locked_until: null, created_at: "19 Jan 2026", last_seen: "Today 08:47" },
  { id: "u_003", email: "priya.raghavan@northgate.co", role: "admin", is_active: true, failed_attempts: 0, locked_until: null, created_at: "2 Mar 2026", last_seen: "Yesterday 17:05" },
  { id: "u_004", email: "j.okonkwo@northgate.co", role: "user", is_active: true, failed_attempts: 0, locked_until: null, created_at: "11 Apr 2026", last_seen: "Today 10:33" },
  { id: "u_005", email: "helena.vos@northgate.co", role: "user", is_active: true, failed_attempts: 2, locked_until: null, created_at: "7 May 2026", last_seen: "Today 09:58" },
  { id: "u_006", email: "t.bergstrom@northgate.co", role: "user", is_active: true, failed_attempts: 5, locked_until: "Today 14:22", created_at: "22 May 2026", last_seen: "Today 14:07" },
  { id: "u_007", email: "samir.haddad@northgate.co", role: "user", is_active: true, failed_attempts: 0, locked_until: null, created_at: "30 Jun 2026", last_seen: "11 Oct 16:40" },
  { id: "u_008", email: "ruth.amadi@northgate.co", role: "user", is_active: false, failed_attempts: 0, locked_until: null, created_at: "14 Feb 2026", last_seen: "28 Sep 12:19" },
  { id: "u_009", email: "kenji.mori@northgate.co", role: "user", is_active: true, failed_attempts: 1, locked_until: null, created_at: "21 Aug 2026", last_seen: "Today 07:40" },
  { id: "u_010", email: "lucia.ferrer@northgate.co", role: "user", is_active: true, failed_attempts: 0, locked_until: null, created_at: "12 Oct 2026", last_seen: null },
  { id: "u_011", email: "owen.castle@northgate.co", role: "user", is_active: false, failed_attempts: 0, locked_until: null, created_at: "9 Dec 2025", last_seen: "3 Oct 09:02" },
  { id: "u_012", email: "nadia.sorokin@northgate.co", role: "user", is_active: true, failed_attempts: 0, locked_until: null, created_at: "15 Sep 2026", last_seen: "Yesterday 16:12" },
];

const INITIAL_AUDIT = [
  { id: "a_09", action: "auth.lock", detail: "t.bergstrom@northgate.co — 5 failed attempts in 15 min", actor: "system", at: "Today 14:07" },
  { id: "a_08", action: "settings.update", detail: "similarity_threshold 0.58 → 0.62", actor: "Dana Whitfield", at: "Today 09:14" },
  { id: "a_07", action: "user.create", detail: "lucia.ferrer@northgate.co — standard user", actor: "Dana Whitfield", at: "12 Oct 11:26" },
  { id: "a_06", action: "user.disable", detail: "owen.castle@northgate.co — left the company", actor: "Marco Leite", at: "11 Oct 15:02" },
  { id: "a_05", action: "settings.update", detail: "answer_model llama-3.1-8b-instant → llama-3.3-70b-versatile", actor: "Marco Leite", at: "8 Oct 10:55" },
  { id: "a_04", action: "user.role_grant", detail: "priya.raghavan@northgate.co → administrator", actor: "Dana Whitfield", at: "2 Oct 10:41" },
];

const MODELS = [
  { id: "llama-3.3-70b-versatile", note: "Default. Holds citation numbering across long retrieved context." },
  { id: "llama-3.1-70b-versatile", note: "Previous default. Slightly cheaper, marginally weaker grounding." },
  { id: "llama-3.1-8b-instant", note: "Fastest. Short answers; drops source numbering on long contexts." },
  { id: "mixtral-8x7b-32768", note: "Longest context window. Least reliable at refusing to answer." },
];

const TABS = [
  { id: "users", label: "Users" },
  { id: "settings", label: "Retrieval & model" },
];

const statusOf = (u) => {
  if (u.locked_until) return { key: "locked", label: "Locked", tone: "warn" };
  if (!u.is_active) return { key: "disabled", label: "Disabled", tone: "off" };
  if (!u.last_seen) return { key: "invited", label: "Invited", tone: "idle" };
  return { key: "active", label: "Active", tone: "ok" };
};

export default function Screen() {
  const navigate = useNavigate();
  const C = {
    text: "rgba(236,241,246,0.95)",
    muted: brand.neutralColor,
    border: hexA(brand.neutralColor, 0.22),
    borderSoft: hexA(brand.neutralColor, 0.13),
    surface: hexA(brand.neutralColor, 0.06),
    surfaceHi: hexA(brand.neutralColor, 0.1),
  };

  const [tab, setTab] = React.useState("users");
  const [users, setUsers] = React.useState(INITIAL_USERS);
  const [audit, setAudit] = React.useState(INITIAL_AUDIT);
  const [query, setQuery] = React.useState("");
  const [roleFilter, setRoleFilter] = React.useState("all");
  const [statusFilter, setStatusFilter] = React.useState("all");

  const [formOpen, setFormOpen] = React.useState(false);
  const [email, setEmail] = React.useState("");
  const [newRole, setNewRole] = React.useState("user");
  const [activeOnCreate, setActiveOnCreate] = React.useState(true);
  const [tempPw, setTempPw] = React.useState(genPassword);
  const [formError, setFormError] = React.useState(null);

  const [credential, setCredential] = React.useState(null);
  const [copied, setCopied] = React.useState(false);
  const [banner, setBanner] = React.useState(null);
  const [newRowId, setNewRowId] = React.useState(null);

  const [threshold, setThreshold] = React.useState(0.62);
  const [thresholdText, setThresholdText] = React.useState("0.62");
  const [model, setModel] = React.useState("llama-3.3-70b-versatile");
  const [saved, setSaved] = React.useState({ threshold: 0.62, model: "llama-3.3-70b-versatile" });
  const [settingsError, setSettingsError] = React.useState(null);
  const [settingsOk, setSettingsOk] = React.useState(false);
  const [sync, setSync] = React.useState({ state: "stale", at: "09:41" });
  const [conn, setConn] = React.useState({ state: "connected", latency: 182, at: "09:40" });

  const timers = React.useRef([]);
  const tabRefs = React.useRef({});
  const emailRef = React.useRef(null);

  React.useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const later = (fn, ms) => { timers.current.push(setTimeout(fn, ms)); };

  const logAudit = (action, detail) =>
    setAudit((a) => [{ id: "a_" + Math.random().toString(36).slice(2, 8), action, detail, actor: CURRENT_USER.name, at: "just now", fresh: true }, ...a].slice(0, 9));

  const counts = React.useMemo(() => {
    const total = users.length;
    const admins = users.filter((u) => u.role === "admin").length;
    const active = users.filter((u) => statusOf(u).key === "active").length;
    const blocked = users.filter((u) => u.locked_until || !u.is_active).length;
    return { total, admins, active, blocked };
  }, [users]);

  const visible = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return users.filter((u) => {
      if (q && u.email.toLowerCase().indexOf(q) === -1) return false;
      if (roleFilter !== "all" && u.role !== roleFilter) return false;
      if (statusFilter !== "all" && statusOf(u).key !== statusFilter) return false;
      return true;
    });
  }, [users, query, roleFilter, statusFilter]);

  const dirty = saved.threshold !== threshold || saved.model !== model;

  const copy = (text) => {
    try { if (navigator && navigator.clipboard) navigator.clipboard.writeText(text); } catch (e) { /* clipboard unavailable */ }
    setCopied(true);
    later(() => setCopied(false), 1800);
  };

  const submitUser = (e) => {
    e.preventDefault();
    const value = email.trim().toLowerCase();
    if (!value) { setFormError("Enter the work email address for the new account."); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) { setFormError("That does not look like an email address. Use the person's work address, e.g. name@northgate.co."); return; }
    if (users.some((u) => u.email === value)) { setFormError("That email already has an account. Re-issue a temporary password on the existing row instead."); return; }
    if (tempPw.replace(/-/g, "").length < 12) { setFormError("Temporary passwords must be at least 12 characters. Use Generate for a safe one."); return; }
    const id = "u_" + Math.random().toString(36).slice(2, 7);
    setUsers((list) => [{ id, email: value, role: newRole, is_active: activeOnCreate, failed_attempts: 0, locked_until: null, created_at: "Today", last_seen: null }, ...list]);
    setCredential({ email: value, password: tempPw, kind: "new" });
    logAudit("user.create", value + " — " + (newRole === "admin" ? "administrator" : "standard user"));
    setNewRowId(id);
    setFormError(null);
    setFormOpen(false);
    setEmail("");
    setNewRole("user");
    setActiveOnCreate(true);
    setTempPw(genPassword());
    setBanner(null);
    later(() => setNewRowId(null), 2600);
  };

  const toggleRole = (u) => {
    if (u.role === "admin" && u.first_account) {
      setBanner({ tone: "warn", text: "Dana Whitfield created this installation. The first account keeps the administrator role so the knowledge base can never be left without an owner." });
      return;
    }
    if (u.role === "admin" && u.id === CURRENT_USER.id) {
      setBanner({ tone: "warn", text: "You cannot remove your own administrator role. Ask Dana Whitfield or Priya Raghavan to do it for you." });
      return;
    }
    setUsers((list) => list.map((x) => (x.id === u.id ? { ...x, role: x.role === "admin" ? "user" : "admin" } : x)));
    logAudit(u.role === "admin" ? "user.role_revoke" : "user.role_grant", u.email + (u.role === "admin" ? " → standard user" : " → administrator"));
    setBanner({ tone: "ok", text: u.role === "admin" ? u.email + " is now a standard user. Upload, delete and re-index are no longer available to them." : u.email + " is now an administrator and can upload to the knowledge base." });
  };

  const toggleActive = (u) => {
    if (u.is_active && u.first_account) {
      setBanner({ tone: "warn", text: "The first account cannot be disabled. Transfer ownership by granting another administrator first." });
      return;
    }
    setUsers((list) => list.map((x) => (x.id === u.id ? { ...x, is_active: !x.is_active, locked_until: null, failed_attempts: 0 } : x)));
    logAudit(u.is_active ? "user.disable" : "user.enable", u.email);
    setBanner({ tone: "ok", text: u.is_active ? u.email + " is disabled. Their live session is rejected on the next request." : u.email + " can sign in again." });
  };

  const unlock = (u) => {
    setUsers((list) => list.map((x) => (x.id === u.id ? { ...x, locked_until: null, failed_attempts: 0 } : x)));
    logAudit("auth.unlock", u.email + " — lock cleared manually");
    setBanner({ tone: "ok", text: "Lock cleared for " + u.email + ". The failed-attempt counter is back to zero." });
  };

  const reissue = (u) => {
    const pw = genPassword();
    setCredential({ email: u.email, password: pw, kind: "reset" });
    logAudit("user.password_reset", u.email + " — temporary password issued");
    setBanner(null);
  };

  const saveSettings = () => {
    const parsed = parseFloat(thresholdText);
    if (isNaN(parsed) || parsed < 0.4 || parsed > 0.9) {
      setSettingsError("Threshold must be between 0.40 and 0.90. 0.62 is the tested default — lower it to retrieve more loosely, raise it to be stricter about what counts as a match.");
      setSettingsOk(false);
      return;
    }
    const rounded = Math.round(parsed * 100) / 100;
    const changes = [];
    if (rounded !== saved.threshold) changes.push("similarity_threshold " + saved.threshold.toFixed(2) + " → " + rounded.toFixed(2));
    if (model !== saved.model) changes.push("answer_model " + saved.model + " → " + model);
    setThreshold(rounded);
    setThresholdText(rounded.toFixed(2));
    setSaved({ threshold: rounded, model });
    setSettingsError(null);
    setSettingsOk(true);
    if (changes.length) logAudit("settings.update", changes.join(" · "));
    setSync({ state: "live", at: "just now" });
    later(() => setSettingsOk(false), 4000);
  };

  const resync = () => {
    setSync({ state: "syncing", at: sync.at });
    later(() => setSync({ state: "live", at: "just now" }), 700);
  };

  const testConnection = () => {
    setConn({ state: "checking" });
    later(() => setConn({ state: "connected", latency: 164, at: "just now" }), 900);
  };

  const onTabKey = (e) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const i = TABS.findIndex((t) => t.id === tab);
    const next = TABS[(i + (e.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length];
    setTab(next.id);
    later(() => { const el = tabRefs.current[next.id]; if (el) el.focus(); }, 0);
  };

  const toneColor = (tone) => (tone === "ok" ? brand.primaryColor : tone === "warn" ? brand.accentColor : C.muted);

  const chip = (activeState, onClick, label, key) => (
    <button
      key={key}
      type="button"
      onClick={onClick}
      aria-pressed={activeState}
      className="ka-focus px-2.5 py-1 text-[12px] transition-colors"
      style={{
        borderRadius: brand.radius,
        color: activeState ? brand.backgroundColor : C.muted,
        backgroundColor: activeState ? brand.primaryColor : "transparent",
        fontWeight: activeState ? 600 : 500,
      }}
    >
      {label}
    </button>
  );

  const Tile = ({ label, value, sub, color }) => (
    <div className="px-4 py-3" style={{ borderRadius: brand.radius, backgroundColor: C.surface, border: `1px solid ${C.borderSoft}` }}>
      <p className="text-[10px] uppercase tracking-[0.14em]" style={{ color: C.muted }}>{label}</p>
      <p className="mt-1.5 text-[26px] leading-none font-semibold" style={{ color: color || C.text, fontVariantNumeric: "tabular-nums" }}>{value}</p>
      <p className="mt-1.5 text-[11px]" style={{ color: C.muted }}>{sub}</p>
    </div>
  );

  const rowBtn = (label, onClick, opts) => (
    <button
      type="button"
      onClick={onClick}
      aria-label={opts.aria}
      className="ka-focus px-2 py-1 text-[11.5px] transition-colors hover:brightness-125"
      style={{
        borderRadius: "0.3rem",
        border: `1px solid ${opts.strong ? hexA(brand.accentColor, 0.5) : C.border}`,
        color: opts.strong ? brand.accentColor : C.text,
        backgroundColor: opts.strong ? hexA(brand.accentColor, 0.1) : "transparent",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </button>
  );

  return (
    <div style={{ fontFamily: brand.fontBody, color: C.text }} className="pb-16">
      <style>{`
        .ka-focus:focus-visible { outline: 2px solid ${brand.primaryColor}; outline-offset: 2px; }
        .ka-in { animation: ka-in .3s ease-out both; }
        .ka-row { animation: ka-row .45s ease-out both; }
        @keyframes ka-in { from { opacity: 0; transform: translateY(-5px); } to { opacity: 1; transform: none; } }
        @keyframes ka-row { 0% { opacity: 0; transform: translateY(-6px); background-color: ${hexA(brand.primaryColor, 0.22)}; } 100% { opacity: 1; transform: none; background-color: transparent; } }
        .ka-range { accent-color: ${brand.primaryColor}; }
        .ka-table tbody tr:hover { background-color: ${hexA(brand.neutralColor, 0.07)}; }
        @media (prefers-reduced-motion: reduce) {
          .ka-in, .ka-row { animation: none !important; }
          * { transition-duration: 0.01ms !important; }
        }
      `}</style>

      {/* Header */}
      <header className="pt-1">
        <p className="text-[11px] uppercase tracking-[0.18em]" style={{ color: brand.primaryColor }}>Administration</p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-[26px] font-semibold tracking-tight" style={{ fontFamily: brand.fontHeading }}>Users &amp; Settings</h1>
            <p className="mt-1.5 text-[13px] max-w-2xl" style={{ color: C.muted }}>
              Provision accounts, issue temporary passwords out of band, and tune what the assistant treats as a match before it answers.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              onClick={() => { setFormOpen((o) => !o); setFormError(null); later(() => { if (emailRef.current) emailRef.current.focus(); }, 60); }}
              aria-expanded={formOpen}
              className="ka-focus inline-flex items-center gap-1.5 px-3.5 py-2 text-[13px] font-semibold"
              style={{ backgroundColor: brand.primaryColor, color: brand.backgroundColor, borderRadius: brand.radius, border: "none" }}
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              {formOpen ? "Close form" : "Provision user"}
            </Button>
          </div>
        </div>
        <p className="mt-3 text-[12px] flex flex-wrap items-center gap-x-3 gap-y-1" style={{ color: C.muted, fontVariantNumeric: "tabular-nums" }}>
          <span>{counts.total} accounts</span>
          <span aria-hidden="true">·</span>
          <span>{counts.admins} administrators</span>
          <span aria-hidden="true">·</span>
          <span>threshold {saved.threshold.toFixed(2)} in force</span>
          <span aria-hidden="true">·</span>
          <span>{saved.model}</span>
        </p>
      </header>

      {/* Tabs */}
      <div role="tablist" aria-label="Administration sections" onKeyDown={onTabKey} className="mt-6 flex gap-6 border-b" style={{ borderColor: C.borderSoft }}>
        {TABS.map((t) => {
          const on = tab === t.id;
          return (
            <button
              key={t.id}
              ref={(el) => { tabRefs.current[t.id] = el; }}
              role="tab"
              id={"tab-" + t.id}
              aria-selected={on}
              aria-controls={"panel-" + t.id}
              tabIndex={on ? 0 : -1}
              onClick={() => setTab(t.id)}
              className="ka-focus -mb-px pb-2.5 text-[13px] transition-colors"
              style={{ color: on ? C.text : C.muted, fontWeight: on ? 600 : 500, borderBottom: `2px solid ${on ? brand.primaryColor : "transparent"}` }}
            >
              {t.label}
              {t.id === "users" ? <span className="ml-1.5 text-[11px]" style={{ color: C.muted, fontVariantNumeric: "tabular-nums" }}>{counts.total}</span> : null}
            </button>
          );
        })}
      </div>

      {/* USERS PANEL */}
      <div role="tabpanel" id="panel-users" aria-labelledby="tab-users" hidden={tab !== "users"}>
        {tab === "users" ? (
          <div className="mt-5 space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Tile label="Accounts" value={counts.total} sub="provisioned by an admin" />
              <Tile label="Active" value={counts.active} sub="signed in at least once" color={brand.primaryColor} />
              <Tile label="Locked or disabled" value={counts.blocked} sub="cannot sign in right now" color={counts.blocked ? brand.accentColor : C.text} />
              <Tile label="Administrators" value={counts.admins} sub="can upload and re-index" />
            </div>

            {/* One-time credential */}
            {credential ? (
              <div className="ka-in p-4" style={{ borderRadius: brand.radius, border: `1px solid ${hexA(brand.accentColor, 0.45)}`, backgroundColor: hexA(brand.accentColor, 0.08) }}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-[13px] font-semibold" style={{ color: brand.accentColor }}>
                      {credential.kind === "new" ? "Temporary password — shown once" : "New temporary password — shown once"}
                    </h2>
                    <p className="mt-1 text-[12.5px]" style={{ color: C.text }}>
                      For <span className="font-medium">{credential.email}</span>. Knowledge Assistant sends no email — pass this on in person or over an approved channel. It is stored only as a bcrypt hash.
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <code className="px-3 py-1.5 text-[13px]" style={{ borderRadius: "0.3rem", backgroundColor: hexA(brand.neutralColor, 0.16), letterSpacing: "0.04em", fontVariantNumeric: "tabular-nums" }}>
                        {credential.password}
                      </code>
                      <button type="button" onClick={() => copy(credential.password)} className="ka-focus inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[12px]" style={{ borderRadius: "0.3rem", border: `1px solid ${C.border}`, color: C.text }}>
                        {copied ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : null}
                        {copied ? "Copied" : "Copy password"}
                      </button>
                    </div>
                  </div>
                  <button type="button" aria-label="Dismiss temporary password" onClick={() => setCredential(null)} className="ka-focus p-1" style={{ color: C.muted, borderRadius: "0.3rem" }}>
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </div>
            ) : null}

            {/* Action banner */}
            {banner ? (
              <div className="ka-in flex items-start gap-2.5 px-3.5 py-2.5" style={{ borderRadius: brand.radius, border: `1px solid ${banner.tone === "warn" ? hexA(brand.accentColor, 0.4) : hexA(brand.primaryColor, 0.4)}`, backgroundColor: banner.tone === "warn" ? hexA(brand.accentColor, 0.07) : hexA(brand.primaryColor, 0.07) }}>
                {banner.tone === "warn"
                  ? <AlertCircle className="h-4 w-4 mt-px shrink-0" style={{ color: brand.accentColor }} aria-hidden="true" />
                  : <CheckCircle className="h-4 w-4 mt-px shrink-0" style={{ color: brand.primaryColor }} aria-hidden="true" />}
                <p className="text-[12.5px] flex-1">{banner.text}</p>
                <button type="button" aria-label="Dismiss message" onClick={() => setBanner(null)} className="ka-focus p-0.5" style={{ color: C.muted, borderRadius: "0.3rem" }}>
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            ) : null}

            {/* Provision form */}
            {formOpen ? (
              <form onSubmit={submitUser} className="ka-in p-4" style={{ borderRadius: brand.radius, border: `1px solid ${hexA(brand.primaryColor, 0.35)}`, backgroundColor: C.surface }}>
                <h2 className="text-[13px] font-semibold">New account</h2>
                <p className="mt-1 text-[12px]" style={{ color: C.muted }}>The account is created immediately. The password below is displayed once and never again.</p>

                <div className="mt-4 grid gap-4 lg:grid-cols-12">
                  <div className="lg:col-span-5">
                    <Label htmlFor="new-email" className="block text-[11px] uppercase tracking-[0.12em]" style={{ color: C.muted }}>Work email</Label>
                    <Input
                      id="new-email"
                      ref={emailRef}
                      type="email"
                      value={email}
                      onChange={(e) => { setEmail(e.target.value); setFormError(null); }}
                      placeholder="name@northgate.co"
                      aria-invalid={formError ? true : undefined}
                      aria-describedby={formError ? "new-user-error" : undefined}
                      className="mt-1.5 w-full px-2.5 py-2 text-[13px]"
                      style={{ borderRadius: "0.35rem", backgroundColor: brand.backgroundColor, border: `1px solid ${formError ? hexA(brand.accentColor, 0.6) : C.border}`, color: C.text }}
                    />
                  </div>

                  <fieldset className="lg:col-span-3">
                    <legend className="text-[11px] uppercase tracking-[0.12em]" style={{ color: C.muted }}>Role</legend>
                    <div className="mt-2 flex gap-4">
                      {[{ v: "user", l: "Standard" }, { v: "admin", l: "Administrator" }].map((o) => (
                        <label key={o.v} className="flex items-center gap-1.5 text-[13px] cursor-pointer">
                          <input
                            type="radio"
                            name="new-role"
                            value={o.v}
                            checked={newRole === o.v}
                            onChange={() => setNewRole(o.v)}
                            className="ka-focus ka-range h-3.5 w-3.5"
                          />
                          {o.l}
                        </label>
                      ))}
                    </div>
                    <label className="mt-3 flex items-center gap-1.5 text-[12.5px] cursor-pointer" style={{ color: C.muted }}>
                      <input type="checkbox" checked={activeOnCreate} onChange={(e) => setActiveOnCreate(e.target.checked)} className="ka-focus ka-range h-3.5 w-3.5" />
                      Active on creation
                    </label>
                  </fieldset>

                  <div className="lg:col-span-4">
                    <Label htmlFor="new-pw" className="block text-[11px] uppercase tracking-[0.12em]" style={{ color: C.muted }}>Temporary password</Label>
                    <div className="mt-1.5 flex gap-2">
                      <Input
                        id="new-pw"
                        value={tempPw}
                        onChange={(e) => { setTempPw(e.target.value); setFormError(null); }}
                        className="flex-1 w-full px-2.5 py-2 text-[13px]"
                        style={{ borderRadius: "0.35rem", backgroundColor: brand.backgroundColor, border: `1px solid ${C.border}`, color: C.text, letterSpacing: "0.04em" }}
                      />
                      <button type="button" onClick={() => setTempPw(genPassword())} className="ka-focus px-2.5 text-[12px]" style={{ borderRadius: "0.35rem", border: `1px solid ${C.border}`, color: C.text }}>
                        Generate
                      </button>
                    </div>
                  </div>
                </div>

                {formError ? (
                  <p id="new-user-error" role="alert" className="ka-in mt-3 flex items-start gap-2 text-[12.5px]" style={{ color: brand.accentColor }}>
                    <AlertCircle className="h-4 w-4 mt-px shrink-0" aria-hidden="true" />
                    {formError}
                  </p>
                ) : null}

                <div className="mt-4 flex items-center gap-2">
                  <Button type="submit" className="ka-focus px-3.5 py-2 text-[13px] font-semibold" style={{ backgroundColor: brand.primaryColor, color: brand.backgroundColor, borderRadius: brand.radius, border: "none" }}>
                    Create account
                  </Button>
                  <button type="button" onClick={() => { setFormOpen(false); setFormError(null); }} className="ka-focus px-3 py-2 text-[13px]" style={{ borderRadius: brand.radius, border: `1px solid ${C.border}`, color: C.muted }}>
                    Cancel
                  </button>
                </div>
              </form>
            ) : null}

            {/* Filters + table */}
            <section style={{ borderRadius: brand.radius, border: `1px solid ${C.borderSoft}`, backgroundColor: C.surface }}>
              <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b" style={{ borderColor: C.borderSoft }}>
                <div className="relative">
                  <Label htmlFor="user-search" className="sr-only">Search accounts by email</Label>
                  <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: C.muted }} aria-hidden="true" />
                  <Input
                    id="user-search"
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search email"
                    className="pl-8 pr-2.5 py-1.5 text-[12.5px] w-56"
                    style={{ borderRadius: "0.35rem", backgroundColor: brand.backgroundColor, border: `1px solid ${C.border}`, color: C.text }}
                  />
                </div>

                <div className="flex items-center gap-1" role="group" aria-label="Filter by role">
                  <span className="text-[11px] uppercase tracking-[0.12em] mr-1" style={{ color: C.muted }}>Role</span>
                  {chip(roleFilter === "all", () => setRoleFilter("all"), "All", "r-all")}
                  {chip(roleFilter === "admin", () => setRoleFilter("admin"), "Admin", "r-admin")}
                  {chip(roleFilter === "user", () => setRoleFilter("user"), "Standard", "r-user")}
                </div>

                <div className="flex items-center gap-1" role="group" aria-label="Filter by status">
                  <span className="text-[11px] uppercase tracking-[0.12em] mr-1" style={{ color: C.muted }}>Status</span>
                  {chip(statusFilter === "all", () => setStatusFilter("all"), "All", "s-all")}
                  {chip(statusFilter === "active", () => setStatusFilter("active"), "Active", "s-active")}
                  {chip(statusFilter === "invited", () => setStatusFilter("invited"), "Invited", "s-inv")}
                  {chip(statusFilter === "locked", () => setStatusFilter("locked"), "Locked", "s-locked")}
                  {chip(statusFilter === "disabled", () => setStatusFilter("disabled"), "Disabled", "s-dis")}
                </div>

                <p className="ml-auto text-[11.5px]" style={{ color: C.muted, fontVariantNumeric: "tabular-nums" }} aria-live="polite">
                  Showing {visible.length} of {users.length}
                </p>
              </div>

              {visible.length === 0 ? (
                <div className="px-6 py-14 text-center">
                  <Users className="h-6 w-6 mx-auto" style={{ color: C.muted }} aria-hidden="true" />
                  <h3 className="mt-3 text-[14px] font-semibold">No account matches those filters</h3>
                  <p className="mt-1.5 text-[12.5px] mx-auto max-w-sm" style={{ color: C.muted }}>
                    {query ? <>Nothing matches “{query}”{roleFilter !== "all" || statusFilter !== "all" ? " with the current filters" : ""}.</> : "No account has that combination of role and status right now."}
                  </p>
                  <button
                    type="button"
                    onClick={() => { setQuery(""); setRoleFilter("all"); setStatusFilter("all"); }}
                    className="ka-focus mt-4 px-3 py-1.5 text-[12.5px] font-medium"
                    style={{ borderRadius: brand.radius, border: `1px solid ${hexA(brand.primaryColor, 0.5)}`, color: brand.primaryColor }}
                  >
                    Clear search and filters
                  </button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table className="ka-table w-full text-[13px]" style={{ fontVariantNumeric: "tabular-nums", borderCollapse: "collapse" }}>
                    <caption className="sr-only">Provisioned accounts with role, status, failed sign-in attempts and admin actions</caption>
                    <THead>
                      <TR style={{ borderBottom: `1px solid ${C.borderSoft}` }}>
                        {[["Email", "left"], ["Role", "left"], ["Status", "left"], ["Failed", "right"], ["Created", "left"], ["Last seen", "left"], ["Actions", "right"]].map(([h, align]) => (
                          <TH key={h} scope="col" className={"px-4 py-2 text-[10.5px] uppercase tracking-[0.12em] font-medium " + (align === "right" ? "text-right" : "text-left")} style={{ color: C.muted, whiteSpace: "nowrap" }}>
                            {h}
                          </TH>
                        ))}
                      </TR>
                    </THead>
                    <TBody>
                      {visible.map((u) => {
                        const s = statusOf(u);
                        const isSelf = u.id === CURRENT_USER.id;
                        return (
                          <TR key={u.id} className={u.id === newRowId ? "ka-row" : ""} style={{ borderBottom: `1px solid ${C.borderSoft}`, transition: "background-color .2s ease" }}>
                            <TD className="px-4 py-2.5">
                              <span className="font-medium">{u.email}</span>
                              {u.first_account ? <span className="ml-2 text-[10.5px]" style={{ color: C.muted }}>first account</span> : null}
                              {isSelf ? <span className="ml-2 text-[10.5px]" style={{ color: brand.primaryColor }}>you</span> : null}
                            </TD>
                            <TD className="px-4 py-2.5" style={{ color: u.role === "admin" ? C.text : C.muted }}>
                              {u.role === "admin" ? "Administrator" : "Standard"}
                            </TD>
                            <TD className="px-4 py-2.5">
                              <span className="inline-flex items-center gap-1.5">
                                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: toneColor(s.tone) }} aria-hidden="true" />
                                <span style={{ color: s.tone === "off" || s.tone === "idle" ? C.muted : toneColor(s.tone) }}>{s.label}</span>
                                {u.locked_until ? <span className="text-[11px]" style={{ color: C.muted }}>until {u.locked_until}</span> : null}
                              </span>
                            </TD>
                            <TD className="px-4 py-2.5 text-right" style={{ color: u.failed_attempts >= 3 ? brand.accentColor : u.failed_attempts ? C.text : C.muted }}>
                              {u.failed_attempts}
                            </TD>
                            <TD className="px-4 py-2.5" style={{ color: C.muted }}>{u.created_at}</TD>
                            <TD className="px-4 py-2.5" style={{ color: u.last_seen ? C.muted : hexA(brand.accentColor, 0.95) }}>
                              {u.last_seen || "Never signed in"}
                            </TD>
                            <TD className="px-4 py-2.5">
                              <div className="flex justify-end gap-1.5">
                                {u.locked_until ? rowBtn("Unlock", () => unlock(u), { aria: "Unlock " + u.email, strong: true }) : null}
                                {rowBtn(u.role === "admin" ? "Revoke admin" : "Make admin", () => toggleRole(u), { aria: (u.role === "admin" ? "Revoke administrator role from " : "Grant administrator role to ") + u.email })}
                                {rowBtn(u.is_active ? "Disable" : "Enable", () => toggleActive(u), { aria: (u.is_active ? "Disable " : "Enable ") + u.email })}
                                {rowBtn("New password", () => reissue(u), { aria: "Issue a new temporary password for " + u.email })}
                              </div>
                            </TD>
                          </TR>
                        );
                      })}
                    </TBody>
                  </Table>
                </div>
              )}
            </section>

            {/* Audit */}
            <section style={{ borderRadius: brand.radius, border: `1px solid ${C.borderSoft}` }}>
              <div className="flex items-center justify-between px-4 py-2.5 border-b" style={{ borderColor: C.borderSoft }}>
                <h2 className="text-[11px] uppercase tracking-[0.14em]" style={{ color: C.muted }}>Admin activity</h2>
                <button type="button" onClick={() => navigate("docs")} className="ka-focus inline-flex items-center gap-1 text-[12px]" style={{ color: brand.primaryColor, borderRadius: "0.3rem" }}>
                  What gets logged
                  <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
              <ul className="divide-y" style={{ borderColor: C.borderSoft }}>
                {audit.map((a) => (
                  <li key={a.id} className={"flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-2 text-[12.5px] " + (a.fresh ? "ka-in" : "")}>
                    <code className="text-[11.5px]" style={{ color: a.action.indexOf("lock") > -1 ? brand.accentColor : brand.primaryColor }}>{a.action}</code>
                    <span className="flex-1" style={{ color: C.text }}>{a.detail}</span>
                    <span style={{ color: C.muted, fontVariantNumeric: "tabular-nums" }}>{a.actor} · {a.at}</span>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        ) : null}
      </div>

      {/* SETTINGS PANEL */}
      <div role="tabpanel" id="panel-settings" aria-labelledby="tab-settings" hidden={tab !== "settings"}>
        {tab === "settings" ? (
          <div className="mt-5 space-y-4">
            {sync.state !== "live" ? (
              <div className="ka-in flex flex-wrap items-center gap-3 px-3.5 py-2.5" style={{ borderRadius: brand.radius, borderLeft: `2px solid ${brand.accentColor}`, border: `1px solid ${C.borderSoft}`, backgroundColor: C.surface }}>
                <Clock className="h-4 w-4" style={{ color: brand.accentColor }} aria-hidden="true" />
                <p className="text-[12.5px] flex-1">
                  Showing values read at <span style={{ fontVariantNumeric: "tabular-nums" }}>{sync.at}</span>. The settings service has not answered since — what is in force on the server may differ.
                </p>
                <button type="button" onClick={resync} disabled={sync.state === "syncing"} className="ka-focus px-2.5 py-1 text-[12px]" style={{ borderRadius: "0.3rem", border: `1px solid ${C.border}`, color: C.text, opacity: sync.state === "syncing" ? 0.6 : 1 }}>
                  {sync.state === "syncing" ? "Re-reading…" : "Re-read settings"}
                </button>
              </div>
            ) : (
              <p className="text-[12px] flex items-center gap-1.5" style={{ color: C.muted }}>
                <CheckCircle className="h-3.5 w-3.5" style={{ color: brand.primaryColor }} aria-hidden="true" />
                Settings synced {sync.at}.
              </p>
            )}

            <div className="grid gap-4 lg:grid-cols-3">
              {/* Retrieval — focal */}
              <section className="lg:col-span-2 p-5" style={{ borderRadius: brand.radius, border: `1px solid ${C.borderSoft}`, backgroundColor: C.surface }}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-[15px] font-semibold" style={{ fontFamily: brand.fontHeading }}>Retrieval threshold</h2>
                    <p className="mt-1.5 text-[12.5px] max-w-xl" style={{ color: C.muted }}>
                      Every question is embedded and matched against the indexed chunks before any answer is generated. Chunks scoring at or above this cosine similarity become the answer context; if nothing clears it, the answer comes back behind a “Not from your documents” badge with no citations.
                    </p>
                  </div>
                  {dirty ? (
                    <span className="ka-in shrink-0 px-2 py-0.5 text-[11px]" style={{ borderRadius: "999px", color: brand.accentColor, border: `1px solid ${hexA(brand.accentColor, 0.5)}` }}>Unsaved</span>
                  ) : null}
                </div>

                <div className="mt-6 flex items-end gap-6">
                  <div>
                    <p className="text-[52px] leading-none font-semibold" style={{ fontVariantNumeric: "tabular-nums", color: brand.primaryColor }}>{threshold.toFixed(2)}</p>
                    <p className="mt-2 text-[11px] uppercase tracking-[0.14em]" style={{ color: C.muted }}>cosine similarity</p>
                  </div>
                  <div className="flex-1">
                    <Label htmlFor="threshold-range" className="block text-[11px] uppercase tracking-[0.12em]" style={{ color: C.muted }}>Adjust threshold</Label>
                    <input
                      id="threshold-range"
                      type="range"
                      min="0.40"
                      max="0.90"
                      step="0.01"
                      value={threshold}
                      onChange={(e) => { const v = parseFloat(e.target.value); setThreshold(v); setThresholdText(v.toFixed(2)); setSettingsError(null); setSettingsOk(false); }}
                      className="ka-focus ka-range mt-3 w-full"
                    />
                    <div className="mt-1.5 flex justify-between text-[11px]" style={{ color: C.muted, fontVariantNumeric: "tabular-nums" }}>
                      <span>0.40 looser</span>
                      <span>0.62 default</span>
                      <span>0.90 stricter</span>
                    </div>
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap items-end gap-4">
                  <div>
                    <Label htmlFor="threshold-value" className="block text-[11px] uppercase tracking-[0.12em]" style={{ color: C.muted }}>Exact value</Label>
                    <Input
                      id="threshold-value"
                      value={thresholdText}
                      onChange={(e) => { setThresholdText(e.target.value); setSettingsOk(false); const v = parseFloat(e.target.value); if (!isNaN(v) && v >= 0.4 && v <= 0.9) { setThreshold(Math.round(v * 100) / 100); setSettingsError(null); } }}
                      inputMode="decimal"
                      aria-invalid={settingsError ? true : undefined}
                      aria-describedby={settingsError ? "settings-error" : "threshold-help"}
                      className="mt-1.5 w-24 px-2.5 py-2 text-[13px]"
                      style={{ borderRadius: "0.35rem", backgroundColor: brand.backgroundColor, border: `1px solid ${settingsError ? hexA(brand.accentColor, 0.6) : C.border}`, color: C.text, fontVariantNumeric: "tabular-nums" }}
                    />
                  </div>
                  <div className="flex-1 min-w-[16rem]">
                    <Label htmlFor="answer-model" className="block text-[11px] uppercase tracking-[0.12em]" style={{ color: C.muted }}>Answer model (Groq)</Label>
                    <Select
                      id="answer-model"
                      value={model}
                      onChange={(e) => { setModel(e.target.value); setSettingsOk(false); }}
                      className="mt-1.5 w-full px-2.5 py-2 text-[13px]"
                      style={{ borderRadius: "0.35rem", backgroundColor: brand.backgroundColor, border: `1px solid ${C.border}`, color: C.text }}
                    >
                      {MODELS.map((m) => (
                        <option key={m.id} value={m.id} style={{ backgroundColor: brand.backgroundColor, color: C.text }}>{m.id}</option>
                      ))}
                    </Select>
                  </div>
                </div>

                <p id="threshold-help" className="mt-3 text-[12px]" style={{ color: C.muted }}>
                  {(MODELS.find((m) => m.id === model) || MODELS[0]).note} Changes take effect on the next question asked — no redeploy.
                </p>

                {settingsError ? (
                  <p id="settings-error" role="alert" className="ka-in mt-3 flex items-start gap-2 text-[12.5px]" style={{ color: brand.accentColor }}>
                    <AlertCircle className="h-4 w-4 mt-px shrink-0" aria-hidden="true" />
                    {settingsError}
                  </p>
                ) : null}

                <div className="mt-5 flex items-center gap-2">
                  <Button type="button" onClick={saveSettings} className="ka-focus px-3.5 py-2 text-[13px] font-semibold" style={{ backgroundColor: brand.primaryColor, color: brand.backgroundColor, borderRadius: brand.radius, border: "none" }}>
                    Save settings
                  </Button>
                  <button type="button" onClick={() => { setThreshold(0.62); setThresholdText("0.62"); setSettingsError(null); setSettingsOk(false); }} className="ka-focus px-3 py-2 text-[12.5px]" style={{ borderRadius: brand.radius, border: `1px solid ${C.border}`, color: C.muted }}>
                    Reset to 0.62
                  </button>
                  {settingsOk ? (
                    <span className="ka-in inline-flex items-center gap-1.5 text-[12.5px]" style={{ color: brand.primaryColor }}>
                      <CheckCircle className="h-4 w-4" aria-hidden="true" />
                      Saved. In force from the next question.
                    </span>
                  ) : null}
                </div>
                <p role="status" aria-live="polite" className="sr-only">{settingsOk ? "Settings saved" : ""}</p>
              </section>

              {/* Provider / secrets */}
              <section className="p-5 space-y-5" style={{ borderRadius: brand.radius, border: `1px solid ${C.borderSoft}`, backgroundColor: C.surface }}>
                <div>
                  <h2 className="text-[15px] font-semibold" style={{ fontFamily: brand.fontHeading }}>Provider &amp; secrets</h2>
                  <p className="mt-1.5 text-[12.5px]" style={{ color: C.muted }}>Keys are read from the server environment at boot. They never reach the browser and are never written to logs.</p>
                </div>

                <div>
                  <p className="text-[11px] uppercase tracking-[0.12em]" style={{ color: C.muted }}>GROQ_API_KEY</p>
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <code className="px-2.5 py-1.5 text-[12.5px] flex-1" style={{ borderRadius: "0.3rem", backgroundColor: hexA(brand.neutralColor, 0.12), color: C.muted, letterSpacing: "0.18em" }}>••••••••••••••••</code>
                  </div>
                  <p className="mt-2 flex items-center gap-1.5 text-[12.5px]">
                    {conn.state === "checking" ? (
                      <>
                        <Clock className="h-3.5 w-3.5" style={{ color: brand.accentColor }} aria-hidden="true" />
                        <span style={{ color: brand.accentColor }}>Checking the provider…</span>
                      </>
                    ) : conn.state === "connected" ? (
                      <>
                        <CheckCircle className="h-3.5 w-3.5" style={{ color: brand.primaryColor }} aria-hidden="true" />
                        <span style={{ color: brand.primaryColor }}>Connected</span>
                        <span style={{ color: C.muted, fontVariantNumeric: "tabular-nums" }}>· {conn.latency} ms · {conn.at}</span>
                      </>
                    ) : (
                      <>
                        <AlertCircle className="h-3.5 w-3.5" style={{ color: brand.accentColor }} aria-hidden="true" />
                        <span style={{ color: brand.accentColor }}>Unreachable</span>
                      </>
                    )}
                  </p>
                  <button type="button" onClick={testConnection} disabled={conn.state === "checking"} className="ka-focus mt-3 w-full px-3 py-1.5 text-[12.5px]" style={{ borderRadius: "0.35rem", border: `1px solid ${C.border}`, color: C.text, opacity: conn.state === "checking" ? 0.6 : 1 }}>
                    {conn.state === "checking" ? "Testing…" : "Test connection"}
                  </button>
                </div>

                <Separator style={{ borderColor: C.borderSoft }} />

                <div>
                  <p className="text-[11px] uppercase tracking-[0.12em]" style={{ color: C.muted }}>Embeddings</p>
                  <dl className="mt-2 space-y-1.5 text-[12.5px]">
                    <div className="flex justify-between gap-4">
                      <dt style={{ color: C.muted }}>Dimensions</dt>
                      <dd style={{ fontVariantNumeric: "tabular-nums" }}>768</dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt style={{ color: C.muted }}>Batch size</dt>
                      <dd style={{ fontVariantNumeric: "tabular-nums" }}>100 chunks / call</dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt style={{ color: C.muted }}>Provider</dt>
                      <dd style={{ color: brand.accentColor }}>Pending sign-off</dd>
                    </div>
                  </dl>
                  <p className="mt-2.5 px-2.5 py-2 text-[12px]" style={{ borderRadius: "0.35rem", backgroundColor: hexA(brand.accentColor, 0.08), border: `1px solid ${hexA(brand.accentColor, 0.3)}` }}>
                    Groq has no embedding model. A 768-dimension service must be chosen before documents can be re-indexed under a new provider — the setting is replaceable server-side.
                  </p>
                </div>

                <Separator style={{ borderColor: C.borderSoft }} />

                <div>
                  <p className="text-[12.5px]" style={{ color: C.muted }}>
                    Only administrators see this page. Standard users are refused with a 403 and keep access to Chat and the Knowledge Base.
                  </p>
                  <button type="button" onClick={() => navigate("knowledge-base")} className="ka-focus mt-3 inline-flex items-center gap-1 text-[12.5px]" style={{ color: brand.primaryColor, borderRadius: "0.3rem" }}>
                    Open Knowledge Base
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>
              </section>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
