import * as React from "react";

import { apiFetch, ApiError } from "@/lib/api";

export type AuthUser = {
  id: string;
  email: string;
  role: string;
  is_active: boolean;
};

type AuthStatus = "loading" | "authenticated" | "unauthenticated";

type LoginResult = { ok: true } | { ok: false; error: string };
type BootstrapResult =
  | { ok: true }
  | { ok: false; alreadyExists: true }
  | { ok: false; alreadyExists?: false; error: string };

type AuthContextValue = {
  status: AuthStatus;
  user: AuthUser | null;
  login: (email: string, password: string) => Promise<LoginResult>;
  bootstrap: (email: string, password: string) => Promise<BootstrapResult>;
  logout: () => Promise<void>;
};

const AuthContext = React.createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = React.useState<AuthStatus>("loading");
  const [user, setUser] = React.useState<AuthUser | null>(null);

  // Restores the session exactly once on app load (AC-004): a valid session
  // renders the requested screen without re-entering credentials, a 401
  // leaves the caller to redirect to /sign-in.
  React.useEffect(() => {
    let cancelled = false;
    apiFetch<AuthUser>("/auth/me")
      .then((me) => {
        if (cancelled) return;
        setUser(me);
        setStatus("authenticated");
      })
      .catch(() => {
        if (cancelled) return;
        setUser(null);
        setStatus("unauthenticated");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const login = React.useCallback(async (email: string, password: string): Promise<LoginResult> => {
    try {
      const me = await apiFetch<AuthUser>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      setUser(me);
      setStatus("authenticated");
      return { ok: true };
    } catch (err) {
      // AC-002: every failure path -- unknown email, wrong password, a
      // disabled account -- renders the same generic message. No branch here
      // reveals which case it was.
      if (err instanceof ApiError && err.status === 401) {
        return { ok: false, error: "Email or password is incorrect" };
      }
      return { ok: false, error: "Something went wrong. Try again." };
    }
  }, []);

  const bootstrap = React.useCallback(
    async (email: string, password: string): Promise<BootstrapResult> => {
      try {
        await apiFetch<unknown>("/users", {
          method: "POST",
          body: JSON.stringify({ email, temp_password: password, role: "admin" }),
        });
        return { ok: true };
      } catch (err) {
        if (err instanceof ApiError && (err.status === 403 || err.status === 409)) {
          return { ok: false, alreadyExists: true };
        }
        return { ok: false, error: "Something went wrong. Try again." };
      }
    },
    [],
  );

  const logout = React.useCallback(async () => {
    try {
      await apiFetch<void>("/auth/logout", { method: "POST" });
    } finally {
      // The client never holds a token -- the cookie is the session. Clearing
      // local state is enough; there is nothing else to wipe.
      setUser(null);
      setStatus("unauthenticated");
    }
  }, []);

  const value = React.useMemo<AuthContextValue>(
    () => ({ status, user, login, bootstrap, logout }),
    [status, user, login, bootstrap, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = React.useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
