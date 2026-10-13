import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import Account from "./Account";
import { AuthProvider } from "@/lib/auth";
import { ThemeProvider } from "@/lib/theme";

type Overrides = {
  password?: (
    init: RequestInit,
  ) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;
  theme?: (
    init: RequestInit,
  ) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;
};

function mockFetch(overrides: Overrides = {}) {
  return vi.fn().mockImplementation((url: string, init: RequestInit = {}) => {
    if (url.endsWith("/auth/me")) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          user: {
            id: "1",
            email: "dana@example.com",
            role: "member",
            is_active: true,
            theme: "dark",
          },
        }),
      });
    }
    if (url.endsWith("/account/password") && init.method === "POST") {
      return overrides.password
        ? overrides.password(init)
        : Promise.resolve({ ok: true, status: 204, json: async () => ({}) });
    }
    if (url.endsWith("/account/theme") && init.method === "PATCH") {
      return overrides.theme
        ? overrides.theme(init)
        : Promise.resolve({ ok: true, status: 200, json: async () => ({ endpoint: "x" }) });
    }
    if (url.endsWith("/auth/logout")) {
      return Promise.resolve({ ok: true, status: 204, json: async () => ({}) });
    }
    return Promise.reject(new Error("unexpected " + url));
  });
}

function renderAccount() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <ThemeProvider>
          <Account />
        </ThemeProvider>
      </AuthProvider>
    </MemoryRouter>,
  );
}

async function fillValidPasswordForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Current password"), "oldpassword1");
  await user.type(screen.getByLabelText("New password"), "newpassword123");
  await user.type(screen.getByLabelText("Confirm new password"), "newpassword123");
}

describe("Account screen", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    document.documentElement.removeAttribute("style");
  });

  it("AC-080: submitting current + valid new password calls POST /account/password and shows confirmation", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch();
    vi.stubGlobal("fetch", fetchMock);
    renderAccount();

    await waitFor(() => expect(screen.getByLabelText("Current password")).toBeInTheDocument());
    await fillValidPasswordForm(user);
    await user.click(screen.getByRole("button", { name: /update password/i }));

    await waitFor(() => expect(screen.getByText("Password updated")).toBeInTheDocument());
    const call = fetchMock.mock.calls.find(([url]) => String(url).endsWith("/account/password"));
    expect(call).toBeTruthy();
    expect(JSON.parse(call![1].body)).toEqual({
      current_password: "oldpassword1",
      new_password: "newpassword123",
    });
  });

  it("AC-081: a server rejection of the current password shows a clear error and leaves the form usable", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      mockFetch({
        password: () => Promise.resolve({ ok: false, status: 401, json: async () => ({}) }),
      }),
    );
    renderAccount();

    await waitFor(() => expect(screen.getByLabelText("Current password")).toBeInTheDocument());
    await fillValidPasswordForm(user);
    await user.click(screen.getByRole("button", { name: /update password/i }));

    await waitFor(() => expect(screen.getByText("Password not changed")).toBeInTheDocument());
    expect(screen.queryByText("Password updated")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /update password/i })).toBeEnabled();
    expect(screen.getByLabelText("Current password")).not.toBeDisabled();
  });

  it("AC-083/AC-084: selecting a theme updates the shared palette and saves via PATCH /account/theme", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch();
    vi.stubGlobal("fetch", fetchMock);
    renderAccount();

    await waitFor(() => expect(screen.getByRole("radio", { name: /^Light/ })).toBeInTheDocument());
    await user.click(screen.getByRole("radio", { name: /^Light/ }));

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([url, init]) => String(url).endsWith("/account/theme") && init?.method === "PATCH",
        ),
      ).toBe(true),
    );
    const call = fetchMock.mock.calls.find(([url]) => String(url).endsWith("/account/theme"));
    expect(JSON.parse(call![1].body)).toEqual({ theme: "light" });
    await waitFor(() =>
      expect(document.documentElement.style.getPropertyValue("--brand-surface")).toBe("#ffffff"),
    );
  });
});
