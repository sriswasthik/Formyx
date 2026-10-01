import type { FormTheme } from '@formyx/shared';
import { cn } from '@/lib/utils';

/*
 * A form's own images. Both are decorative: the title right below names the form, so they
 * carry empty alt text rather than repeating it.
 */

/** A wide image across the top of the form. */
export function FormCover({ theme, className }: { theme: FormTheme; className?: string }) {
  if (!theme.coverUrl) return null;
  return (
    <img
      src={theme.coverUrl}
      alt=""
      className={cn('block h-36 w-full object-cover sm:h-52', className)}
    />
  );
}

/** The logo, above the title. */
export function FormLogo({ theme, className }: { theme: FormTheme; className?: string }) {
  if (!theme.logoUrl) return null;
  return (
    <img
      src={theme.logoUrl}
      alt=""
      className={cn('block h-10 w-auto max-w-40 object-contain object-left', className)}
    />
  );
}
