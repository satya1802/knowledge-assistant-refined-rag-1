// @ts-nocheck -- generated from the approved design under its JS runtime contract; not hand-written TypeScript.
/* eslint-disable @typescript-eslint/no-unused-vars */
import React from "react";

import * as UI from "@/lib/ui";
import { Icons } from "@/lib/icons";
import { brand } from "@/lib/brand";
import { useNavigate } from "@/lib/navigate";
import { useAuth } from "@/lib/auth";

const { Button, Input, Label, Checkbox, Badge, Separator } = UI;
const {
  Check,
  ChevronRight,
  ChevronDown,
  Users,
  Settings,
  FileText,
  Clock,
  ArrowLeft,
  ArrowRight,
  AlertCircle,
  CheckCircle,
} = Icons;

// ---------------------------------------------------------------------------
// Colour helpers — every colour on this screen is derived from a brand token.
// ---------------------------------------------------------------------------
const toRgb = (hex) => {
  const h = String(hex).replace("#", "");
  const full =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h;
  const n = parseInt(full, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
};
const toHex = ({ r, g, b }) =>
  "#" +
  [r, g, b]
    .map((v) =>
      Math.max(0, Math.min(255, Math.round(v)))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("");
const mix = (a, b, t) => {
  const A = toRgb(a);
  const B = toRgb(b);
  return toHex({ r: A.r + (B.r - A.r) * t, g: A.g + (B.g - A.g) * t, b: A.b + (B.b - A.b) * t });
};
const lighten = (c, t) => {
  const A = toRgb(c);
  return toHex({ r: A.r + (255 - A.r) * t, g: A.g + (255 - A.g) * t, b: A.b + (255 - A.b) * t });
};
const darken = (c, t) => {
  const A = toRgb(c);
  return toHex({ r: A.r * (1 - t), g: A.g * (1 - t), b: A.b * (1 - t) });
};
const alpha = (c, a) => {
  const { r, g, b } = toRgb(c);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
};

// ---------------------------------------------------------------------------
// Decorative knowledge-base status data for the right-hand rail. No account
// or credential data lives here -- authentication is wired to the real API.
// ---------------------------------------------------------------------------
const INDEX_TILES = [
  { label: "Documents", value: "86", tone: "plain" },
  { label: "Ready", value: "83", tone: "good" },
  { label: "Processing", value: "2", tone: "watch" },
  { label: "Failed", value: "1", tone: "watch" },
];

const ACTIVITY = [
  { t: "09:14", tone: "good", text: "Index refreshed — 12,486 chunks across 83 documents" },
  {
    t: "08:42",
    tone: "good",
    text: "Re-index complete — Field_Service_Manual_v7.pdf · 312 chunks",
  },
  { t: "08:17", tone: "watch", text: "Processing — Q3_Benefits_Summary.docx · 4.2 MB" },
  {
    t: "07:55",
    tone: "watch",
    text: "Failed — Vendor_Contract_Scan.pdf · 11 image-only pages, no text extracted",
  },
  { t: "Sun 21:08", tone: "quiet", text: "Similarity threshold set to 0.62 by m.okafor" },
  { t: "Sun 16:30", tone: "quiet", text: "Deleted — Legacy_Price_List_2019.pdf and its 94 chunks" },
];

const RUNTIME = [
  ["Answer model", "groq · llama-3.3-70b-versatile"],
  ["Embeddings", "768-dim · batches of 100"],
  ["Match threshold", "0.62 cosine"],
  ["Session", "HTTP-only cookie · 14 days"],
];

const MAX_ATTEMPTS = 5;
const LOCK_SECONDS = 900;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Screen() {
  const navigate = useNavigate();
  const { login, bootstrap } = useAuth();
  const bg = brand.backgroundColor;
  const surface = mix(bg, brand.neutralColor, 0.1);
  const surfaceDeep = darken(bg, 0.35);
  const line = mix(bg, brand.neutralColor, 0.26);
  const lineSoft = mix(bg, brand.neutralColor, 0.16);
  const textHi = lighten(brand.neutralColor, 0.8);
  const text = brand.neutralColor;
  const textDim = mix(brand.neutralColor, bg, 0.38);
  const onPrimary = darken(bg, 0.2);
  const r = brand.radius;

  const [mode, setMode] = React.useState("signin"); // signin | bootstrap
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [stayIn, setStayIn] = React.useState(true);
  const [fieldErrors, setFieldErrors] = React.useState({});
  const [formError, setFormError] = React.useState(false);
  const [status, setStatus] = React.useState("idle"); // idle | checking | success | denied
  const [attempts, setAttempts] = React.useState(0);
  const [lockSeconds, setLockSeconds] = React.useState(0);
  const [lockedEmail, setLockedEmail] = React.useState("");
  const [helpOpen, setHelpOpen] = React.useState(false);
  const [snapshot, setSnapshot] = React.useState({ stale: true, label: "4m 12s ago", busy: false });

  const landTimer = React.useRef(null);
  const snapTimer = React.useRef(null);

  React.useEffect(
    () => () => {
      clearTimeout(landTimer.current);
      clearTimeout(snapTimer.current);
    },
    [],
  );

  // Lockout countdown — cleared with the screen, never outlives it.
  React.useEffect(() => {
    if (lockSeconds <= 0) return undefined;
    const id = setTimeout(() => {
      if (lockSeconds === 1) {
        setAttempts(0);
        setLockedEmail("");
        setFormError(false);
      }
      setLockSeconds(lockSeconds - 1);
    }, 1000);
    return () => clearTimeout(id);
  }, [lockSeconds]);

  const normalized = email.trim().toLowerCase();
  const isLocked = lockSeconds > 0 && lockedEmail === normalized;
  const busy = status === "checking";
  const landed = status === "success";
  const clock = `${Math.floor(lockSeconds / 60)}:${String(lockSeconds % 60).padStart(2, "0")}`;

  const refreshSnapshot = () => {
    setSnapshot((s) => ({ ...s, busy: true }));
    clearTimeout(snapTimer.current);
    snapTimer.current = setTimeout(() => {
      setSnapshot({ stale: false, label: "just now", busy: false });
    }, 700);
  };

  const switchMode = (next) => {
    setMode(next);
    setStatus("idle");
    setFormError(false);
    setFieldErrors({});
    setConfirm("");
  };

  const submit = async (event) => {
    event.preventDefault();
    if (busy || landed) return;

    const next = {};
    if (!email.trim()) next.email = "Enter your work email.";
    else if (!EMAIL_RE.test(email.trim())) next.email = "That is not a valid email address.";
    if (!password) next.password = "Enter your password.";
    else if (mode === "bootstrap" && password.length < 10)
      next.password = "An administrator password needs at least 10 characters.";
    if (mode === "bootstrap" && confirm !== password)
      next.confirm = "The two passwords do not match.";

    setFieldErrors(next);
    if (Object.keys(next).length > 0) {
      setFormError(false);
      return;
    }

    setFormError(false);
    setStatus("checking");

    if (mode === "bootstrap") {
      const result = await bootstrap(normalized, password);
      if (result.ok) {
        setPassword("");
        switchMode("signin");
        setEmail(normalized);
        return;
      }
      if (result.alreadyExists) {
        setStatus("denied");
        return;
      }
      setStatus("idle");
      setFormError(true);
      return;
    }

    if (lockSeconds > 0 && lockedEmail === normalized) {
      setStatus("idle");
      setFormError(true);
      return;
    }

    const result = await login(normalized, password);
    if (result.ok) {
      setAttempts(0);
      setStatus("success");
      landTimer.current = setTimeout(() => navigate("chat"), 1100);
      return;
    }
    const count = attempts + 1;
    setAttempts(count);
    if (count >= MAX_ATTEMPTS) {
      setLockSeconds(LOCK_SECONDS);
      setLockedEmail(normalized);
    }
    setStatus("idle");
    setFormError(true);
  };

  const toneColor = (tone) =>
    tone === "good" ? brand.primaryColor : tone === "watch" ? brand.accentColor : textDim;

  const fieldStyle = (invalid) => ({
    backgroundColor: surfaceDeep,
    borderColor: invalid ? brand.accentColor : line,
    color: textHi,
    borderRadius: r,
    fontVariantNumeric: "tabular-nums",
  });

  const describedBy = [formError ? "auth-error" : null, isLocked ? "auth-lock" : null]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className="ka-root min-h-full w-full"
      style={{
        backgroundColor: bg,
        color: textHi,
        fontFamily: brand.fontBody,
        "--ka-accent": brand.accentColor,
        "--ka-dim": textDim,
      }}
    >
      <style>{`
        .ka-root ::placeholder { color: var(--ka-dim); opacity: 1; }
        .ka-focus:focus-visible { outline: 2px solid var(--ka-accent); outline-offset: 2px; border-radius: 4px; }
        .ka-root button:focus-visible, .ka-root input:focus-visible, .ka-root a:focus-visible {
          outline: 2px solid var(--ka-accent); outline-offset: 2px;
        }
        @keyframes ka-rise { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
        @keyframes ka-spin { to { transform: rotate(360deg); } }
        @keyframes ka-breathe { 0%,100% { opacity: 1; } 50% { opacity: .35; } }
        .ka-rise { animation: ka-rise .28s ease-out both; }
        .ka-spin { animation: ka-spin .9s linear infinite; }
        .ka-breathe { animation: ka-breathe 2.4s ease-in-out infinite; }
        .ka-grow { transition: background-color .18s ease, border-color .18s ease, color .18s ease, transform .18s ease; }
        .ka-grow:active { transform: translateY(1px); }
        @media (prefers-reduced-motion: reduce) {
          .ka-root *, .ka-root *::before, .ka-root *::after {
            animation: none !important; transition: none !important;
          }
        }
      `}</style>

      <div className="mx-auto w-full max-w-5xl px-5 py-10 sm:px-8 lg:py-16">
        <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,440px)_minmax(0,1fr)] lg:gap-14">
          {/* ------------------------------------------------------------ */}
          {/* Focal column: credentials                                     */}
          {/* ------------------------------------------------------------ */}
          <section
            className="ka-rise rounded-lg border p-6 sm:p-8"
            style={{ backgroundColor: surface, borderColor: line, borderRadius: r }}
          >
            <p
              className="text-[11px] font-semibold uppercase tracking-[0.18em]"
              style={{ color: brand.primaryColor }}
            >
              Knowledge Assistant
            </p>
            <h1
              className="mt-2 text-[26px] font-semibold leading-tight tracking-tight sm:text-[28px]"
              style={{ fontFamily: brand.fontHeading, color: textHi }}
            >
              {mode === "bootstrap" ? "Create the administrator" : "Sign in to the console"}
            </h1>
            <p className="mt-2 text-[13px] leading-relaxed" style={{ color: text }}>
              {mode === "bootstrap"
                ? "The first account on a fresh install becomes the administrator and can upload documents."
                : "Accounts are provisioned by your administrator. Your chat history is private to you and is restored on every sign-in."}
            </p>

            {status === "denied" ? (
              <div
                className="ka-rise mt-6 rounded-lg border p-4"
                style={{
                  borderColor: alpha(brand.accentColor, 0.5),
                  backgroundColor: alpha(brand.accentColor, 0.09),
                  borderRadius: r,
                }}
                role="alert"
              >
                <div className="flex gap-3">
                  <AlertCircle
                    className="mt-0.5 h-4 w-4 shrink-0"
                    style={{ color: brand.accentColor }}
                    aria-hidden="true"
                  />
                  <div>
                    <h2 className="text-[13px] font-semibold" style={{ color: textHi }}>
                      This installation already has an administrator
                    </h2>
                    <p className="mt-1.5 text-[12.5px] leading-relaxed" style={{ color: text }}>
                      Only the first account created becomes an administrator, and that has already
                      happened here. Ask your administrator to create your account on Users &amp;
                      Settings — they will issue a temporary password and pass it to you directly.
                    </p>
                    <Button
                      type="button"
                      onClick={() => switchMode("signin")}
                      className="ka-grow mt-3 inline-flex items-center gap-1.5 border px-3 py-1.5 text-[12px] font-medium"
                      style={{
                        backgroundColor: "transparent",
                        borderColor: line,
                        color: textHi,
                        borderRadius: r,
                      }}
                    >
                      <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                      Back to sign in
                    </Button>
                  </div>
                </div>
              </div>
            ) : null}

            {formError && status !== "denied" ? (
              <div
                id="auth-error"
                role="alert"
                className="ka-rise mt-6 flex gap-3 rounded-lg border p-3.5"
                style={{
                  borderColor: alpha(brand.accentColor, 0.5),
                  backgroundColor: alpha(brand.accentColor, 0.09),
                  borderRadius: r,
                }}
              >
                <AlertCircle
                  className="mt-0.5 h-4 w-4 shrink-0"
                  style={{ color: brand.accentColor }}
                  aria-hidden="true"
                />
                <div>
                  <p className="text-[13px] font-medium" style={{ color: textHi }}>
                    Email or password is incorrect
                  </p>
                  <p className="mt-1 text-[12px] leading-relaxed" style={{ color: text }}>
                    Nothing you typed was lost — correct it and try again.
                    {!isLocked && attempts >= 3
                      ? ` ${MAX_ATTEMPTS - attempts} attempt${
                          MAX_ATTEMPTS - attempts === 1 ? "" : "s"
                        } left before this address is locked for 15 minutes.`
                      : ""}
                  </p>
                </div>
              </div>
            ) : null}

            {isLocked ? (
              <div
                id="auth-lock"
                className="ka-rise mt-3 flex items-center gap-3 rounded-lg border px-3.5 py-3"
                style={{ borderColor: lineSoft, backgroundColor: surfaceDeep, borderRadius: r }}
              >
                <Clock
                  className="h-4 w-4 shrink-0"
                  style={{ color: brand.accentColor }}
                  aria-hidden="true"
                />
                <p className="text-[12px] leading-relaxed" style={{ color: text }}>
                  Sign-in attempts for this address are paused.{" "}
                  <span
                    className="font-semibold"
                    style={{ color: textHi, fontVariantNumeric: "tabular-nums" }}
                  >
                    {clock}
                  </span>{" "}
                  remaining.
                </p>
              </div>
            ) : null}

            {landed ? (
              <div
                className="ka-rise mt-6 flex items-center gap-3 rounded-lg border p-3.5"
                role="status"
                style={{
                  borderColor: alpha(brand.primaryColor, 0.5),
                  backgroundColor: alpha(brand.primaryColor, 0.1),
                  borderRadius: r,
                }}
              >
                <CheckCircle
                  className="h-4 w-4 shrink-0"
                  style={{ color: brand.primaryColor }}
                  aria-hidden="true"
                />
                <p className="text-[12.5px]" style={{ color: textHi }}>
                  Session established. Restoring your conversations and opening Chat…
                </p>
              </div>
            ) : null}

            <form className="mt-6 space-y-5" onSubmit={submit} noValidate>
              <div>
                <Label
                  htmlFor="email"
                  className="mb-1.5 block text-[12px] font-medium"
                  style={{ color: text }}
                >
                  Work email
                </Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="username"
                  spellCheck={false}
                  placeholder="you@northbay.example"
                  value={email}
                  disabled={busy || landed}
                  aria-invalid={fieldErrors.email || formError ? true : undefined}
                  aria-describedby={
                    [fieldErrors.email ? "email-hint" : null, describedBy || null]
                      .filter(Boolean)
                      .join(" ") || undefined
                  }
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (fieldErrors.email) setFieldErrors((f) => ({ ...f, email: undefined }));
                  }}
                  className="w-full border px-3 py-2 text-[13.5px] outline-none"
                  style={fieldStyle(!!fieldErrors.email)}
                />
                {fieldErrors.email ? (
                  <p
                    id="email-hint"
                    className="mt-1.5 text-[11.5px]"
                    style={{ color: brand.accentColor }}
                  >
                    {fieldErrors.email}
                  </p>
                ) : null}
              </div>

              <div>
                <div className="mb-1.5 flex items-baseline justify-between gap-3">
                  <Label
                    htmlFor="password"
                    className="text-[12px] font-medium"
                    style={{ color: text }}
                  >
                    {mode === "bootstrap" ? "Administrator password" : "Password"}
                  </Label>
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-pressed={showPassword}
                    aria-controls="password"
                    className="ka-focus text-[11.5px] font-medium"
                    style={{ color: brand.primaryColor }}
                  >
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </div>
                <Input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete={mode === "bootstrap" ? "new-password" : "current-password"}
                  placeholder={mode === "bootstrap" ? "At least 10 characters" : "••••••••••"}
                  value={password}
                  disabled={busy || landed}
                  aria-invalid={fieldErrors.password || formError ? true : undefined}
                  aria-describedby={
                    [fieldErrors.password ? "password-hint" : null, describedBy || null]
                      .filter(Boolean)
                      .join(" ") || undefined
                  }
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (fieldErrors.password)
                      setFieldErrors((f) => ({ ...f, password: undefined }));
                  }}
                  className="w-full border px-3 py-2 text-[13.5px] outline-none"
                  style={fieldStyle(!!fieldErrors.password)}
                />
                {fieldErrors.password ? (
                  <p
                    id="password-hint"
                    className="mt-1.5 text-[11.5px]"
                    style={{ color: brand.accentColor }}
                  >
                    {fieldErrors.password}
                  </p>
                ) : null}
              </div>

              {mode === "bootstrap" ? (
                <div className="ka-rise">
                  <Label
                    htmlFor="confirm"
                    className="mb-1.5 block text-[12px] font-medium"
                    style={{ color: text }}
                  >
                    Confirm password
                  </Label>
                  <Input
                    id="confirm"
                    name="confirm"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    placeholder="Type it once more"
                    value={confirm}
                    disabled={busy}
                    aria-invalid={fieldErrors.confirm ? true : undefined}
                    aria-describedby={fieldErrors.confirm ? "confirm-hint" : undefined}
                    onChange={(e) => {
                      setConfirm(e.target.value);
                      if (fieldErrors.confirm)
                        setFieldErrors((f) => ({ ...f, confirm: undefined }));
                    }}
                    className="w-full border px-3 py-2 text-[13.5px] outline-none"
                    style={fieldStyle(!!fieldErrors.confirm)}
                  />
                  {fieldErrors.confirm ? (
                    <p
                      id="confirm-hint"
                      className="mt-1.5 text-[11.5px]"
                      style={{ color: brand.accentColor }}
                    >
                      {fieldErrors.confirm}
                    </p>
                  ) : null}
                </div>
              ) : (
                <div className="flex items-center gap-2.5">
                  <Checkbox
                    id="stay"
                    checked={stayIn}
                    disabled={busy || landed}
                    onChange={(e) => setStayIn(e && e.target ? e.target.checked : !stayIn)}
                    onCheckedChange={(v) => setStayIn(typeof v === "boolean" ? v : !stayIn)}
                    style={{ accentColor: brand.primaryColor }}
                  />
                  <Label htmlFor="stay" className="text-[12.5px]" style={{ color: text }}>
                    Keep this session for 14 days
                  </Label>
                </div>
              )}

              <Button
                type="submit"
                disabled={busy || landed}
                aria-busy={busy}
                className="ka-grow flex w-full items-center justify-center gap-2 px-4 py-2.5 text-[13.5px] font-semibold"
                style={{
                  backgroundColor: landed ? mix(brand.primaryColor, bg, 0.25) : brand.primaryColor,
                  color: onPrimary,
                  borderRadius: r,
                  opacity: busy ? 0.78 : 1,
                  cursor: busy || landed ? "default" : "pointer",
                }}
              >
                {busy ? (
                  <>
                    <span
                      className="ka-spin inline-block h-3.5 w-3.5 rounded-full border-2"
                      style={{ borderColor: alpha(onPrimary, 0.3), borderTopColor: onPrimary }}
                      aria-hidden="true"
                    />
                    Checking credentials…
                  </>
                ) : landed ? (
                  <>
                    <Check className="h-4 w-4" aria-hidden="true" />
                    Opening Chat
                  </>
                ) : mode === "bootstrap" ? (
                  <>
                    Create administrator
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </>
                ) : (
                  <>
                    Sign in
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </>
                )}
              </Button>
            </form>

            <Separator
              className="my-5"
              style={{ backgroundColor: lineSoft, borderColor: lineSoft }}
            />

            <div className="space-y-3">
              <button
                type="button"
                onClick={() => setHelpOpen((v) => !v)}
                aria-expanded={helpOpen}
                aria-controls="forgot-help"
                className="ka-focus flex w-full items-center justify-between text-left text-[12.5px] font-medium"
                style={{ color: textHi }}
              >
                Forgot your password?
                <ChevronDown
                  className="h-4 w-4"
                  style={{
                    color: text,
                    transform: helpOpen ? "rotate(180deg)" : "none",
                    transition: "transform .18s ease",
                  }}
                  aria-hidden="true"
                />
              </button>
              {helpOpen ? (
                <p
                  id="forgot-help"
                  className="ka-rise rounded-lg border px-3.5 py-3 text-[12px] leading-relaxed"
                  style={{
                    borderColor: lineSoft,
                    backgroundColor: surfaceDeep,
                    color: text,
                    borderRadius: r,
                  }}
                >
                  Knowledge Assistant sends no email. Ask an administrator to issue a temporary
                  password from Users &amp; Settings — it is shown to them once, and you can change
                  it on your Account page after signing in.
                </p>
              ) : null}

              {mode === "signin" ? (
                <button
                  type="button"
                  onClick={() => switchMode("bootstrap")}
                  className="ka-focus text-left text-[12.5px]"
                  style={{ color: text }}
                >
                  First install?{" "}
                  <span style={{ color: brand.primaryColor }}>
                    Create the administrator account
                  </span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => switchMode("signin")}
                  className="ka-focus flex items-center gap-1.5 text-left text-[12.5px]"
                  style={{ color: brand.primaryColor }}
                >
                  <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                  Back to sign in
                </button>
              )}
            </div>
          </section>

          {/* ------------------------------------------------------------ */}
          {/* Secondary column: knowledge base status rail                  */}
          {/* ------------------------------------------------------------ */}
          <section className="space-y-7" aria-labelledby="status-heading">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2
                id="status-heading"
                className="text-[12px] font-semibold uppercase tracking-[0.16em]"
                style={{ color: text, fontFamily: brand.fontHeading }}
              >
                Knowledge base status
              </h2>
              <div className="flex items-center gap-2.5">
                <span
                  className="flex items-center gap-1.5 text-[11.5px]"
                  style={{ color: snapshot.stale ? brand.accentColor : text }}
                >
                  <span
                    className={snapshot.busy ? "ka-breathe" : ""}
                    style={{
                      display: "inline-block",
                      width: 6,
                      height: 6,
                      borderRadius: 999,
                      backgroundColor: snapshot.stale ? brand.accentColor : brand.primaryColor,
                    }}
                    aria-hidden="true"
                  />
                  {snapshot.busy ? "Reading…" : `Snapshot ${snapshot.label}`}
                </span>
                <Button
                  type="button"
                  onClick={refreshSnapshot}
                  disabled={snapshot.busy}
                  className="ka-grow border px-2.5 py-1 text-[11.5px] font-medium"
                  style={{
                    backgroundColor: "transparent",
                    borderColor: line,
                    color: textHi,
                    borderRadius: r,
                  }}
                >
                  Refresh
                </Button>
              </div>
            </div>

            <dl
              className="grid grid-cols-2 gap-px overflow-hidden sm:grid-cols-4"
              style={{
                backgroundColor: lineSoft,
                borderRadius: r,
                border: `1px solid ${lineSoft}`,
              }}
            >
              {INDEX_TILES.map((tile) => (
                <div
                  key={tile.label}
                  className="px-3.5 py-3.5"
                  style={{ backgroundColor: surface }}
                >
                  <dt className="text-[11px] uppercase tracking-[0.1em]" style={{ color: textDim }}>
                    {tile.label}
                  </dt>
                  <dd
                    className="mt-1.5 text-[22px] font-semibold leading-none"
                    style={{
                      color:
                        tile.tone === "good"
                          ? brand.primaryColor
                          : tile.tone === "watch"
                            ? brand.accentColor
                            : textHi,
                      fontVariantNumeric: "tabular-nums",
                      fontFamily: brand.fontHeading,
                    }}
                  >
                    {tile.value}
                  </dd>
                </div>
              ))}
            </dl>

            <div>
              <h3
                className="text-[12px] font-semibold uppercase tracking-[0.16em]"
                style={{ color: text }}
              >
                Recent index activity
              </h3>
              <ul className="mt-3 space-y-0">
                {ACTIVITY.map((row, i) => (
                  <li
                    key={row.t + row.text}
                    className="flex items-start gap-3 py-2.5"
                    style={{ borderTop: i === 0 ? "none" : `1px solid ${lineSoft}` }}
                  >
                    {row.tone === "good" ? (
                      <CheckCircle
                        className="mt-0.5 h-3.5 w-3.5 shrink-0"
                        style={{ color: brand.primaryColor }}
                        aria-hidden="true"
                      />
                    ) : row.tone === "watch" ? (
                      <AlertCircle
                        className="mt-0.5 h-3.5 w-3.5 shrink-0"
                        style={{ color: brand.accentColor }}
                        aria-hidden="true"
                      />
                    ) : (
                      <Clock
                        className="mt-0.5 h-3.5 w-3.5 shrink-0"
                        style={{ color: textDim }}
                        aria-hidden="true"
                      />
                    )}
                    <span
                      className="w-[58px] shrink-0 text-[11.5px]"
                      style={{ color: textDim, fontVariantNumeric: "tabular-nums" }}
                    >
                      {row.t}
                    </span>
                    <span
                      className="text-[12.5px] leading-snug"
                      style={{ color: toneColor(row.tone) === textDim ? text : textHi }}
                    >
                      {row.text}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h3
                className="text-[12px] font-semibold uppercase tracking-[0.16em]"
                style={{ color: text }}
              >
                Retrieval runtime
              </h3>
              <dl className="mt-3 space-y-2">
                {RUNTIME.map(([k, v]) => (
                  <div key={k} className="flex items-baseline justify-between gap-4">
                    <dt className="text-[12px]" style={{ color: textDim }}>
                      {k}
                    </dt>
                    <dd
                      className="text-[12px]"
                      style={{ color: textHi, fontVariantNumeric: "tabular-nums" }}
                    >
                      {v}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>

            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-1 text-[12px]">
              <button
                type="button"
                onClick={() => navigate("docs")}
                className="ka-focus inline-flex items-center gap-1.5"
                style={{ color: brand.primaryColor }}
              >
                <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                Getting started
              </button>
              <button
                type="button"
                onClick={() => navigate("docs")}
                className="ka-focus inline-flex items-center gap-1.5"
                style={{ color: brand.primaryColor }}
              >
                <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                API reference
              </button>
              <span style={{ color: textDim }}>Internal tool · no public sign-up</span>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
