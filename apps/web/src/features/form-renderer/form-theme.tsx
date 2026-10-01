import type { FormTheme } from '@formyx/shared';
import type * as React from 'react';
import { useEffect } from 'react';
import { cn } from '@/lib/utils';
import { formThemeVariables, loadFormFont } from './theme-variables';

interface FormThemeScopeProps extends React.HTMLAttributes<HTMLDivElement> {
  theme: FormTheme;
}

/** Applies a form's theme to everything inside, loading its font if needed. */
export function FormThemeScope({ theme, className, style, ...props }: FormThemeScopeProps) {
  useEffect(() => {
    loadFormFont(theme.font);
  }, [theme.font]);

  return (
    <div
      className={cn('bg-(--form-bg) text-(--form-fg)', className)}
      style={{ ...formThemeVariables(theme), ...style }}
      {...props}
    />
  );
}
