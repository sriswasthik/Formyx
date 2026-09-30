import { Eye, EyeOff } from 'lucide-react';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

type PasswordInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'>;

/** A password field with a show/hide toggle. */
export const PasswordInput = React.forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ className, ...props }, ref) => {
    const [visible, setVisible] = React.useState(false);

    return (
      <div className="relative">
        <Input
          ref={ref}
          type={visible ? 'text' : 'password'}
          // Edge adds its own reveal button; ours works everywhere, so hide the native one.
          className={cn('pr-10 [&::-ms-reveal]:hidden', className)}
          {...props}
        />
        <Button
          variant="ghost"
          size="icon-sm"
          className="absolute top-0.5 right-0.5 text-muted-foreground hover:not-disabled:text-foreground"
          aria-label="Show password"
          aria-pressed={visible}
          aria-controls={props.id}
          disabled={props.disabled}
          onClick={() => {
            setVisible((current) => !current);
          }}
        >
          {visible ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
        </Button>
      </div>
    );
  },
);
PasswordInput.displayName = 'PasswordInput';
