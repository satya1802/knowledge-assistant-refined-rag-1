import type { ReactNode } from "react";
import * as React from "react";
import { NavLink, Navigate, Route, Routes, useNavigate } from "react-router-dom";

import SignIn from "@/screens/SignIn";
import Chat from "@/screens/Chat";
import KnowledgeBase from "@/screens/KnowledgeBase";
import Users from "@/screens/Users";
import Account from "@/screens/Account";
import Docs from "@/screens/Docs";
import { useAuth } from "@/lib/auth";
import { BrandMark } from "@/lib/BrandMark";

// AC-087: every interactive element in the shell nav gets this focus style --
// `--brand-focus` is chosen per theme in index.css so it clears the 3:1
// boundary-contrast threshold against this shell's own background, in both
// themes (navy itself does not, against the dark theme's near-black surface).
const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-focus)] focus-visible:ring-offset-2";

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  [
    "block rounded-[var(--brand-radius)] px-3 py-2 text-sm font-medium transition-colors",
    FOCUS_RING,
    isActive ? "bg-[var(--brand-hover)] text-[var(--brand-fg)]" : "text-[var(--brand-fg-muted)]",
  ].join(" ");

function ProtectedRoute({
  children,
  adminOnly = false,
}: {
  children: ReactNode;
  adminOnly?: boolean;
}) {
  const { status, user } = useAuth();
  if (status === "loading") {
    return <div className="p-6 text-sm text-[var(--brand-fg-muted)]">{"Loading…"}</div>;
  }
  if (status === "unauthenticated") {
    return <Navigate to="/sign-in" replace />;
  }
  if (adminOnly && user?.role !== "admin") {
    return <Navigate to="/chat" replace />;
  }
  return <>{children}</>;
}

function SignOutButton({ onNavigate }: { onNavigate?: () => void }) {
  const { logout } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await logout();
    onNavigate?.();
    navigate("/sign-in");
  };

  return (
    <button
      type="button"
      onClick={handleSignOut}
      className={cx(
        "mt-2 block w-full rounded-[var(--brand-radius)] px-3 py-2 text-left text-sm font-medium text-[var(--brand-fg-muted)] transition-colors hover:bg-[var(--brand-hover)] hover:text-[var(--brand-fg)]",
        FOCUS_RING,
      )}
    >
      {"Sign Out"}
    </button>
  );
}

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export default function App() {
  const { status, user } = useAuth();
  const isAdmin = status === "authenticated" && user?.role === "admin";
  // AC-088: the sidebar is a slide-in panel behind a toggle below the `md`
  // (768px) breakpoint -- at 768px and up it renders statically, always open.
  const [navOpen, setNavOpen] = React.useState(false);
  const closeNav = () => setNavOpen(false);

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <div
        className="flex items-center justify-between border-b p-3 md:hidden"
        style={{ backgroundColor: "var(--brand-surface)", borderColor: "var(--brand-border)" }}
      >
        <div className="flex items-center gap-2">
          <BrandMark size={24} />
          <span
            className="text-sm font-semibold"
            style={{ fontFamily: "var(--brand-font-heading)", color: "var(--brand-fg)" }}
          >
            Knowledge Assistant
          </span>
        </div>
        <button
          type="button"
          aria-expanded={navOpen}
          aria-controls="app-sidebar"
          aria-label="Toggle navigation"
          onClick={() => setNavOpen((open) => !open)}
          className={cx(
            "rounded-[var(--brand-radius)] border px-3 py-1.5 text-sm font-medium",
            FOCUS_RING,
          )}
          style={{ borderColor: "var(--brand-border)", color: "var(--brand-fg)" }}
        >
          Menu
        </button>
      </div>

      {navOpen ? (
        <div
          aria-hidden="true"
          onClick={closeNav}
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
        />
      ) : null}

      <aside
        id="app-sidebar"
        className={cx(
          "fixed inset-y-0 left-0 z-40 w-56 shrink-0 overflow-y-auto border-r p-4 transition-transform duration-200",
          "md:static md:z-auto md:w-56 md:translate-x-0 md:transition-none",
          navOpen ? "translate-x-0" : "-translate-x-full",
        )}
        style={{
          backgroundColor: "var(--brand-surface)",
          borderColor: "var(--brand-border)",
        }}
      >
        <div className="mb-4 hidden items-center gap-2 px-3 md:flex">
          <BrandMark size={24} />
          <p
            className="text-sm font-semibold"
            style={{ fontFamily: "var(--brand-font-heading)", color: "var(--brand-fg)" }}
          >
            {"Knowledge Assistant - Refined RAG"}
          </p>
        </div>
        <nav className="flex flex-col gap-1">
          <NavLink to="/sign-in" className={navLinkClass} onClick={closeNav}>
            {"Sign In"}
          </NavLink>
          <NavLink to="/chat" className={navLinkClass} onClick={closeNav}>
            {"Chat"}
          </NavLink>
          <NavLink to="/knowledge-base" className={navLinkClass} onClick={closeNav}>
            {"Knowledge Base"}
          </NavLink>
          {isAdmin ? (
            <NavLink to="/users" className={navLinkClass} onClick={closeNav}>
              {"Users & Settings"}
            </NavLink>
          ) : null}
          <NavLink to="/account" className={navLinkClass} onClick={closeNav}>
            {"Account"}
          </NavLink>
          <NavLink to="/docs" className={navLinkClass} onClick={closeNav}>
            {"Documentation"}
          </NavLink>
        </nav>
        {status === "authenticated" ? <SignOutButton onNavigate={closeNav} /> : null}
      </aside>
      <main className="flex-1 overflow-auto">
        <Routes>
          <Route path="/sign-in" element={<SignIn />} />
          <Route
            path="/chat"
            element={
              <ProtectedRoute>
                <Chat />
              </ProtectedRoute>
            }
          />
          <Route
            path="/knowledge-base"
            element={
              <ProtectedRoute>
                <KnowledgeBase />
              </ProtectedRoute>
            }
          />
          <Route
            path="/users"
            element={
              <ProtectedRoute adminOnly>
                <Users />
              </ProtectedRoute>
            }
          />
          <Route
            path="/account"
            element={
              <ProtectedRoute>
                <Account />
              </ProtectedRoute>
            }
          />
          <Route path="/docs" element={<Docs />} />
          <Route path="*" element={<Navigate to="/sign-in" replace />} />
        </Routes>
      </main>
    </div>
  );
}
