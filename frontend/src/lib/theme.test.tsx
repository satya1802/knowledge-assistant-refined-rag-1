import { act, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ThemeProvider, useTheme } from "./theme";

function mockMatchMedia(initial = false) {
  let listener: ((event: { matches: boolean }) => void) | undefined;
  const mql = {
    matches: initial,
    media: "(prefers-color-scheme: dark)",
    onchange: null,
    addEventListener: (_: string, cb: (event: { matches: boolean }) => void) => {
      listener = cb;
    },
    removeEventListener: () => {},
    addListener: (cb: (event: { matches: boolean }) => void) => {
      listener = cb;
    },
    removeListener: () => {},
    dispatchEvent: () => true,
  };
  window.matchMedia = vi.fn().mockReturnValue(mql) as unknown as typeof window.matchMedia;
  return {
    fire(matches: boolean) {
      mql.matches = matches;
      listener?.({ matches });
    },
  };
}

function Consumer() {
  const { theme, effectiveTheme, setTheme } = useTheme();
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <span data-testid="effective">{effectiveTheme}</span>
      <button onClick={() => setTheme("light")}>light</button>
    </div>
  );
}

function renderWithProvider() {
  return render(
    <ThemeProvider>
      <Consumer />
    </ThemeProvider>,
  );
}

describe("ThemeProvider", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    document.documentElement.removeAttribute("style");
  });

  it("restores the saved preference from GET /auth/me rather than localStorage (AC-084)", async () => {
    mockMatchMedia(false);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ user: { theme: "light" } }),
      }),
    );
    const { getByTestId } = renderWithProvider();
    await waitFor(() => expect(getByTestId("theme")).toHaveTextContent("light"));
  });

  it("defaults to system when GET /auth/me fails", async () => {
    mockMatchMedia(true);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) }),
    );
    const { getByTestId } = renderWithProvider();
    await waitFor(() => expect(getByTestId("theme")).toHaveTextContent("system"));
    expect(getByTestId("effective")).toHaveTextContent("dark");
  });

  it("follows the OS while System is selected and the app stays open (AC-085)", async () => {
    const media = mockMatchMedia(false);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ user: { theme: "system" } }),
      }),
    );
    const { getByTestId } = renderWithProvider();
    await waitFor(() => expect(getByTestId("effective")).toHaveTextContent("light"));
    act(() => media.fire(true));
    await waitFor(() => expect(getByTestId("effective")).toHaveTextContent("dark"));
  });

  it("setTheme sends PATCH /account/theme and applies the palette immediately (AC-083)", async () => {
    mockMatchMedia(false);
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.endsWith("/auth/me")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ user: { theme: "dark" } }),
        });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ endpoint: "x" }) });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { getByText, getByTestId } = renderWithProvider();
    await waitFor(() => expect(getByTestId("theme")).toHaveTextContent("dark"));

    await act(async () => {
      getByText("light").click();
    });

    await waitFor(() => expect(getByTestId("theme")).toHaveTextContent("light"));
    const patchCall = fetchMock.mock.calls.find(([url]) => url.endsWith("/account/theme"));
    expect(patchCall).toBeTruthy();
    expect(patchCall![1].method).toBe("PATCH");
    expect(JSON.parse(patchCall![1].body)).toEqual({ theme: "light" });
    expect(document.documentElement.style.getPropertyValue("--brand-surface")).toBe("#ffffff");
  });

  it("reverts the preference if the server rejects the PATCH", async () => {
    mockMatchMedia(false);
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.endsWith("/auth/me")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ user: { theme: "dark" } }),
        });
      }
      if (url.endsWith("/account/theme")) {
        return Promise.resolve({ ok: false, status: 500, json: async () => ({}) });
      }
      return Promise.reject(new Error("unexpected " + url + " " + init?.method));
    });
    vi.stubGlobal("fetch", fetchMock);
    const { getByText, getByTestId } = renderWithProvider();
    await waitFor(() => expect(getByTestId("theme")).toHaveTextContent("dark"));

    await act(async () => {
      getByText("light").click();
    });

    await waitFor(() => expect(getByTestId("theme")).toHaveTextContent("dark"));
  });
});
