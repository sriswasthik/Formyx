import type { FormTheme } from '@formyx/shared';
import type * as React from 'react';
import { cn } from '@/lib/utils';
import { formThemeVariables } from './theme-variables';

interface FormThemeScopeProps extends React.HTMLAttributes<HTMLDivElement> {
  theme: FormTheme;
}

/** Applies a form's theme to everything inside. */
export function FormThemeScope({ theme, className, style, ...props }: FormThemeScopeProps) {
  return (
    <div
      className={cn('bg-(--form-bg) text-(--form-fg)', className)}
      style={{ ...formThemeVariables(theme), ...style }}
      {...props}
    />
  );
}
