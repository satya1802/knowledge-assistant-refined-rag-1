import { render, screen, waitFor } from "@testing-library/react";
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
});
