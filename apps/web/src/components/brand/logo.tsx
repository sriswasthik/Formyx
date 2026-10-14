import { cx } from '@/lib/cx';
import { ICON_RADIUS, logoShapes } from './logo-geometry';

export type LogoVariant = 'mark' | 'icon' | 'full';

interface LogoProps {
  /**
   * `mark`: the three shapes in the current text colour. `icon`: the mark on a rounded
   * square, which inverts with the theme. `full`: the icon and the "Formyx" wordmark.
   */
  variant?: LogoVariant;
  /** Height in px of the mark or icon (in `full`, of its icon; the wordmark scales with it). */
  size?: number;
  className?: string;
  /** Hidden from assistive technology, for when visible text or its link already names it. */
  decorative?: boolean;
}

/** The wordmark's size relative to the icon: 24px → 16px text, 36 → 24, 48 → 32. */
const WORDMARK_RATIO = 2 / 3;
/** The space between icon and wordmark, relative to the wordmark's size. */
const GAP_RATIO = 0.4;

function LogoSvg({
  variant,
  size,
  className,
}: {
  variant: 'mark' | 'icon';
  size: number;
  className?: string | undefined;
}) {
  const icon = variant === 'icon';
  return (
    <svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      aria-hidden
      focusable="false"
      className={cx('shrink-0', className)}
    >
      {icon && <rect width="32" height="32" rx={ICON_RADIUS} className="fill-foreground" />}
      <g className={icon ? 'fill-background' : 'fill-current'}>
        {logoShapes(size).map((shape) => (
          <rect key={shape.y} {...shape} />
        ))}
      </g>
    </svg>
  );
}

/** The Formyx logo. */
export function Logo({ variant = 'full', size = 24, className, decorative = false }: LogoProps) {
  const label = decorative ? { 'aria-hidden': true } : { role: 'img', 'aria-label': 'Formyx' };

  if (variant !== 'full') {
    return (
      <span {...label} className={cx('inline-flex shrink-0', className)}>
        <LogoSvg variant={variant} size={size} />
      </span>
    );
  }

  const textSize = size * WORDMARK_RATIO;
  return (
    <span
      {...label}
      className={cx('inline-flex shrink-0 items-center', className)}
      style={{ gap: textSize * GAP_RATIO }}
    >
      <LogoSvg variant="icon" size={size} />
      <span
        className="font-sans leading-none font-semibold tracking-[-0.02em]"
        style={{ fontSize: textSize }}
      >
        Formyx
      </span>
    </span>
  );
}
