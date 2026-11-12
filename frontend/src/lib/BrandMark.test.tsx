import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { brand } from "@/lib/brand";
import { BrandMark } from "./BrandMark";

describe("BrandMark", () => {
  it("is decorative by default: hidden from the accessibility tree with no accessible name (AC-157)", () => {
    const { getByTestId } = render(<BrandMark />);
    const svg = getByTestId("brand-mark");
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg).not.toHaveAttribute("role");
    expect(svg).not.toHaveAttribute("aria-label");
    expect(svg.querySelector("title")).toBeNull();
  });

  it("exposes an accessible name via role=img and aria-label when title is passed (AC-157)", () => {
    const { getByTestId } = render(<BrandMark title="Acme" />);
    const svg = getByTestId("brand-mark");
    expect(svg).toHaveAttribute("role", "img");
    expect(svg).toHaveAttribute("aria-label", "Acme");
    expect(svg).not.toHaveAttribute("aria-hidden");
    expect(svg.querySelector("title")).toHaveTextContent("Acme");
  });

  it("draws every fill from lib/brand.ts rather than a hard-coded hex (AC-157)", () => {
    const { getByTestId } = render(<BrandMark title="Acme" />);
    const svg = getByTestId("brand-mark");
    const fills = Array.from(svg.querySelectorAll("rect, circle")).map((el) =>
      el.getAttribute("fill"),
    );
    expect(fills).toEqual([brand.primaryColor, brand.accentColor, brand.onPrimaryColor]);
    expect(svg.outerHTML).not.toMatch(/#[0-9a-fA-F]{3,8}/);
  });

  it("defaults to a 32x32 mark and forwards size and className", () => {
    const { getByTestId, rerender } = render(<BrandMark />);
    let svg = getByTestId("brand-mark");
    expect(svg).toHaveAttribute("width", "32");
    expect(svg).toHaveAttribute("height", "32");

    rerender(<BrandMark size={64} className="avatar" />);
    svg = getByTestId("brand-mark");
    expect(svg).toHaveAttribute("width", "64");
    expect(svg).toHaveAttribute("height", "64");
    expect(svg).toHaveClass("avatar");
  });
});
