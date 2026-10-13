import * as React from "react";

import { apiFetch } from "@/lib/api";

/**
 * The three choices Account offers (AC-083/AC-084/AC-085). "system" never
 * appears as the resolved, on-screen palette -- it always resolves to
 * `effectiveTheme`, which is "light" or "dark".
 */
export type ThemePreference = "light" | "dark" | "system";
export type EffectiveTheme = "light" | "dark";

type MeThemeResponse = { user?: { theme?: unknown } };

type SetThemeResult = { ok: true } | { ok: false; error: string };

type ThemeContextValue = {
  theme: ThemePreference;
  effectiveTheme: EffectiveTheme;
  systemPrefersDark: boolean;
  setTheme: (theme: ThemePreference) => Promise<SetThemeResult>;
  loaded: boolean;
};

const ThemeContext = React.createContext<ThemeContextValue | undefined>(undefined);

function isThemePreference(value: unknown): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system";
}

// The brand's accent colours (primary/accent/neutral) never change between
// Light and Dark -- only the surfaces and text that sit on top of them do.
// These mirror the dark defaults already in index.css, so Dark paints
// identically to what a user saw before this screen existed.
const PALETTE: Record<EffectiveTheme, Record<string, string>> = {
  dark: {
    "--brand-background": "#0e1620",
    "--brand-surface": "rgba(255, 255, 255, 0.04)",
    "--brand-border": "rgba(255, 255, 255, 0.1)",
    "--brand-fg": "#e2e8f0",
    "--brand-fg-muted": "rgba(226, 232, 240, 0.65)",
    "--brand-hover": "rgba(255, 255, 255, 0.06)",
  },
  light: {
    "--brand-background": "#eef1f4",
    "--brand-surface": "#ffffff",
    "--brand-border": "rgba(14, 22, 32, 0.12)",
    "--brand-fg": "#0e1620",
    "--brand-fg-muted": "rgba(14, 22, 32, 0.65)",
    "--brand-hover": "rgba(14, 22, 32, 0.06)",
  },
};

function applyThemeVars(effective: EffectiveTheme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const vars = PALETTE[effective];
  Object.entries(vars).forEach(([name, value]) => root.style.setProperty(name, value));
  root.setAttribute("data-theme", effective);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = React.useState<ThemePreference>("system");
  const [systemPrefersDark, setSystemPrefersDark] = React.useState(true);
  const [loaded, setLoaded] = React.useState(false);

  // AC-084: the source of truth is the server, not localStorage. Every load
  // (including a sign-in from a different browser) reads the saved
  // preference from GET /auth/me rather than anything cached on this device.
  React.useEffect(() => {
    let cancelled = false;
    apiFetch<MeThemeResponse>("/auth/me")
      .then((me) => {
        if (cancelled) return;
        const serverTheme = me?.user?.theme;
        if (isThemePreference(serverTheme)) {
          setThemeState(serverTheme);
        }
      })
      .catch(() => {
        /* unauthenticated or offline: fall back to the "system" default */
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // AC-085: while "system" is selected, the interface tracks the OS live,
  // for as long as the app stays open -- not just at the moment it loaded.
  React.useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return undefined;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    setSystemPrefersDark(mq.matches);
    const handler = (event: MediaQueryListEvent) => setSystemPrefersDark(event.matches);
    if (mq.addEventListener) mq.addEventListener("change", handler);
    else mq.addListener(handler);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener("change", handler);
      else mq.removeListener(handler);
    };
  }, []);

  const effectiveTheme: EffectiveTheme =
    theme === "system" ? (systemPrefersDark ? "dark" : "light") : theme;

  // AC-083: this is the one place the palette is written to the document --
  // every screen reads var(--brand-*), none of them hold their own copy.
  React.useEffect(() => {
    applyThemeVars(effectiveTheme);
  }, [effectiveTheme]);

  const setTheme = React.useCallback(
    async (next: ThemePreference): Promise<SetThemeResult> => {
      const previous = theme;
      if (next === previous) return { ok: true };
      setThemeState(next);
      try {
        await apiFetch<unknown>("/account/theme", {
          method: "PATCH",
          body: JSON.stringify({ theme: next }),
        });
        return { ok: true };
      } catch {
        // No browser-only persistence: a save that fails server-side must
        // not leave the UI claiming a preference the server never accepted.
        setThemeState(previous);
        return { ok: false, error: "Could not save your theme. Try again." };
      }
    },
    [theme],
  );

  const value = React.useMemo<ThemeContextValue>(
    () => ({ theme, effectiveTheme, systemPrefersDark, setTheme, loaded }),
    [theme, effectiveTheme, systemPrefersDark, setTheme, loaded],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = React.useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return ctx;
}
