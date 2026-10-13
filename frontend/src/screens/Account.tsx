// @ts-nocheck -- generated from the approved design under its JS runtime contract; not hand-written TypeScript.
/* eslint-disable @typescript-eslint/no-unused-vars */
import React from "react";

import * as UI from "@/lib/ui";
import { Icons } from "@/lib/icons";
import { brand } from "@/lib/brand";
import { useNavigate } from "@/lib/navigate";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";

const rgbOf = (hex) => {
  const h = String(hex || "").replace("#", "");
  const n =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h;
  return [
    parseInt(n.slice(0, 2), 16) || 0,
    parseInt(n.slice(2, 4), 16) || 0,
    parseInt(n.slice(4, 6), 16) || 0,
  ];
};

const mix = (hex, amount, toward) => {
  const target = toward === undefined ? 255 : toward;
  const [r, g, b] = rgbOf(hex);
  const f = (c) => Math.round(c + (target - c) * amount);
  return `rgb(${f(r)}, ${f(g)}, ${f(b)})`;
};

const alpha = (hex, a) => {
  const [r, g, b] = rgbOf(hex);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
};

const tokensFor = (mode) =>
  mode === "light"
    ? {
        bg: mix(brand.neutralColor, 0.93),
        surface: mix(brand.neutralColor, 1),
        field: mix(brand.neutralColor, 0.96),
        border: mix(brand.neutralColor, 0.6),
        strongBorder: mix(brand.neutralColor, 0.4),
        text: mix(brand.backgroundColor, 0.04),
        dim: mix(brand.neutralColor, 0.3, 0),
      }
    : {
        bg: brand.backgroundColor,
        surface: mix(brand.backgroundColor, 0.055),
        field: mix(brand.backgroundColor, 0.025),
        border: mix(brand.backgroundColor, 0.15),
        strongBorder: mix(brand.backgroundColor, 0.26),
        text: mix(brand.neutralColor, 0.84),
        dim: brand.neutralColor,
      };

const THEMES = [
  { id: "light", label: "Light", hint: "Bright rooms, shared screens" },
  { id: "dark", label: "Dark", hint: "The console default" },
  { id: "system", label: "System", hint: "Follows your OS appearance" },
];

const ACCESS_ROWS = [
  {
    id: "kb",
    area: "Knowledge Base",
    detail: "View and download documents",
    note: "Upload, retry, re-index and delete are administrator-only.",
    level: "view",
    route: "knowledge-base",
  },
  {
    id: "users",
    area: "Users & Settings",
    detail: "Provision accounts, issue temporary passwords",
    note: "Not available to your role.",
    level: "none",
    route: "users",
  },
  {
    id: "threshold",
    area: "Retrieval threshold",
    detail: "Similarity cut-off, held at 0.62",
    note: "Not available to your role.",
    level: "none",
    route: "users",
  },
];

