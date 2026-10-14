import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import App from "./App";
import { AuthProvider } from "@/lib/auth";

describe("App", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) }),
    );
  });

  it("renders without crashing and shows the first screen's nav link", async () => {
    render(
      <MemoryRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </MemoryRouter>,
    );
    // getAllByText, not getByText: the first screen's page content may repeat
    // the text its nav link carries, and two matches must not fail the smoke test.
    await waitFor(() => expect(screen.getAllByText("Sign In").length).toBeGreaterThan(0));
  });

  it("redirects an unauthenticated visit to a protected route back to sign-in", async () => {
    render(
      <MemoryRouter initialEntries={["/chat"]}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getAllByText("Sign In").length).toBeGreaterThan(0));
  });

  it("renders the Docs route without requiring sign-in", async () => {
    render(
      <MemoryRouter initialEntries={["/docs"]}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getAllByText("Documentation").length).toBeGreaterThan(0));
  });

  // AC-157: the shell's BrandMark renders purely from lib/brand.ts tokens.
  it("renders the shared BrandMark in the sidebar header", async () => {
    render(
      <MemoryRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getAllByText("Sign In").length).toBeGreaterThan(0));
    expect(screen.getAllByTestId("brand-mark").length).toBeGreaterThan(0);
  });

  // AC-087/AC-088: the phone-width nav toggle is reachable by Tab and
  // operable by both Enter and Space, and it drives the sidebar's collapsed
  // state via aria-expanded.
  it("the sidebar nav toggle is keyboard-operable with Enter and Space", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getAllByText("Sign In").length).toBeGreaterThan(0));

    const toggle = screen.getByRole("button", { name: /toggle navigation/i });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveAttribute("aria-controls", "app-sidebar");

    toggle.focus();
    expect(toggle).toHaveFocus();

    await user.keyboard("{Enter}");
    expect(toggle).toHaveAttribute("aria-expanded", "true");

    await user.keyboard(" ");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });
});
