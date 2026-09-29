/** Standard easing from the design system, as a cubic-bezier tuple for `motion`. */
export const EASE_STANDARD = [0.2, 0, 0, 1] as const;

/** Durations in seconds (motion) — keep within the 150–250ms range. */
export const DURATION = {
  fast: 0.15,
  base: 0.2,
  slow: 0.25,
} as const;
