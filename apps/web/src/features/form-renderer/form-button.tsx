import { ArrowRight, LoaderCircle } from 'lucide-react';
import type * as React from 'react';
import { cn } from '@/lib/utils';
import { formButton } from './styles';
import { useFormTheme } from './theme/theme-context';

interface FormButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Shows a spinner in place of the arrow while the form is being sent. */
  busy?: boolean;
  /** `span`: a picture of the button, as in the editor canvas. */
  as?: 'button' | 'span';
}

/**
 * The form's main button (submit, or next in conversational forms) in the theme's button
 * style, size and width, with the theme's arrow after its text if it has one.
 */
export function FormButton({
  busy = false,
  as = 'button',
  className,
  children,
  type = 'button',
  ...props
}: FormButtonProps) {
  const { components } = useFormTheme();
  const content = (
    <>
      {busy && <LoaderCircle className="motion-safe:animate-spin" aria-hidden />}
      {children}
      {components.buttonArrow && !busy && <ArrowRight aria-hidden data-button-arrow />}
    </>
  );
  const classes = cn(formButton(components), className);

  if (as === 'span') return <span className={classes}>{content}</span>;
  return (
    <button type={type} className={classes} {...props}>
      {content}
    </button>
  );
}
