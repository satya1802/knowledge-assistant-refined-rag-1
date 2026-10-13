// @ts-nocheck -- generated from the approved design under its JS runtime contract; not hand-written TypeScript.
/* eslint-disable @typescript-eslint/no-unused-vars */
import React from "react";

import * as UI from "@/lib/ui";
import { Icons } from "@/lib/icons";
import { brand } from "@/lib/brand";
import { useNavigate } from "@/lib/navigate";

const { Button, Input, Label, Badge, Table, THead, TBody, TR, TH, TD } = UI;
const { Check, X, Users, Settings, Clock, Filter, Upload, ArrowRight, AlertCircle, CheckCircle } = Icons;

const rgbOf = (hex) => {
  const h = String(hex || '').replace('#', '');
  const n = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
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
  mode === 'light'
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

const ACCOUNT = {
  name: 'Dana Okonkwo',
  email: 'dana.okonkwo@harbourline.co.uk',
  initials: 'DO',
  role: 'Member',
  createdAt: '4 February 2026',
  provisionedBy: 'Priya Raman',
  sessionStarted: 'Today, 09:12',
  device: 'Chrome 131 · macOS 15.2',
};

const ADMINS = 'Priya Raman or Tomas Keller';

const THEMES = [
  { id: 'light', label: 'Light', hint: 'Bright rooms, shared screens' },
  { id: 'dark', label: 'Dark', hint: 'The console default' },
  { id: 'system', label: 'System', hint: 'Follows your OS appearance' },
];

const CATEGORIES = [
  { id: 'all', label: 'All events' },
  { id: 'session', label: 'Sign-ins' },
  { id: 'security', label: 'Security' },
  { id: 'preference', label: 'Preferences' },
];

const ACTIVITY_SEED = [
  { id: 'a1', when: '13 Oct · 09:12', event: 'Signed in', category: 'session', tone: 'ok', detail: 'Session active now', device: 'Chrome 131 · macOS' },
  { id: 'a2', when: '12 Oct · 17:48', event: 'Theme changed', category: 'preference', tone: 'muted', detail: 'System → Dark', device: 'Chrome 131 · macOS' },
  { id: 'a3', when: '12 Oct · 08:57', event: 'Signed in', category: 'session', tone: 'muted', detail: '10.4.22.18', device: 'Chrome 131 · macOS' },
  { id: 'a4', when: '10 Oct · 16:02', event: 'Sign-in refused', category: 'security', tone: 'warn', detail: 'Incorrect password · attempt 2 of 5', device: 'Safari 18 · iPadOS' },
  { id: 'a5', when: '10 Oct · 15:58', event: 'Sign-in refused', category: 'security', tone: 'warn', detail: 'Incorrect password · attempt 1 of 5', device: 'Safari 18 · iPadOS' },
  { id: 'a6', when: '09 Oct · 11:30', event: 'Password changed', category: 'security', tone: 'ok', detail: 'Temporary password replaced', device: 'Chrome 131 · macOS' },
  { id: 'a7', when: '08 Oct · 09:04', event: 'Signed in', category: 'session', tone: 'muted', detail: '10.4.22.61', device: 'Safari 18 · iPadOS' },
  { id: 'a8', when: '06 Oct · 18:20', event: 'Signed out', category: 'session', tone: 'muted', detail: 'Session ended by user', device: 'Chrome 131 · macOS' },
];

const ACCESS_ROWS = [
  {
    id: 'kb',
    area: 'Knowledge Base',
    detail: 'View and download documents',
    note: 'Upload, retry, re-index and delete are administrator-only.',
    level: 'view',
    route: 'knowledge-base',
  },
  {
    id: 'users',
    area: 'Users & Settings',
    detail: 'Provision accounts, issue temporary passwords',
    note: 'Not available to your role.',
    level: 'none',
    route: 'users',
  },
  {
    id: 'threshold',
    area: 'Retrieval threshold',
    detail: 'Similarity cut-off, held at 0.62',
    note: 'Not available to your role.',
    level: 'none',
    route: 'users',
  },
];

export default function Screen() {
  const navigate = useNavigate();
  const { Button, Input, Label, Badge, Table, THead, TBody, TR, TH, TD } = UI;
  const { Check, X, AlertCircle, CheckCircle, Clock, ArrowRight, Settings } = Icons;

  const [systemDark, setSystemDark] = React.useState(true);
  const [theme, setTheme] = React.useState('dark');
  const [themeStatus, setThemeStatus] = React.useState('idle');
  const [syncedAt, setSyncedAt] = React.useState('09:14');

  const [currentPw, setCurrentPw] = React.useState('');
  const [newPw, setNewPw] = React.useState('');
  const [confirmPw, setConfirmPw] = React.useState('');
  const [showCurrent, setShowCurrent] = React.useState(false);
  const [showNew, setShowNew] = React.useState(false);
  const [formState, setFormState] = React.useState('idle'); // idle | submitting | error | success
  const [formError, setFormError] = React.useState('');
  const [attempts, setAttempts] = React.useState(0);

  const [activity, setActivity] = React.useState(ACTIVITY_SEED);
  const [category, setCategory] = React.useState('all');
  const [activityLoading, setActivityLoading] = React.useState(false);
  const [activityAsOf, setActivityAsOf] = React.useState('09:14');

  const timers = React.useRef([]);
  const later = (fn, ms) => {
    const id = setTimeout(fn, ms);
    timers.current.push(id);
  };

  React.useEffect(() => () => timers.current.forEach(clearTimeout), []);

  React.useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    setSystemDark(mq.matches);
    const handler = (e) => setSystemDark(e.matches);
    if (mq.addEventListener) mq.addEventListener('change', handler);
    else mq.addListener(handler);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', handler);
      else mq.removeListener(handler);
    };
  }, []);

  const effective = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme;
  const t = tokensFor(effective);
  const onPrimary = brand.backgroundColor;

  const clockNow = () => {
    try {
      return new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      return '—:—';
    }
  };

  const addEvent = (row) =>
    setActivity((prev) => [{ id: 'e' + Date.now() + Math.random(), isNew: true, when: 'Just now', ...row }, ...prev]);

  const requirements = [
    { id: 'len', label: 'At least 12 characters', ok: newPw.length >= 12 },
    { id: 'num', label: 'Contains a number', ok: /\d/.test(newPw) },
    { id: 'diff', label: 'Different from your current password', ok: newPw.length > 0 && newPw !== currentPw },
  ];
  const allMet = requirements.every((r) => r.ok);

  const chooseTheme = (id) => {
    if (id === theme) return;
    const from = theme.charAt(0).toUpperCase() + theme.slice(1);
    const to = id.charAt(0).toUpperCase() + id.slice(1);
    setTheme(id);
    setThemeStatus('saving');
    later(() => {
      setThemeStatus('saved');
      setSyncedAt(clockNow());
      addEvent({ event: 'Theme changed', category: 'preference', tone: 'muted', detail: from + ' → ' + to, device: ACCOUNT.device.split(' · ')[0] + ' · macOS' });
    }, 700);
  };

  const submitPassword = (e) => {
    e.preventDefault();
    if (formState === 'submitting') return;
    setFormState('idle');
    setFormError('');

    if (!currentPw) {
      setFormState('error');
      setFormError('Enter your current password so we know it is you.');
      return;
    }
    if (!allMet) {
      setFormState('error');
      setFormError('Your new password does not meet all three rules yet.');
      return;
    }
    if (newPw !== confirmPw) {
      setFormState('error');
      setFormError('The two new passwords do not match. Retype the confirmation.');
      return;
    }

    setFormState('submitting');
    later(() => {
      if (currentPw.trim().length < 8) {
        setAttempts((a) => a + 1);
        setFormState('error');
        setFormError('That current password is not right. Nothing was changed — your new password is still in the boxes.');
        addEvent({ event: 'Password change refused', category: 'security', tone: 'warn', detail: 'Incorrect current password', device: 'Chrome 131 · macOS' });
        return;
      }
      setAttempts(0);
      setFormState('success');
      setCurrentPw('');
      setNewPw('');
      setConfirmPw('');
      setShowCurrent(false);
      setShowNew(false);
      addEvent({ event: 'Password changed', category: 'security', tone: 'ok', detail: 'Changed from the Account page', device: 'Chrome 131 · macOS' });
    }, 900);
  };

  const refreshActivity = () => {
    setActivityLoading(true);
    later(() => {
      setActivityLoading(false);
      setActivityAsOf(clockNow());
    }, 750);
  };

  const counts = CATEGORIES.reduce((acc, c) => {
    acc[c.id] = c.id === 'all' ? activity.length : activity.filter((r) => r.category === c.id).length;
    return acc;
  }, {});
  const rows = category === 'all' ? activity : activity.filter((r) => r.category === category);

  const toneColor = (tone) => (tone === 'ok' ? brand.primaryColor : tone === 'warn' ? brand.accentColor : t.dim);

  const panel = {
    backgroundColor: t.surface,
    borderColor: t.border,
    borderRadius: brand.radius,
    transition: 'background-color .25s ease, border-color .25s ease',
  };
  const fieldStyle = {
    backgroundColor: t.field,
    borderColor: t.strongBorder,
    color: t.text,
    borderRadius: brand.radius,
  };
  const labelCls = 'text-xs font-medium tracking-wide';
  const sectionHeadCls = 'text-[11px] font-semibold uppercase tracking-[0.16em]';

  return (
    <div
      className="min-h-full px-5 py-6 lg:px-8"
      style={{
        backgroundColor: t.bg,
        color: t.text,
        fontFamily: brand.fontBody,
        ['--ka-ring']: brand.primaryColor,
        transition: 'background-color .3s ease, color .3s ease',
      }}
    >
      <style>{`
        .ka-focus:focus-visible { outline: 2px solid var(--ka-ring); outline-offset: 2px; }
        .ka-radio:focus-visible + .ka-radio-box { outline: 2px solid var(--ka-ring); outline-offset: 2px; }
        @keyframes ka-row-in { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: none; } }
        @keyframes ka-fade-in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
        @keyframes ka-pulse { 0%, 100% { opacity: .3; } 50% { opacity: 1; } }
        .ka-row-in { animation: ka-row-in .4s ease-out both; }
        .ka-fade-in { animation: ka-fade-in .28s ease-out both; }
        .ka-pulse { animation: ka-pulse 1.3s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .ka-row-in, .ka-fade-in, .ka-pulse { animation: none !important; }
          * { transition: none !important; }
        }
      `}</style>

      <div className="mx-auto max-w-5xl space-y-5">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight" style={{ fontFamily: brand.fontHeading }}>
              Account
            </h1>
            <p className="mt-1 max-w-xl text-sm" style={{ color: t.dim }}>
              Your sign-in password and how Knowledge Assistant looks when you open it. Both are stored against your user
              record, not this browser.
            </p>
          </div>
          <div
            role="status"
            aria-live="polite"
            className="flex items-center gap-2 border px-3 py-1.5 text-xs"
            style={{ ...panel, backgroundColor: t.field, borderRadius: '999px', color: t.dim }}
          >
            <span
              aria-hidden="true"
              className={'inline-block h-1.5 w-1.5 rounded-full ' + (themeStatus === 'saving' ? 'ka-pulse' : '')}
              style={{ backgroundColor: themeStatus === 'saving' ? brand.accentColor : brand.primaryColor }}
            />
            {themeStatus === 'saving' ? 'Saving preferences…' : 'Preferences synced · ' + syncedAt}
          </div>
        </header>

        <section className="flex flex-wrap items-center gap-4 border px-4 py-3" style={panel} aria-label="Signed-in user">
          <span
            aria-hidden="true"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold"
            style={{ backgroundColor: alpha(brand.primaryColor, 0.16), color: brand.primaryColor }}
          >
            {ACCOUNT.initials}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate text-sm font-semibold">{ACCOUNT.name}</p>
              <span
                className="rounded-full border px-2 py-0.5 text-[11px] font-medium"
                style={{ borderColor: t.strongBorder, color: t.dim }}
              >
                {ACCOUNT.role}
              </span>
            </div>
            <p className="truncate text-xs" style={{ color: t.dim }}>
              {ACCOUNT.email} · provisioned by {ACCOUNT.provisionedBy} on {ACCOUNT.createdAt}
            </p>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-3">
            <p className="text-right text-xs" style={{ color: t.dim, fontVariantNumeric: 'tabular-nums' }}>
              Session started {ACCOUNT.sessionStarted}
              <br />
              {ACCOUNT.device}
            </p>
            <Button
              type="button"
              onClick={() => navigate('sign-in')}
              className="ka-focus border px-3 py-1.5 text-xs font-medium"
              style={{ backgroundColor: 'transparent', color: t.text, borderColor: t.strongBorder, borderRadius: brand.radius }}
            >
              Sign out
            </Button>
          </div>
        </section>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
          {/* Focal: password change */}
          <section className="border p-5 lg:col-span-3" style={panel} aria-labelledby="pw-heading">
            <h2 id="pw-heading" className="text-lg font-semibold tracking-tight" style={{ fontFamily: brand.fontHeading }}>
              Change password
            </h2>
            <p className="mt-1 text-sm" style={{ color: t.dim }}>
              Replace the temporary password your administrator issued. It is stored as a bcrypt hash — the plaintext is
              never saved, returned or logged.
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
                    type={showCurrent ? 'text' : 'password'}
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
                    aria-label={showCurrent ? 'Hide current password' : 'Show current password'}
                    className="ka-focus absolute right-2 top-1/2 -translate-y-1/2 rounded px-2 py-1 text-[11px] font-medium"
                    style={{ color: brand.primaryColor }}
                  >
                    {showCurrent ? 'Hide' : 'Show'}
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
                    type={showNew ? 'text' : 'password'}
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
                    aria-label={showNew ? 'Hide new password' : 'Show new password'}
                    className="ka-focus absolute right-2 top-1/2 -translate-y-1/2 rounded px-2 py-1 text-[11px] font-medium"
                    style={{ color: brand.primaryColor }}
                  >
                    {showNew ? 'Hide' : 'Show'}
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
                          backgroundColor: r.ok ? alpha(brand.primaryColor, 0.16) : 'transparent',
                          color: r.ok ? brand.primaryColor : t.dim,
                        }}
                      >
                        {r.ok ? <Check className="h-2.5 w-2.5" /> : <X className="h-2.5 w-2.5" />}
                      </span>
                      <span style={{ color: r.ok ? t.text : t.dim }}>{r.label}</span>
                      <span className="sr-only">{r.ok ? '— met' : '— not met yet'}</span>
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

              {formState === 'error' && (
                <div
                  role="alert"
                  className="ka-fade-in flex gap-2.5 border px-3 py-2.5 text-xs"
                  style={{
                    borderColor: alpha(brand.accentColor, 0.55),
                    backgroundColor: alpha(brand.accentColor, 0.1),
                    borderRadius: brand.radius,
                  }}
                >
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" style={{ color: brand.accentColor }} aria-hidden="true" />
                  <div>
                    <p className="font-semibold" style={{ color: brand.accentColor }}>
                      Password not changed
                    </p>
                    <p className="mt-0.5" style={{ color: t.text }}>{formError}</p>
                    {attempts > 0 && (
                      <p className="mt-1" style={{ color: t.dim, fontVariantNumeric: 'tabular-nums' }}>
                        Attempt {attempts} of 5 · after five wrong attempts this email is locked for 15 minutes.{' '}
                        {ADMINS} can issue a temporary password from Users &amp; Settings.
                      </p>
                    )}
                  </div>
                </div>
              )}

              {formState === 'success' && (
                <div
                  role="status"
                  className="ka-fade-in flex gap-2.5 border px-3 py-2.5 text-xs"
                  style={{
                    borderColor: alpha(brand.primaryColor, 0.55),
                    backgroundColor: alpha(brand.primaryColor, 0.1),
                    borderRadius: brand.radius,
                  }}
                >
                  <CheckCircle className="mt-0.5 h-4 w-4 shrink-0" style={{ color: brand.primaryColor }} aria-hidden="true" />
                  <div>
                    <p className="font-semibold" style={{ color: brand.primaryColor }}>
                      Password updated
                    </p>
                    <p className="mt-0.5" style={{ color: t.text }}>
                      Your current session stays signed in. Use the new password the next time you sign in — the old one
                      no longer works anywhere.
                    </p>
                  </div>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-3 pt-1">
                <Button
                  type="submit"
                  disabled={formState === 'submitting'}
                  className="ka-focus px-4 py-2 text-sm font-semibold"
                  style={{
                    backgroundColor: brand.primaryColor,
                    color: onPrimary,
                    borderRadius: brand.radius,
                    opacity: formState === 'submitting' ? 0.72 : 1,
                  }}
                >
                  {formState === 'submitting' ? 'Updating password…' : 'Update password'}
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    setCurrentPw('');
                    setNewPw('');
                    setConfirmPw('');
                    setFormState('idle');
                    setFormError('');
                  }}
                  className="ka-focus border px-3 py-2 text-sm"
                  style={{ backgroundColor: 'transparent', color: t.dim, borderColor: t.strongBorder, borderRadius: brand.radius }}
                >
                  Clear fields
                </Button>
                {formState === 'submitting' && (
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
                    const preview = tokensFor(o.id === 'system' ? (systemDark ? 'dark' : 'light') : o.id);
                    return (
                      <label key={o.id} htmlFor={'theme-' + o.id} className="block cursor-pointer">
                        <input
                          id={'theme-' + o.id}
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
                            <span className="block h-1 w-5 rounded-full" style={{ backgroundColor: preview.text }} />
                            <span className="block h-1 w-7 rounded-full" style={{ backgroundColor: preview.dim }} />
                            <span className="block h-1 w-3 rounded-full" style={{ backgroundColor: brand.primaryColor }} />
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
                              backgroundColor: checked ? brand.primaryColor : 'transparent',
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
                {themeStatus === 'saving'
                  ? 'Writing your choice to the server…'
                  : theme === 'system'
                  ? 'Following your OS, currently ' + (systemDark ? 'dark' : 'light') + '. Saved to your profile, so it follows you to any browser.'
                  : 'Saved to your profile, so it follows you to any browser.'}
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
                        borderColor: row.level === 'view' ? brand.primaryColor : t.strongBorder,
                        color: row.level === 'view' ? brand.primaryColor : t.dim,
                      }}
                    >
                      {row.level === 'view' ? <Check className="h-2.5 w-2.5" /> : <X className="h-2.5 w-2.5" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">
                        {row.area}{' '}
                        <span
                          className="ml-1 align-middle text-[10px] font-semibold uppercase tracking-wider"
                          style={{ color: row.level === 'view' ? brand.primaryColor : t.dim }}
                        >
                          {row.level === 'view' ? 'View only' : 'Admins only'}
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
                You are signed in as a Member. {ADMINS} can grant the admin role from Users &amp; Settings — the app does
                not send email, so ask them directly.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  type="button"
                  onClick={() => navigate('knowledge-base')}
                  className="ka-focus inline-flex items-center gap-1.5 border px-3 py-1.5 text-xs font-medium"
                  style={{ backgroundColor: 'transparent', color: t.text, borderColor: t.strongBorder, borderRadius: brand.radius }}
                >
                  Open Knowledge Base
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  onClick={() => navigate('docs')}
                  className="ka-focus inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium"
                  style={{ backgroundColor: 'transparent', color: brand.primaryColor, borderRadius: brand.radius }}
                >
                  Read the access notes
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
              </div>
            </section>
          </div>
        </div>

        <section className="border p-5" style={panel} aria-labelledby="activity-heading">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 id="activity-heading" className={sectionHeadCls} style={{ color: t.dim }}>
                Account activity
              </h2>
              <p className="mt-1 text-xs" style={{ color: t.dim, fontVariantNumeric: 'tabular-nums' }}>
                <Clock className="mr-1 inline h-3 w-3 align-[-1px]" aria-hidden="true" />
                Last 30 days · as of {activityAsOf}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div role="group" aria-label="Filter account activity" className="flex flex-wrap gap-1">
                {CATEGORIES.map((c) => {
                  const active = category === c.id;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setCategory(c.id)}
                      className="ka-focus border px-2.5 py-1 text-xs font-medium transition-colors"
                      style={{
                        borderRadius: brand.radius,
                        borderColor: active ? brand.primaryColor : t.strongBorder,
                        backgroundColor: active ? alpha(brand.primaryColor, 0.14) : 'transparent',
                        color: active ? brand.primaryColor : t.dim,
                      }}
                    >
                      {c.label}
                      <span className="ml-1.5" style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {counts[c.id]}
                      </span>
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={refreshActivity}
                aria-label="Refresh account activity"
                className="ka-focus border p-1.5"
                style={{ borderColor: t.strongBorder, color: t.dim, borderRadius: brand.radius }}
              >
                <Settings className={'h-3.5 w-3.5 ' + (activityLoading ? 'ka-pulse' : '')} aria-hidden="true" />
              </button>
            </div>
          </div>

          <div className="mt-4 overflow-x-auto">
            {activityLoading ? (
              <div className="space-y-2 py-2" role="status" aria-live="polite">
                <span className="sr-only">Loading account activity</span>
                {[0, 1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="ka-pulse h-8"
                    style={{ backgroundColor: t.field, borderRadius: brand.radius, animationDelay: i * 0.12 + 's' }}
                  />
                ))}
              </div>
            ) : rows.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <p className="text-sm font-medium">
                  No {(CATEGORIES.find((c) => c.id === category) || {}).label.toLowerCase()} in the last 30 days
                </p>
                <p className="mx-auto mt-1 max-w-sm text-xs" style={{ color: t.dim }}>
                  Nothing has been recorded against your account in this category. Sign-ins, password changes and theme
                  changes all appear here within a few seconds.
                </p>
                <Button
                  type="button"
                  onClick={() => setCategory('all')}
                  className="ka-focus mt-3 border px-3 py-1.5 text-xs font-medium"
                  style={{ backgroundColor: 'transparent', color: t.text, borderColor: t.strongBorder, borderRadius: brand.radius }}
                >
                  Show all events
                </Button>
              </div>
            ) : (
              <Table className="w-full text-left text-sm" style={{ fontVariantNumeric: 'tabular-nums' }}>
                <THead>
                  <TR>
                    <TH
                      scope="col"
                      className="py-2 pr-4 text-[11px] font-semibold uppercase tracking-[0.12em]"
                      style={{ color: t.dim, borderBottom: '1px solid ' + t.border }}
                    >
                      When
                    </TH>
                    <TH
                      scope="col"
                      className="py-2 pr-4 text-[11px] font-semibold uppercase tracking-[0.12em]"
                      style={{ color: t.dim, borderBottom: '1px solid ' + t.border }}
                    >
                      Event
                    </TH>
                    <TH
                      scope="col"
                      className="py-2 pr-4 text-[11px] font-semibold uppercase tracking-[0.12em]"
                      style={{ color: t.dim, borderBottom: '1px solid ' + t.border }}
                    >
                      Detail
                    </TH>
                    <TH
                      scope="col"
                      className="hidden py-2 text-[11px] font-semibold uppercase tracking-[0.12em] sm:table-cell"
                      style={{ color: t.dim, borderBottom: '1px solid ' + t.border }}
                    >
                      Device
                    </TH>
                  </TR>
                </THead>
                <TBody>
                  {rows.map((r) => (
                    <TR key={r.id} className={r.isNew ? 'ka-row-in' : ''}>
                      <TD
                        className="whitespace-nowrap py-2 pr-4 text-xs"
                        style={{ color: t.dim, borderBottom: '1px solid ' + t.border }}
                      >
                        {r.when}
                      </TD>
                      <TD className="py-2 pr-4" style={{ borderBottom: '1px solid ' + t.border }}>
                        <span className="flex items-center gap-2">
                          <span
                            aria-hidden="true"
                            className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                            style={{ backgroundColor: toneColor(r.tone) }}
                          />
                          <span className="text-xs font-medium" style={{ color: r.tone === 'warn' ? brand.accentColor : t.text }}>
                            {r.event}
                          </span>
                        </span>
                      </TD>
                      <TD className="py-2 pr-4 text-xs" style={{ color: t.dim, borderBottom: '1px solid ' + t.border }}>
                        {r.detail}
                      </TD>
                      <TD
                        className="hidden py-2 text-xs sm:table-cell"
                        style={{ color: t.dim, borderBottom: '1px solid ' + t.border }}
                      >
                        {r.device}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </div>
        </section>

        <p className="pb-2 text-xs" style={{ color: t.dim }}>
          Password hashes, sessions and preferences live in the database — a restart or redeploy never clears them.
        </p>
      </div>
    </div>
  );
}
