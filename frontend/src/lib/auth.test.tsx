import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthProvider, useAuth } from "./auth";

function Consumer() {
  const { status, user, login, bootstrap, logout } = useAuth();
  return (
    <div>
      <span data-testid="status">{status}</span>
      <span data-testid="email">{user?.email ?? ""}</span>
      <button onClick={() => login("a@b.com", "pw")}>login</button>
      <button onClick={() => bootstrap("admin@b.com", "longenoughpw")}>bootstrap</button>
      <button onClick={() => logout()}>logout</button>
    </div>
  );
}

function renderConsumer() {
  return render(
    <AuthProvider>
      <Consumer />
    </AuthProvider>,
  );
}

describe("AuthProvider / useAuth", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("restores the session from GET /auth/me on load (AC-004)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ id: "1", email: "a@b.com", role: "member", is_active: true }),
      }),
    );
    renderConsumer();
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("authenticated"));
    expect(screen.getByTestId("email")).toHaveTextContent("a@b.com");
  });

  it("is unauthenticated when GET /auth/me returns 401", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) }),
    );
    renderConsumer();
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("unauthenticated"));
  });

  it("sends credentials: include on every request", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);
    renderConsumer();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [, init] = fetchMock.mock.calls[0];
    expect(init.credentials).toBe("include");
  });

  it("login() authenticates on success", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url.endsWith("/auth/me")) {
          return Promise.resolve({ ok: false, status: 401, json: async () => ({}) });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ id: "1", email: "a@b.com", role: "member", is_active: true }),
        });
      }),
    );
    renderConsumer();
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("unauthenticated"));
    await user.click(screen.getByText("login"));
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("authenticated"));
  });

  it("logout() clears state and calls POST /auth/logout", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.endsWith("/auth/me")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ id: "1", email: "a@b.com", role: "member", is_active: true }),
        });
      }
      if (url.endsWith("/auth/logout")) {
        return Promise.resolve({ ok: true, status: 204, json: async () => ({}) });
      }
      return Promise.reject(new Error("unexpected " + url));
    });
    vi.stubGlobal("fetch", fetchMock);
    renderConsumer();
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("authenticated"));
    await user.click(screen.getByText("logout"));
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("unauthenticated"));
    const logoutCall = fetchMock.mock.calls.find(([url]) => url.endsWith("/auth/logout"));
    expect(logoutCall).toBeTruthy();
    expect(logoutCall![1].method).toBe("POST");
  });

  it("bootstrap() reports alreadyExists on 409", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url.endsWith("/auth/me")) {
          return Promise.resolve({ ok: false, status: 401, json: async () => ({}) });
        }
        if (url.endsWith("/users")) {
          return Promise.resolve({ ok: false, status: 409, json: async () => ({}) });
        }
        return Promise.reject(new Error("unexpected " + url));
      }),
    );
    const results: unknown[] = [];
    function BootstrapConsumer() {
      const { bootstrap, status } = useAuth();
      return (
        <div>
          <span data-testid="status">{status}</span>
          <button
            onClick={async () => {
              results.push(await bootstrap("admin@b.com", "longenoughpw"));
            }}
          >
            bootstrap
          </button>
        </div>
      );
    }
    render(
      <AuthProvider>
        <BootstrapConsumer />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("unauthenticated"));
    await user.click(screen.getByText("bootstrap"));
    await waitFor(() => expect(results.length).toBe(1));
    expect(results[0]).toEqual({ ok: false, alreadyExists: true });
  });
});
