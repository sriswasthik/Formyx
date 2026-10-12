import type { FormTheme } from '@formyx/shared';
import { cx } from '@/lib/cx';

/*
 * A form's own images. Both are decorative: the title right below names the form, so they
 * carry empty alt text rather than repeating it.
 */

/**
 * A wide image across the top of the form, cropped around its focal point. `fill` makes it
 * cover its (positioned) parent instead, as in the side-by-side layouts.
 */
export function FormCover({ theme, fill = false }: { theme: FormTheme; fill?: boolean }) {
  const cover = theme.layout.coverImage;
  if (!cover) return null;
  return (
    <img
      src={cover.url}
      alt=""
      data-form-cover
      className={cx(
        'block w-full object-cover',
        fill ? 'absolute inset-0 h-full' : 'h-36 @xl:h-52',
      )}
      style={{ objectPosition: `${cover.focalPoint.x}% ${cover.focalPoint.y}%` }}
    />
  );
}

interface FormLogoProps {
  theme: FormTheme;
  /** `header`: above the title. `top`: in a bar across the top of the page. */
  placement: 'header' | 'top';
  className?: string;
}

/** The logo, if the theme puts it in this `placement`. */
export function FormLogo({ theme, placement, className }: FormLogoProps) {
  const { logoUrl } = theme.branding;
  const position = theme.layout.logoPosition;
  if (!logoUrl || (placement === 'header') !== (position === 'above_title')) return null;

  const centered =
    position === 'top_center' ||
    (position === 'above_title' && theme.typography.textAlign === 'center');
  return (
    <img
      src={logoUrl}
      alt=""
      data-form-logo
      className={cx(
        'block h-10 w-auto max-w-40 object-contain',
        centered ? 'mx-auto object-center' : 'object-left',
        className,
      )}
    />
  );
}