export default function Screen() {
  const navigate = useNavigate();
  const { Button, Input, Label, Table, THead, TBody, TR, TH, TD } = UI;
  const { Check, X, AlertCircle, CheckCircle, ArrowRight } = Icons;

  const { user, logout } = useAuth();
  const { theme, effectiveTheme, systemPrefersDark, setTheme } = useTheme();
  const [themeStatus, setThemeStatus] = React.useState("idle"); // idle | saving | saved | error
  const [themeError, setThemeError] = React.useState("");
  const [syncedAt, setSyncedAt] = React.useState("");

  const [currentPw, setCurrentPw] = React.useState("");
  const [newPw, setNewPw] = React.useState("");
  const [confirmPw, setConfirmPw] = React.useState("");
  const [showCurrent, setShowCurrent] = React.useState(false);
  const [showNew, setShowNew] = React.useState(false);
  const [formState, setFormState] = React.useState("idle"); // idle | submitting | error | success
  const [formError, setFormError] = React.useState("");

  const t = tokensFor(effectiveTheme);
  const onPrimary = brand.backgroundColor;

  const clockNow = () => {
    try {
      return new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    } catch (e) {
      return "—:—";
    }
  };

  React.useEffect(() => {
    setSyncedAt(clockNow());
  }, []);

  const requirements = [
    { id: "len", label: "At least 12 characters", ok: newPw.length >= 12 },
    { id: "num", label: "Contains a number", ok: /\d/.test(newPw) },
    {
      id: "diff",
      label: "Different from your current password",
      ok: newPw.length > 0 && newPw !== currentPw,
    },
  ];
  const allMet = requirements.every((r) => r.ok);

  const chooseTheme = async (id) => {
    if (id === theme) return;
    setThemeStatus("saving");
    setThemeError("");
    const result = await setTheme(id);
    if (result.ok) {
      setThemeStatus("saved");
      setSyncedAt(clockNow());
    } else {
      setThemeStatus("error");
      setThemeError(result.error);
    }
  };

  const submitPassword = async (e) => {
    e.preventDefault();
    if (formState === "submitting") return;
    setFormState("idle");
    setFormError("");

    if (!currentPw) {
      setFormState("error");
      setFormError("Enter your current password so we know it is you.");
      return;
    }
    if (!allMet) {
      setFormState("error");
      setFormError("Your new password does not meet all three rules yet.");
      return;
    }
    if (newPw !== confirmPw) {
      setFormState("error");
      setFormError("The two new passwords do not match. Retype the confirmation.");
      return;
    }

    setFormState("submitting");
    try {
      await apiFetch("/account/password", {
        method: "POST",
        body: JSON.stringify({ current_password: currentPw, new_password: newPw }),
      });
      setFormState("success");
      setCurrentPw("");
      setNewPw("");
      setConfirmPw("");
      setShowCurrent(false);
      setShowNew(false);
    } catch (err) {
      setFormState("error");
      if (err instanceof ApiError && (err.status === 401 || err.status === 400)) {
        setFormError(
          "That current password is not right. Nothing was changed — your new password is still in the boxes.",
        );
      } else {
        setFormError("Something went wrong updating your password. Try again.");
      }
    }
  };

  const toneColor = (tone) =>
    tone === "ok" ? brand.primaryColor : tone === "warn" ? brand.accentColor : t.dim;

  const panel = {
    backgroundColor: t.surface,
    borderColor: t.border,
    borderRadius: brand.radius,
    transition: "background-color .25s ease, border-color .25s ease",
  };
  const fieldStyle = {
    backgroundColor: t.field,
    borderColor: t.strongBorder,
    color: t.text,
    borderRadius: brand.radius,
  };
  const labelCls = "text-xs font-medium tracking-wide";
  const sectionHeadCls = "text-[11px] font-semibold uppercase tracking-[0.16em]";

  const initials = (user?.email || "?").slice(0, 2).toUpperCase();
  const roleLabel = user?.role
    ? user.role.charAt(0).toUpperCase() + user.role.slice(1)
    : "Member";

  const handleSignOut = async () => {
    await logout();
    navigate("sign-in");
  };

  return (
    <div
      className="min-h-full px-5 py-6 lg:px-8"
      style={{
        backgroundColor: t.bg,
        color: t.text,
        fontFamily: brand.fontBody,
        ["--ka-ring"]: brand.primaryColor,
        transition: "background-color .3s ease, color .3s ease",
      }}
    >
      <style>{`
        .ka-focus:focus-visible { outline: 2px solid var(--ka-ring); outline-offset: 2px; }
        .ka-radio:focus-visible + .ka-radio-box { outline: 2px solid var(--ka-ring); outline-offset: 2px; }
        @keyframes ka-fade-in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
        @keyframes ka-pulse { 0%, 100% { opacity: .3; } 50% { opacity: 1; } }
        .ka-fade-in { animation: ka-fade-in .28s ease-out both; }
        .ka-pulse { animation: ka-pulse 1.3s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .ka-fade-in, .ka-pulse { animation: none !important; }
          * { transition: none !important; }
        }
      `}</style>

      <div className="mx-auto max-w-5xl space-y-5">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1
              className="text-2xl font-semibold tracking-tight"
              style={{ fontFamily: brand.fontHeading }}
            >
              Account
            </h1>
            <p className="mt-1 max-w-xl text-sm" style={{ color: t.dim }}>
              Your sign-in password and how Knowledge Assistant looks when you open it. Both are
              stored against your user record, not this browser.
            </p>
          </div>
          <div
            role="status"
            aria-live="polite"
            className="flex items-center gap-2 border px-3 py-1.5 text-xs"
            style={{ ...panel, backgroundColor: t.field, borderRadius: "999px", color: t.dim }}
          >
            <span
              aria-hidden="true"
              className={
                "inline-block h-1.5 w-1.5 rounded-full " +
                (themeStatus === "saving" ? "ka-pulse" : "")
              }
              style={{
                backgroundColor:
                  themeStatus === "error"
                    ? brand.accentColor
                    : themeStatus === "saving"
                      ? brand.accentColor
                      : brand.primaryColor,
              }}
            />
            {themeStatus === "saving"
              ? "Saving preferences…"
              : themeStatus === "error"
                ? themeError || "Could not save your theme"
                : "Preferences synced · " + syncedAt}
          </div>
        </header>

        <section
          className="flex flex-wrap items-center gap-4 border px-4 py-3"
          style={panel}
          aria-label="Signed-in user"
        >
          <span
            aria-hidden="true"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold"
            style={{ backgroundColor: alpha(brand.primaryColor, 0.16), color: brand.primaryColor }}
          >
            {initials}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate text-sm font-semibold">{user?.email}</p>
              <span
                className="rounded-full border px-2 py-0.5 text-[11px] font-medium"
                style={{ borderColor: t.strongBorder, color: t.dim }}
              >
                {roleLabel}
              </span>
            </div>
            <p className="truncate text-xs" style={{ color: t.dim }}>
              Signed in with this account
            </p>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-3">
            <Button
              type="button"
              onClick={handleSignOut}
              className="ka-focus border px-3 py-1.5 text-xs font-medium"
              style={{
                backgroundColor: "transparent",
                color: t.text,
                borderColor: t.strongBorder,
                borderRadius: brand.radius,
              }}
            >
              Sign out
            </Button>
          </div>
        </section>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
          {/* Focal: password change */}
          <section className="border p-5 lg:col-span-3" style={panel} aria-labelledby="pw-heading">
            <h2
              id="pw-heading"
              className="text-lg font-semibold tracking-tight"
              style={{ fontFamily: brand.fontHeading }}
            >
              Change password
            </h2>
            <p className="mt-1 text-sm" style={{ color: t.dim }}>
              Replace the temporary password your administrator issued. It is stored as a bcrypt
              hash — the plaintext is never saved, returned or logged.
            </p>

            <form className="mt-5 space-y-4" onSubmit={submitPassword} noValidate>
              <div>
                <Label htmlFor="current-password" className={labelCls} style={{ color: t.dim }}>
                  Current password
                </Label>
                <div className="relative mt-1.5">
                  <Input
                    id="current-password"
                    name="current_password"
                    type={showCurrent ? "text" : "password"}
                    autoComplete="current-password"
                    value={currentPw}
                    onChange={(e) => setCurrentPw(e.target.value)}
                    className="ka-focus w-full border px-3 py-2 pr-16 text-sm"
                    style={fieldStyle}
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrent((v) => !v)}
                    aria-pressed={showCurrent}
                    aria-label={showCurrent ? "Hide current password" : "Show current password"}
                    className="ka-focus absolute right-2 top-1/2 -translate-y-1/2 rounded px-2 py-1 text-[11px] font-medium"
                    style={{ color: brand.primaryColor }}
                  >
                    {showCurrent ? "Hide" : "Show"}
                  </button>
                </div>
              </div>

              <div>
                <Label htmlFor="new-password" className={labelCls} style={{ color: t.dim }}>
                  New password
                </Label>
                <div className="relative mt-1.5">
                  <Input
                    id="new-password"
                    name="new_password"
                    type={showNew ? "text" : "password"}
                    autoComplete="new-password"
                    value={newPw}
                    onChange={(e) => setNewPw(e.target.value)}
                    aria-describedby="pw-rules"
                    className="ka-focus w-full border px-3 py-2 pr-16 text-sm"
                    style={fieldStyle}
                  />
                  <button
                    type="button"
                    onClick={() => setShowNew((v) => !v)}
                    aria-pressed={showNew}
                    aria-label={showNew ? "Hide new password" : "Show new password"}
                    className="ka-focus absolute right-2 top-1/2 -translate-y-1/2 rounded px-2 py-1 text-[11px] font-medium"
                    style={{ color: brand.primaryColor }}
                  >
                    {showNew ? "Hide" : "Show"}
                  </button>
                </div>
                <ul id="pw-rules" className="mt-2.5 space-y-1.5">
                  {requirements.map((r) => (
                    <li key={r.id} className="flex items-center gap-2 text-xs">
                      <span
                        aria-hidden="true"
                        className="flex h-4 w-4 items-center justify-center rounded-full border"
                        style={{
                          borderColor: r.ok ? brand.primaryColor : t.strongBorder,
                          backgroundColor: r.ok ? alpha(brand.primaryColor, 0.16) : "transparent",
                          color: r.ok ? brand.primaryColor : t.dim,
                        }}
                      >
                        {r.ok ? <Check className="h-2.5 w-2.5" /> : <X className="h-2.5 w-2.5" />}
                      </span>
                      <span style={{ color: r.ok ? t.text : t.dim }}>{r.label}</span>
                      <span className="sr-only">{r.ok ? "— met" : "— not met yet"}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <Label htmlFor="confirm-password" className={labelCls} style={{ color: t.dim }}>
                  Confirm new password
                </Label>
                <Input
                  id="confirm-password"
                  name="confirm_password"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPw}
                  onChange={(e) => setConfirmPw(e.target.value)}
                  className="ka-focus mt-1.5 w-full border px-3 py-2 text-sm"
                  style={fieldStyle}
                />
              </div>

              {formState === "error" && (
                <div
                  role="alert"
                  className="ka-fade-in flex gap-2.5 border px-3 py-2.5 text-xs"
                  style={{
                    borderColor: alpha(brand.accentColor, 0.55),
                    backgroundColor: alpha(brand.accentColor, 0.1),
                    borderRadius: brand.radius,
                  }}
                >
                  <AlertCircle
                    className="mt-0.5 h-4 w-4 shrink-0"
                    style={{ color: brand.accentColor }}
                    aria-hidden="true"
                  />
                  <div>
                    <p className="font-semibold" style={{ color: brand.accentColor }}>
                      Password not changed
                    </p>
                    <p className="mt-0.5" style={{ color: t.text }}>
                      {formError}
                    </p>
                  </div>
                </div>
              )}

              {formState === "success" && (
                <div
                  role="status"
                  className="ka-fade-in flex gap-2.5 border px-3 py-2.5 text-xs"
                  style={{
                    borderColor: alpha(brand.primaryColor, 0.55),
                    backgroundColor: alpha(brand.primaryColor, 0.1),
                    borderRadius: brand.radius,
                  }}
                >
                  <CheckCircle
                    className="mt-0.5 h-4 w-4 shrink-0"
                    style={{ color: brand.primaryColor }}
                    aria-hidden="true"
                  />
                  <div>
                    <p className="font-semibold" style={{ color: brand.primaryColor }}>
                      Password updated
                    </p>
                    <p className="mt-0.5" style={{ color: t.text }}>
                      Your current session stays signed in. Use the new password the next time you
                      sign in — the old one no longer works anywhere.
                    </p>
                  </div>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-3 pt-1">
                <Button
                  type="submit"
                  disabled={formState === "submitting"}
                  className="ka-focus px-4 py-2 text-sm font-semibold"
                  style={{
                    backgroundColor: brand.primaryColor,
                    color: onPrimary,
                    borderRadius: brand.radius,
                    opacity: formState === "submitting" ? 0.72 : 1,
                  }}
                >
                  {formState === "submitting" ? "Updating password…" : "Update password"}
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    setCurrentPw("");
                    setNewPw("");
                    setConfirmPw("");
                    setFormState("idle");
                    setFormError("");
                  }}
                  className="ka-focus border px-3 py-2 text-sm"
                  style={{
                    backgroundColor: "transparent",
                    color: t.dim,
                    borderColor: t.strongBorder,
                    borderRadius: brand.radius,
                  }}
                >
                  Clear fields
                </Button>
                {formState === "submitting" && (
                  <span className="ka-pulse text-xs" style={{ color: t.dim }}>
                    Verifying against your stored hash…
                  </span>
                )}
              </div>
            </form>
          </section>

          {/* Secondary column */}
          <div className="space-y-5 lg:col-span-2">
            <section className="border p-5" style={panel} aria-labelledby="theme-heading">
              <h2 id="theme-heading" className={sectionHeadCls} style={{ color: t.dim }}>
                Appearance
              </h2>
              <fieldset className="mt-3">
                <legend className="sr-only">Theme</legend>
                <div className="space-y-2">
                  {THEMES.map((o) => {
                    const checked = theme === o.id;
                    const preview = tokensFor(
                      o.id === "system" ? (systemPrefersDark ? "dark" : "light") : o.id,
                    );
                    return (
                      <label key={o.id} htmlFor={"theme-" + o.id} className="block cursor-pointer">
                        <input
                          id={"theme-" + o.id}
                          className="ka-radio sr-only"
                          type="radio"
                          name="theme"
                          value={o.id}
                          checked={checked}
                          onChange={() => chooseTheme(o.id)}
                        />
                        <span
                          className="ka-radio-box flex items-center gap-3 border px-3 py-2.5 transition-colors"
                          style={{
                            borderColor: checked ? brand.primaryColor : t.strongBorder,
                            backgroundColor: checked ? alpha(brand.primaryColor, 0.1) : t.field,
                            borderRadius: brand.radius,
                          }}
                        >
                          <span
                            aria-hidden="true"
                            className="flex h-8 w-11 shrink-0 flex-col justify-center gap-1 rounded border px-1.5"
                            style={{ backgroundColor: preview.bg, borderColor: preview.border }}
                          >
                            <span
                              className="block h-1 w-5 rounded-full"
                              style={{ backgroundColor: preview.text }}
                            />
                            <span
                              className="block h-1 w-7 rounded-full"
                              style={{ backgroundColor: preview.dim }}
                            />
                            <span
                              className="block h-1 w-3 rounded-full"
                              style={{ backgroundColor: brand.primaryColor }}
                            />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-medium">{o.label}</span>
                            <span className="block text-xs" style={{ color: t.dim }}>
                              {o.hint}
                            </span>
                          </span>
                          <span
                            aria-hidden="true"
                            className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border"
                            style={{
                              borderColor: checked ? brand.primaryColor : t.strongBorder,
                              backgroundColor: checked ? brand.primaryColor : "transparent",
                              color: onPrimary,
                            }}
                          >
                            {checked ? <Check className="h-2.5 w-2.5" /> : null}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
              <p className="mt-3 text-xs" style={{ color: t.dim }}>
                {themeStatus === "saving"
                  ? "Writing your choice to the server…"
                  : themeStatus === "error"
                    ? themeError
                    : theme === "system"
                      ? "Following your OS, currently " +
                        (systemPrefersDark ? "dark" : "light") +
                        ". Saved to your profile, so it follows you to any browser."
                      : "Saved to your profile, so it follows you to any browser."}
              </p>
            </section>

            <section className="border p-5" style={panel} aria-labelledby="access-heading">
              <h2 id="access-heading" className={sectionHeadCls} style={{ color: t.dim }}>
                Workspace access
              </h2>
              <ul className="mt-3 space-y-2.5">
                {ACCESS_ROWS.map((row) => (
                  <li key={row.id} className="flex items-start gap-3">
                    <span
                      aria-hidden="true"
                      className="mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border"
                      style={{
                        borderColor: row.level === "view" ? brand.primaryColor : t.strongBorder,
                        color: row.level === "view" ? brand.primaryColor : t.dim,
                      }}
                    >
                      {row.level === "view" ? (
                        <Check className="h-2.5 w-2.5" />
                      ) : (
                        <X className="h-2.5 w-2.5" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">
                        {row.area}{" "}
                        <span
                          className="ml-1 align-middle text-[10px] font-semibold uppercase tracking-wider"
                          style={{ color: row.level === "view" ? brand.primaryColor : t.dim }}
                        >
                          {row.level === "view" ? "View only" : "Admins only"}
                        </span>
                      </p>
                      <p className="text-xs" style={{ color: t.dim }}>
                        {row.detail}. {row.note}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs" style={{ color: t.dim }}>
                You are signed in as a {roleLabel}. Your workspace administrator can grant the
                admin role from Users &amp; Settings — the app does not send email, so ask them
                directly.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  type="button"
                  onClick={() => navigate("knowledge-base")}
                  className="ka-focus inline-flex items-center gap-1.5 border px-3 py-1.5 text-xs font-medium"
                  style={{
                    backgroundColor: "transparent",
                    color: t.text,
                    borderColor: t.strongBorder,
                    borderRadius: brand.radius,
                  }}
                >
                  Open Knowledge Base
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  onClick={() => navigate("docs")}
                  className="ka-focus inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium"
                  style={{
                    backgroundColor: "transparent",
                    color: brand.primaryColor,
                    borderRadius: brand.radius,
                  }}
                >
                  Read the access notes
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
              </div>
            </section>
          </div>
        </div>

        <p className="pb-2 text-xs" style={{ color: t.dim }}>
          Password hashes, sessions and preferences live in the database — a restart or redeploy
          never clears them.
        </p>
      </div>
    </div>
  );
}
