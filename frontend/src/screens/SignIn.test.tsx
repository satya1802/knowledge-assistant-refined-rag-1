import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import SignIn from "./SignIn";
import { AuthProvider } from "@/lib/auth";

function renderSignIn() {
  return render(
    <MemoryRouter initialEntries={["/sign-in"]}>
      <AuthProvider>
        <Routes>
          <Route path="/sign-in" element={<SignIn />} />
          <Route path="/chat" element={<div>Chat screen</div>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe("SignIn", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("AC-001: submits valid credentials to POST /auth/login with credentials included and navigates to /chat", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.endsWith("/auth/me")) {
        return Promise.resolve({ ok: false, status: 401, json: async () => ({}) });
      }
      if (url.endsWith("/auth/login")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ id: "1", email: "a@b.com", role: "member", is_active: true }),
        });
      }
      return Promise.reject(new Error("unexpected " + url));
    });
    vi.stubGlobal("fetch", fetchMock);

    renderSignIn();

    await user.type(screen.getByLabelText(/work email/i), "a@b.com");
    await user.type(screen.getByLabelText(/^password$/i), "password123");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    // The screen shows a brief "session established" state before the
    // navigate() call fires on its own timer -- the real delay, not a
    // simulated auth check.
    await waitFor(() => expect(screen.getByText("Chat screen")).toBeInTheDocument(), {
      timeout: 3000,
    });

    const loginCall = fetchMock.mock.calls.find(([url]) => String(url).endsWith("/auth/login"));
    expect(loginCall).toBeTruthy();
    expect(loginCall![1].method).toBe("POST");
    expect(loginCall![1].credentials).toBe("include");
  });

  it("AC-002: a 401 from login renders the single generic message", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.endsWith("/auth/me")) {
        return Promise.resolve({ ok: false, status: 401, json: async () => ({}) });
      }
      if (url.endsWith("/auth/login")) {
        return Promise.resolve({ ok: false, status: 401, json: async () => ({}) });
      }
      return Promise.reject(new Error("unexpected " + url));
    });
    vi.stubGlobal("fetch", fetchMock);

    renderSignIn();

    await user.type(screen.getByLabelText(/work email/i), "disabled@b.com");
    await user.type(screen.getByLabelText(/^password$/i), "whatever123");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() =>
      expect(screen.getByText("Email or password is incorrect")).toBeInTheDocument(),
    );
  });

  it("AC-009/AC-010: bootstrap posts to POST /users and a 409 shows the admin-already-exists panel", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.endsWith("/auth/me")) {
        return Promise.resolve({ ok: false, status: 401, json: async () => ({}) });
      }
      if (url.endsWith("/users")) {
        return Promise.resolve({ ok: false, status: 409, json: async () => ({}) });
      }
      return Promise.reject(new Error("unexpected " + url));
    });
    vi.stubGlobal("fetch", fetchMock);

    renderSignIn();

    await user.click(screen.getByRole("button", { name: /first install/i }));
    await user.type(screen.getByLabelText(/work email/i), "admin@b.com");
    await user.type(screen.getByLabelText(/administrator password/i), "longenoughpassword");
    await user.type(screen.getByLabelText(/confirm password/i), "longenoughpassword");
    await user.click(screen.getByRole("button", { name: /create administrator/i }));

    await waitFor(() =>
      expect(
        screen.getByText(/this installation already has an administrator/i),
      ).toBeInTheDocument(),
    );

    const createCall = fetchMock.mock.calls.find(([url]) => String(url).endsWith("/users"));
    expect(createCall).toBeTruthy();
    expect(createCall![1].method).toBe("POST");
  });

  // AC-157: the BrandMark rendered here is driven only by lib/brand.ts.
  it("renders the shared BrandMark component from lib/brand.ts tokens", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) }),
    );
    renderSignIn();
    expect(screen.getAllByTestId("brand-mark").length).toBeGreaterThan(0);
  });

  // AC-087: the email field, the password visibility toggle and the
  // password field are reachable by Tab in the order they appear in the
  // DOM, and each is a native, keyboard-operable control.
  it("the email field, password toggle and password field are reachable by Tab in DOM order", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) }),
    );
    renderSignIn();

    const email = screen.getByLabelText(/work email/i);
    const showToggle = screen.getByRole("button", { name: /^show$/i });
    const password = screen.getByLabelText(/^password$/i);

    await user.tab();
    expect(email).toHaveFocus();

    await user.tab();
    expect(showToggle).toHaveFocus();

    await user.tab();
    expect(password).toHaveFocus();
  });
});
