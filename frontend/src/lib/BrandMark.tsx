import * as React from "react";

import { brand } from "@/lib/brand";

/**
 * The one placeholder brand mark (AC-157). Every colour it draws comes from
 * `lib/brand.ts` -- nothing here is a hard-coded hex -- so replacing those
 * values (or swapping this component's markup for a real asset later)
 * re-brands Sign In, the sidebar header and the assistant avatar at once,
 * with no other code change.
 *
 * Decorative by default (the brand name is always rendered as text next to
 * it); pass `title` when the mark is the only accessible label for its
 * context.
 */
export function BrandMark({
  size = 32,
  className,
  title,
}: {
  size?: number;
  className?: string;
  title?: string;
}) {
  const decorative = !title;
  return (
    <svg
      data-testid="brand-mark"
      role={decorative ? undefined : "img"}
      aria-hidden={decorative ? true : undefined}
      aria-label={decorative ? undefined : title}
      width={size}
      height={size}
      viewBox="0 0 32 32"
      className={className}
    >
      {title ? <title>{title}</title> : null}
      <rect width="32" height="32" rx={8} fill={brand.primaryColor} />
      <circle cx="20.5" cy="20.5" r="7" fill={brand.accentColor} />
      <circle cx="11.5" cy="11.5" r="4" fill={brand.onPrimaryColor} fillOpacity="0.92" />
    </svg>
  );
}

export default BrandMark;
