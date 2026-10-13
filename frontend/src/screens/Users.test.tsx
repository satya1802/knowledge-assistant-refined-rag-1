import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import Users from "./Users";
import { AuthProvider } from "@/lib/auth";

const ADMIN_ME = { id: "u1", email: "admin@co.com", role: "admin", is_active: true };
const MEMBER_ME = { id: "u2", email: "member@co.com", role: "user", is_active: true };

function mockFetchSequence(
  handlers: Record<string, (init?: RequestInit) => Response | Promise<Response>>,
) {
  return vi.fn().mockImplementation((url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    for (const key of Object.keys(handlers)) {
      const [m, path] = key.split(" ");
      if (m === method && url.endsWith(path)) {
        return Promise.resolve(handlers[key](init));
      }
    }
    return Promise.reject(new Error(`unhandled ${method} ${url}`));
  });
}

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

function renderUsers() {
  return render(
    <AuthProvider>
      <Users />
    </AuthProvider>,
  );
}

describe("Users screen", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("shows a 'not available to your role' state for a standard user, without calling GET /users", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetchSequence({
        "GET /auth/me": () => jsonResponse(200, MEMBER_ME),
      }),
    );
    renderUsers();
    await waitFor(() =>
      expect(screen.getByText(/not available to your role/i)).toBeInTheDocument(),
    );
  });

  it("renders a loading state then the user list on success", async () => {
    const rows = [
      {
        id: "a1",
        email: "dana@co.com",
        role: "admin",
        is_active: true,
        created_at: "2026-01-01T00:00:00Z",
      },
      {
        id: "a2",
        email: "sam@co.com",
        role: "user",
        is_active: false,
        created_at: "2026-01-02T00:00:00Z",
      },
    ];
    vi.stubGlobal(
      "fetch",
      mockFetchSequence({
        "GET /auth/me": () => jsonResponse(200, ADMIN_ME),
        "GET /users": () => jsonResponse(200, rows),
      }),
    );
    renderUsers();
    await waitFor(() => expect(screen.getByText("dana@co.com")).toBeInTheDocument());
    expect(screen.getByText("sam@co.com")).toBeInTheDocument();
  });

  it("renders an empty state when GET /users returns no rows", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetchSequence({
        "GET /auth/me": () => jsonResponse(200, ADMIN_ME),
        "GET /users": () => jsonResponse(200, []),
      }),
    );
    renderUsers();
    await waitFor(() => expect(screen.getByText(/no users yet/i)).toBeInTheDocument());
  });

  it("renders an error state when GET /users fails", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetchSequence({
        "GET /auth/me": () => jsonResponse(200, ADMIN_ME),
        "GET /users": () => jsonResponse(500, {}),
      }),
    );
    renderUsers();
    await waitFor(() => expect(screen.getByText(/couldn't load users/i)).toBeInTheDocument());
  });

  it("renders the forbidden state when GET /users answers 403", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetchSequence({
        "GET /auth/me": () => jsonResponse(200, ADMIN_ME),
        "GET /users": () => jsonResponse(403, {}),
      }),
    );
    renderUsers();
    await waitFor(() =>
      expect(screen.getByText(/not available to your role/i)).toBeInTheDocument(),
    );
  });

  it("creates a user, posting email + a generated temp password, and shows it once with a copy affordance", async () => {
    const user = userEvent.setup();
    const postCalls: unknown[] = [];
    vi.stubGlobal(
      "fetch",
      mockFetchSequence({
        "GET /auth/me": () => jsonResponse(200, ADMIN_ME),
        "GET /users": () => jsonResponse(200, []),
        "POST /users": (init) => {
          postCalls.push(JSON.parse(String(init?.body)));
          return jsonResponse(201, {
            id: "new1",
            email: "new@co.com",
            role: "user",
            is_active: true,
            created_at: "2026-01-03T00:00:00Z",
          });
        },
      }),
    );
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });

    renderUsers();
    await waitFor(() => expect(screen.getByText(/no users yet/i)).toBeInTheDocument());

    await user.type(screen.getByLabelText(/email/i), "new@co.com");
    await user.click(screen.getByRole("button", { name: /create user/i }));

    await waitFor(() => expect(screen.getByTestId("temp-password")).toBeInTheDocument());
    expect(screen.getByText(/not sent by email/i)).toBeInTheDocument();
    expect(postCalls[0]).toMatchObject({ email: "new@co.com" });
    expect((postCalls[0] as { password: string }).password).toBeTruthy();

    await user.click(screen.getByRole("button", { name: /copy/i }));
    expect(writeText).toHaveBeenCalledWith((postCalls[0] as { password: string }).password);
  });

  it("calls PATCH /users/{id} to disable a user and reflects the response", async () => {
    const user = userEvent.setup();
    const rows = [
      {
        id: "a1",
        email: "dana@co.com",
        role: "user",
        is_active: true,
        created_at: "2026-01-01T00:00:00Z",
      },
    ];
    vi.stubGlobal(
      "fetch",
      mockFetchSequence({
        "GET /auth/me": () => jsonResponse(200, ADMIN_ME),
        "GET /users": () => jsonResponse(200, rows),
        "PATCH /users/a1": () =>
          jsonResponse(200, {
            id: "a1",
            email: "dana@co.com",
            role: "user",
            is_active: false,
            created_at: "2026-01-01T00:00:00Z",
          }),
      }),
    );
    renderUsers();
    await waitFor(() => expect(screen.getByText("dana@co.com")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: /disable/i }));
    await waitFor(() => expect(screen.getByText("Disabled")).toBeInTheDocument());
  });

  it("calls PATCH /users/{id} to grant admin", async () => {
    const user = userEvent.setup();
    const rows = [
      {
        id: "a1",
        email: "dana@co.com",
        role: "user",
        is_active: true,
        created_at: "2026-01-01T00:00:00Z",
      },
    ];
    vi.stubGlobal(
      "fetch",
      mockFetchSequence({
        "GET /auth/me": () => jsonResponse(200, ADMIN_ME),
        "GET /users": () => jsonResponse(200, rows),
        "PATCH /users/a1": () =>
          jsonResponse(200, {
            id: "a1",
            email: "dana@co.com",
            role: "admin",
            is_active: true,
            created_at: "2026-01-01T00:00:00Z",
          }),
      }),
    );
    renderUsers();
    await waitFor(() => expect(screen.getByText("dana@co.com")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: /make admin/i }));
    await waitFor(() => {
      const row = screen.getByText("dana@co.com").closest("tr") as HTMLElement;
      expect(within(row).getByText("admin")).toBeInTheDocument();
    });
  });
});
