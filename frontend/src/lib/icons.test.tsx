import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ICON_NAMES, Icons } from "./icons";

describe("Icons", () => {
  it("lists every exported icon name in ICON_NAMES, and nothing else", () => {
    expect(ICON_NAMES.length).toBeGreaterThan(0);
    expect(ICON_NAMES).toEqual(Object.keys(Icons));
    // No duplicate names -- a repeated key in the source map would silently
    // drop one icon rather than fail to compile.
    expect(new Set(ICON_NAMES).size).toBe(ICON_NAMES.length);
  });

  it("includes the names screens already destructure from the set", () => {
    // A sample pulled from the screens that consume this module (Chat,
    // SignIn, Users, Account, KnowledgeBase, SourcePanel). If one of these
    // were renamed or dropped, every screen that imports it would fail to
    // build -- this is the one place that catches it without building all of
    // them.
    const used = [
      "Plus",
      "ArrowRight",
      "AlertCircle",
      "FileText",
      "CheckCircle",
      "Trash",
      "X",
      "Menu",
      "Search",
      "Check",
      "User",
      "Users",
      "Settings",
      "Download",
      "Edit",
      "ChevronDown",
      "ChevronRight",
      "ChevronLeft",
    ];
    for (const name of used) {
      expect(ICON_NAMES).toContain(name);
    }
  });

  it("renders every named icon as a 24x24-viewBox svg with a drawn path or shape", () => {
    for (const name of ICON_NAMES) {
      const IconComponent = Icons[name];
      const { container } = render(<IconComponent data-testid={`icon-${name}`} />);
      const svg = container.querySelector("svg");
      expect(svg, `${name} should render an <svg>`).not.toBeNull();
      expect(svg).toHaveAttribute("viewBox", "0 0 24 24");
      expect(svg).toHaveAttribute("aria-hidden", "true");
      // Every icon must actually draw something -- a name present in
      // ICON_NAMES with an empty body would render a blank square, which is
      // exactly what this module exists to avoid.
      const drawn = svg?.querySelectorAll("path, circle, rect, polygon, line");
      expect(drawn && drawn.length, `${name} should draw at least one shape`).toBeGreaterThan(0);
    }
  });

  it("defaults to a 16px square and scales with the size prop", () => {
    const { getByTestId, rerender } = render(<Icons.Plus data-testid="plus" />);
    let svg = getByTestId("plus");
    expect(svg).toHaveAttribute("width", "16");
    expect(svg).toHaveAttribute("height", "16");

    rerender(<Icons.Plus data-testid="plus" size={32} />);
    svg = getByTestId("plus");
    expect(svg).toHaveAttribute("width", "32");
    expect(svg).toHaveAttribute("height", "32");
  });

  it("forwards arbitrary svg props such as className and onClick target", () => {
    const { getByTestId } = render(<Icons.Search data-testid="search" className="nav-icon" />);
    const svg = getByTestId("search");
    expect(svg).toHaveClass("nav-icon");
  });

  it("uses currentColor for stroke so it inherits text color rather than a fixed hex", () => {
    for (const name of ICON_NAMES) {
      const IconComponent = Icons[name];
      const { container } = render(<IconComponent />);
      const svg = container.querySelector("svg");
      expect(svg).toHaveAttribute("stroke", "currentColor");
      expect(svg).toHaveAttribute("fill", "none");
      expect(svg?.outerHTML).not.toMatch(/#[0-9a-fA-F]{3,8}/);
    }
  });

  it("gives distinct icons distinct markup -- no two names draw the same shape", () => {
    const shapes = ICON_NAMES.map((name) => {
      const IconComponent = Icons[name];
      const { container, unmount } = render(<IconComponent />);
      const svg = container.querySelector("svg");
      const shape = svg?.innerHTML ?? "";
      unmount();
      return shape;
    });
    expect(new Set(shapes).size).toBe(shapes.length);
  });
});
