import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import Docs from "./Docs";

describe("Docs screen", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("AC-089: renders the Getting Started view with no session and no authenticated fetch on mount", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<Docs />);

    expect(screen.getByRole("tab", { name: "Getting started" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByText("Signing in")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("AC-090: Getting Started explains sign-in, asking questions, citations, the badge and document uploads", () => {
    render(<Docs />);

    expect(screen.getByText(/An administrator provisions your account/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Every question searches the company's indexed documents/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/the source panel: the filename it came from/i)).toBeInTheDocument();
    expect(
      screen.getByText(/"Not from your documents" badge instead of any citations/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/an administrator uploads PDF, DOCX, TXT or MD files/i),
    ).toBeInTheDocument();
  });

  it("AC-091/AC-092: the API Reference view renders without a session and documents the app's own endpoints", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<Docs />);
    await user.click(screen.getByRole("tab", { name: "API reference" }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getAllByText("/conversations").length).toBeGreaterThan(0);
    expect(
      screen.getByText(/q — optional search term; when present, only conversations/i),
    ).toBeInTheDocument();
    expect(screen.getAllByText("/conversations/{id}").length).toBeGreaterThan(0);
    expect(screen.getAllByText("DELETE").length).toBeGreaterThan(0);
    expect(
      screen.getByText(
        /a single JSON body: \{ conversation_id, answer, from_documents, citations/i,
      ),
    ).toBeInTheDocument();
  });

  it("states plainly that this is documentation only, with no external keys, versioning or rate limits", () => {
    render(<Docs />);

    expect(screen.getByText(/This page documents this application only\./i)).toBeInTheDocument();
    expect(
      screen.getByText(
        /No external API keys are issued, and there is no external consumption, versioning or rate-limit scheme/i,
      ),
    ).toBeInTheDocument();
  });
});
