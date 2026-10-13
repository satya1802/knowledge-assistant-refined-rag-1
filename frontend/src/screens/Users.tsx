import * as React from "react";

import { apiFetch, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import * as UI from "@/lib/ui";
import { Icons } from "@/lib/icons";

const { Button, Input, Label, Badge, Table, THead, TBody, TR, TH, TD, Card, CardHeader, CardTitle, CardDescription, CardContent } =
  UI;
const { Plus, Check, X, AlertCircle, CheckCircle, Users: UsersIcon } = Icons;

type UserRow = {
  id: string;
  email: string;
  role: string;
  is_active: boolean;
  created_at: string;
};

type LoadState = "loading" | "loaded" | "error" | "forbidden";

const PW_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

function genPassword(): string {
  let out = "";
  for (let i = 0; i < 16; i++) {
    out += PW_ALPHABET[Math.floor(Math.random() * PW_ALPHABET.length)];
    if (i === 3 || i === 9) out += "-";
  }
  return out;
}

export default function Users() {
  const { status, user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [loadState, setLoadState] = React.useState<LoadState>("loading");
  const [users, setUsers] = React.useState<UserRow[]>([]);
  const [newEmail, setNewEmail] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  const [createError, setCreateError] = React.useState("");
  const [justCreated, setJustCreated] = React.useState<{ email: string; password: string } | null>(
    null,
  );
  const [copied, setCopied] = React.useState(false);
  const [actionError, setActionError] = React.useState("");

  const load = React.useCallback(async () => {
    setLoadState("loading");
    try {
      const rows = await apiFetch<UserRow[]>("/users");
      setUsers(rows);
      setLoadState("loaded");
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setLoadState("forbidden");
      } else {
        setLoadState("error");
      }
    }
  }, []);

  React.useEffect(() => {
    if (status === "loading") return;
    if (!isAdmin) {
      setLoadState("forbidden");
      return;
    }
    void load();
  }, [status, isAdmin, load]);

  if (status === "loading") {
    return (
      <div className="p-6">
        <p className="text-sm text-[var(--brand-fg-muted)]">{"Loading…"}</p>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="p-6">
        <Card>
          <CardHeader>
            <CardTitle>{"Users & Settings"}</CardTitle>
            <CardDescription>{"This is not available to your role."}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError("");
    setCreating(true);
    const tempPassword = genPassword();
    try {
      await apiFetch<UserRow>("/users", {
        method: "POST",
        body: JSON.stringify({ email: newEmail, password: tempPassword }),
      });
      setJustCreated({ email: newEmail, password: tempPassword });
      setCopied(false);
      setNewEmail("");
      await load();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setCreateError("A user with that email already exists.");
      } else {
        setCreateError("Something went wrong creating the user. Try again.");
      }
    } finally {
      setCreating(false);
    }
  };

  const toggleActive = async (row: UserRow) => {
    setActionError("");
    try {
      const updated = await apiFetch<UserRow>(`/users/${row.id}`, {
        method: "PATCH",
        body: JSON.stringify({ is_active: !row.is_active }),
      });
      setUsers((prev) => prev.map((u) => (u.id === row.id ? updated : u)));
    } catch {
      setActionError("Couldn't update that user. Try again.");
    }
  };

  const toggleAdmin = async (row: UserRow) => {
    setActionError("");
    const nextRole = row.role === "admin" ? "user" : "admin";
    try {
      const updated = await apiFetch<UserRow>(`/users/${row.id}`, {
        method: "PATCH",
        body: JSON.stringify({ role: nextRole }),
      });
      setUsers((prev) => prev.map((u) => (u.id === row.id ? updated : u)));
    } catch {
      setActionError("Couldn't update that user's role. Try again.");
    }
  };

  const copyPassword = async () => {
    if (!justCreated) return;
    try {
      await navigator.clipboard.writeText(justCreated.password);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-lg font-semibold" style={{ fontFamily: "var(--brand-font-heading)" }}>
          {"Users & Settings"}
        </h1>
        <p className="text-sm text-[var(--brand-fg-muted)]">
          {"Provision accounts and manage access."}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{"Add a user"}</CardTitle>
          <CardDescription>
            {"A one-time temporary password is generated here. No email is sent -- copy it now."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreate} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <Label htmlFor="new-user-email">{"Email"}</Label>
              <Input
                id="new-user-email"
                type="email"
                required
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="name@company.com"
              />
            </div>
            <Button type="submit" disabled={creating || !newEmail}>
              <Plus size={16} />
              {creating ? "Creating…" : "Create user"}
            </Button>
          </form>
          {createError ? (
            <p role="alert" className="mt-2 flex items-center gap-1 text-sm text-red-400">
              <AlertCircle size={14} /> {createError}
            </p>
          ) : null}

          {justCreated ? (
            <div
              className="mt-4 rounded-[var(--brand-radius)] border p-3 text-sm"
              style={{ borderColor: "var(--brand-border)", backgroundColor: "var(--brand-hover)" }}
            >
              <p className="flex items-center gap-1 font-medium">
                <CheckCircle size={14} /> {`Temporary password for ${justCreated.email}`}
              </p>
              <p className="mt-1 text-[var(--brand-fg-muted)]">
                {"This password is shown once and is not sent by email. Copy it now -- it will not be shown again."}
              </p>
              <div className="mt-2 flex items-center gap-2">
                <code
                  data-testid="temp-password"
                  className="rounded bg-black/20 px-2 py-1 font-mono text-sm"
                >
                  {justCreated.password}
                </code>
                <Button type="button" variant="secondary" size="sm" onClick={copyPassword}>
                  {copied ? <Check size={14} /> : null}
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {actionError ? (
        <p role="alert" className="flex items-center gap-1 text-sm text-red-400">
          <AlertCircle size={14} /> {actionError}
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{"All users"}</CardTitle>
        </CardHeader>
        <CardContent>
          {loadState === "loading" ? (
            <p className="text-sm text-[var(--brand-fg-muted)]">{"Loading users…"}</p>
          ) : loadState === "error" ? (
            <div className="flex flex-col items-start gap-2">
              <p role="alert" className="flex items-center gap-1 text-sm text-red-400">
                <AlertCircle size={14} /> {"Couldn't load users. Try again."}
              </p>
              <Button type="button" variant="secondary" size="sm" onClick={() => void load()}>
                {"Retry"}
              </Button>
            </div>
          ) : loadState === "forbidden" ? (
            <p className="text-sm text-[var(--brand-fg-muted)]">
              {"This is not available to your role."}
            </p>
          ) : users.length === 0 ? (
            <p className="flex items-center gap-1 text-sm text-[var(--brand-fg-muted)]">
              <UsersIcon size={14} /> {"No users yet."}
            </p>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>{"Email"}</TH>
                  <TH>{"Role"}</TH>
                  <TH>{"Status"}</TH>
                  <TH>{"Created"}</TH>
                  <TH>{"Actions"}</TH>
                </TR>
              </THead>
              <TBody>
                {users.map((row) => (
                  <TR key={row.id}>
                    <TD>{row.email}</TD>
                    <TD>
                      <Badge variant={row.role === "admin" ? "accent" : "default"}>
                        {row.role}
                      </Badge>
                    </TD>
                    <TD>
                      <Badge variant={row.is_active ? "success" : "danger"}>
                        {row.is_active ? "Active" : "Disabled"}
                      </Badge>
                    </TD>
                    <TD>{new Date(row.created_at).toLocaleDateString()}</TD>
                    <TD>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => void toggleActive(row)}
                        >
                          {row.is_active ? <X size={14} /> : <Check size={14} />}
                          {row.is_active ? "Disable" : "Enable"}
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => void toggleAdmin(row)}
                        >
                          {row.role === "admin" ? "Remove admin" : "Make admin"}
                        </Button>
                      </div>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
