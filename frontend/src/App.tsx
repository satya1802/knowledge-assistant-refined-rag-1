import type { ReactNode } from "react";
import { NavLink, Navigate, Route, Routes, useNavigate } from "react-router-dom";

import SignIn from "@/screens/SignIn";
import Chat from "@/screens/Chat";
import KnowledgeBase from "@/screens/KnowledgeBase";
import Users from "@/screens/Users";
import Account from "@/screens/Account";
import Docs from "@/screens/Docs";
import { useAuth } from "@/lib/auth";

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  [
    "block rounded-[var(--brand-radius)] px-3 py-2 text-sm font-medium transition-colors",
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

function SignOutButton() {
  const { logout } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await logout();
    navigate("/sign-in");
  };

  return (
    <button
      type="button"
      onClick={handleSignOut}
      className="mt-2 block w-full rounded-[var(--brand-radius)] px-3 py-2 text-left text-sm font-medium text-[var(--brand-fg-muted)] transition-colors hover:bg-[var(--brand-hover)] hover:text-[var(--brand-fg)]"
    >
      {"Sign Out"}
    </button>
  );
}

export default function App() {
  const { status, user } = useAuth();
  const isAdmin = status === "authenticated" && user?.role === "admin";

  return (
    <div className="flex min-h-screen">
      <aside
        className="w-56 shrink-0 border-r p-4"
        style={{
          backgroundColor: "var(--brand-surface)",
          borderColor: "var(--brand-border)",
        }}
      >
        <p
          className="mb-4 px-3 text-sm font-semibold"
          style={{ fontFamily: "var(--brand-font-heading)" }}
        >
          {"Knowledge Assistant - Refined RAG"}
        </p>
        <nav className="flex flex-col gap-1">
          <NavLink to="/sign-in" className={navLinkClass}>
            {"Sign In"}
          </NavLink>
          <NavLink to="/chat" className={navLinkClass}>
            {"Chat"}
          </NavLink>
          <NavLink to="/knowledge-base" className={navLinkClass}>
            {"Knowledge Base"}
          </NavLink>
          {isAdmin ? (
            <NavLink to="/users" className={navLinkClass}>
              {"Users & Settings"}
            </NavLink>
          ) : null}
          <NavLink to="/account" className={navLinkClass}>
            {"Account"}
          </NavLink>
          <NavLink to="/docs" className={navLinkClass}>
            {"Documentation"}
          </NavLink>
        </nav>
        {status === "authenticated" ? <SignOutButton /> : null}
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
