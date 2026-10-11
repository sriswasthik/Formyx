import { Mail } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import { cn } from '@/lib/utils';
import { inputRadius, secondaryButton, textControl } from './styles';

export interface SaveForLaterProps {
  /** Saves the answers so far and emails `email` a link; rejects with a message to show. */
  onSave: (email: string) => Promise<void>;
}

/**
 * "Save and continue later": an email address, then a link in the inbox that brings the
 * answers back. A form of its own inside the page's form, so Enter sends this one.
 */
export function SaveForLater({ onSave }: SaveForLaterProps) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [state, setState] = useState<
    | { status: 'idle' }
    | { status: 'sending' }
    | { status: 'sent'; to: string }
    | { status: 'error'; message: string }
  >({ status: 'idle' });
  const inputId = useId();
  const messageId = `${inputId}-message`;

  if (!open) {
    return (
      <button
        type="button"
        className={cn(secondaryButton, 'px-0')}
        onClick={() => {
          setOpen(true);
        }}
      >
        <Mail aria-hidden className="size-4" />
        Save and continue later
      </button>
    );
  }

  if (state.status === 'sent') {
    return (
      <p role="status" className="form-text-sm text-(--form-muted)">
        We sent a link to {state.to}. It brings your answers back for 30 days.
      </p>
    );
  }

  const send = async (event: FormEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const address = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
      setState({ status: 'error', message: 'Enter an email address' });
      return;
    }
    setState({ status: 'sending' });
    try {
      await onSave(address);
      setState({ status: 'sent', to: address });
    } catch (error) {
      setState({
        status: 'error',
        message: error instanceof Error ? error.message : 'Your answers could not be saved.',
      });
    }
  };

  // Not a nested <form> (invalid HTML): Enter in the box sends, and the button does too.
  return (
    <div
      className="flex w-full max-w-md flex-col gap-2"
      role="group"
      aria-label="Save and continue later"
    >
      <label htmlFor={inputId} className="form-text-sm font-medium">
        Email me a link to finish later
      </label>
      <div className="flex gap-2">
        <input
          id={inputId}
          type="email"
          autoComplete="email"
          className={cn(textControl, inputRadius, 'h-11 min-w-0 flex-1')}
          value={email}
          aria-invalid={state.status === 'error' || undefined}
          aria-describedby={messageId}
          onChange={(event) => {
            setEmail(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void send(event);
          }}
        />
        <button
          type="button"
          className={secondaryButton}
          disabled={state.status === 'sending'}
          onClick={(event) => void send(event)}
        >
          {state.status === 'sending' ? 'Sending…' : 'Send link'}
        </button>
      </div>
      <p
        id={messageId}
        className={cn(
          'form-text-sm',
          state.status === 'error' ? 'text-(--form-danger)' : 'text-(--form-muted)',
        )}
      >
        {state.status === 'error'
          ? state.message
          : 'Anyone with the link can see your answers. We do not keep your email address.'}
      </p>
    </div>
  );
}
