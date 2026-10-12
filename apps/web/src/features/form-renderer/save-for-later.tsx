import { Mail } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import { cx } from '@/lib/cx';
import { inputRadius, secondaryButton, textControl } from './styles';
import { useFormMessages } from './i18n/form-locale';

export interface SaveForLaterProps {
  /** Saves the answers so far and emails `email` a link; rejects with a message to show. */
  onSave: (email: string) => Promise<void>;
}

/**
 * "Save and continue later": an email address, then a link in the inbox that brings the
 * answers back. A form of its own inside the page's form, so Enter sends this one.
 */
export function SaveForLater({ onSave }: SaveForLaterProps) {
  const messages = useFormMessages();
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
        className={cx(secondaryButton, 'px-0!')}
        onClick={() => {
          setOpen(true);
        }}
      >
        <Mail aria-hidden className="size-4" />
        {messages.save.saveForLater}
      </button>
    );
  }

  if (state.status === 'sent') {
    return (
      <p role="status" className="form-text-sm text-(--form-muted)">
        {messages.save.sent(state.to)}
      </p>
    );
  }

  const send = async (event: FormEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const address = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
      setState({ status: 'error', message: messages.save.enterEmail });
      return;
    }
    setState({ status: 'sending' });
    try {
      await onSave(address);
      setState({ status: 'sent', to: address });
    } catch (error) {
      setState({
        status: 'error',
        message: error instanceof Error ? error.message : messages.save.failed,
      });
    }
  };

  // Not a nested <form> (invalid HTML): Enter in the box sends, and the button does too.
  return (
    <div
      className="flex w-full max-w-md flex-col gap-2"
      role="group"
      aria-label={messages.save.saveForLater}
    >
      <label htmlFor={inputId} className="form-text-sm font-medium">
        {messages.save.emailLabel}
      </label>
      <div className="flex gap-2">
        <input
          id={inputId}
          type="email"
          autoComplete="email"
          className={cx(textControl, inputRadius, 'h-11 min-w-0 flex-1')}
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
          {state.status === 'sending' ? messages.save.sending : messages.save.sendLink}
        </button>
      </div>
      <p
        id={messageId}
        className={cx(
          'form-text-sm',
          state.status === 'error' ? 'text-(--form-danger)' : 'text-(--form-muted)',
        )}
      >
        {state.status === 'error' ? state.message : messages.save.privacy}
      </p>
    </div>
  );
}
