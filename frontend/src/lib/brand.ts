/**
 * The single source of brand values (AC-157). Every screen reads these --
 * directly (SignIn.tsx, which derives its own palette in JS) or indirectly
 * through the matching `--brand-*` CSS custom properties in `index.css`
 * (App.tsx, lib/ui.tsx, every other screen). Replacing the values below (and
 * the matching tokens in index.css, plus the favicon asset) re-brands the
 * whole app with no other code change.
 *
 * Contrast check (WCAG AA — 4.5:1 body text, 3:1 large text/interactive
 * boundaries), computed against this file's `backgroundColor` (#0E1620),
 * which is the fixed dark surface SignIn.tsx renders against regardless of
 * the user's light/dark preference:
 *   - errorColor  (#FF6B6B) vs backgroundColor (#0E1620): ~6.6:1  (passes body text)
 *   - warningColor(#FFC168) vs backgroundColor (#0E1620): ~11.3:1 (passes body text)
 *   - accentColor (#45A56D) vs backgroundColor (#0E1620): ~5.9:1  (passes body text)
 *   - onPrimaryColor (#FFFFFF) vs primaryColor (#344794): ~8.5:1 (passes body text)
 * Note: primaryColor (#344794, navy) is intentionally *not* used as a text
 * colour directly on the dark background -- navy-on-near-black fails AA, so
 * SignIn.tsx only paints it as a solid fill (buttons) with onPrimaryColor
 * text, and lightens it (via the file's own `lighten()` helper) wherever it
 * needs to read as a link/label colour. The equivalent rest-of-app tokens,
 * which additionally support the light theme, live in index.css with the
 * same ratios re-checked against both the light and dark surfaces.
 */
export const brand = {
  primaryColor: "#344794",
  accentColor: "#45A56D",
  errorColor: "#FF6B6B",
  warningColor: "#FFC168",
  onPrimaryColor: "#FFFFFF",
  neutralColor: "#8795A6",
  backgroundColor: "#0E1620",
  radius: "0.5rem",
  fontHeading: "Inter, system-ui, sans-serif",
  fontBody: "Inter, system-ui, sans-serif",
  density: "compact",
} as const;
