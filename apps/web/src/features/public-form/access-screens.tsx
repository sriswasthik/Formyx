import { FORM_LOCALES, formScripts, type FormLocale, type FormTheme } from '@formyx/shared';
import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { FormButton } from '@/features/form-renderer/form-button';
import { FormLocaleContext } from '@/features/form-renderer/i18n/form-locale';
import { inputRadius, secondaryButton, textControl } from '@/features/form-renderer/styles';
import { ThemeRenderer, type ThemeVariant } from '@/features/form-renderer/theme/theme-renderer';
import { ApiRequestError } from '@/lib/api';
import { cx } from '@/lib/cx';

/*
 * The screens before a form's questions, in the form's own look and language: its password,
 * the respondent's email address (confirmed with a code for one response per person), and
 * "you have already responded". They load only for forms that need them.
 */

interface FrameProps {
  title: string;
  theme: FormTheme;
  locale: FormLocale;
  variant: ThemeVariant;
  footer?: ReactNode;
  children: ReactNode;
}

/** The form's look around a short screen with its title. */
function Frame({ title, theme, locale, variant, footer, children }: FrameProps) {
  return (
    <FormLocaleContext.Provider value={locale}>
      <ThemeRenderer
        theme={theme}
        variant={variant}
        footer={footer}
        scripts={formScripts(locale.format.language, title)}
        lang={FORM_LOCALES[locale.format.language]}
        className={variant === 'embed' ? 'overflow-clip rounded-(--form-radius)' : undefined}
      >
        <div className="flex flex-col gap-6 [text-align:var(--form-text-align)]">
          <h1 className="form-title break-words @xl:form-title-lg">{title}</h1>
          {children}
        </div>
      </ThemeRenderer>
    </FormLocaleContext.Provider>
  );
}

/** A labelled box with its message under it, wired for screen readers. */
function Field({
  label,
  error,
  hint,
  input,
}: {
  label: string;
  error: string | null;
  hint?: string;
  input: (props: {
    id: string;
    'aria-describedby': string;
    'aria-invalid': true | undefined;
  }) => ReactNode;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="form-text font-medium">
        {label}
      </label>
      {input({ id, 'aria-describedby': `${id}-message`, 'aria-invalid': error ? true : undefined })}
      <p
        id={`${id}-message`}
        role={error ? 'alert' : undefined}
        className={cx(
          'form-text-sm empty:hidden',
          error ? 'text-(--form-danger)' : 'text-(--form-muted)',
        )}
      >
        {error ?? hint}
      </p>
    </div>
  );
}

interface ScreenProps {
  title: string;
  theme: FormTheme;
  locale: FormLocale;
  variant: ThemeVariant;
  footer?: ReactNode;
}

/** The password a form asks for before showing anything. */
export function PasswordGate({
  onUnlock,
  ...frame
}: ScreenProps & { onUnlock: (password: string) => Promise<void> }) {
  const { messages } = frame.locale;
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!password) {
      setError(messages.access.wrongPassword);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onUnlock(password);
    } catch (problem) {
      setError(
        problem instanceof ApiRequestError && problem.code === 'RATE_LIMITED'
          ? messages.access.tooManyTries
          : problem instanceof ApiRequestError && problem.code === 'WRONG_CODE'
            ? messages.access.wrongPassword
            : messages.check.sendFailed,
      );
      setBusy(false);
    }
  };

  return (
    <Frame {...frame}>
      <p className="form-text text-(--form-muted)">{messages.access.lockedText}</p>
      <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-5">
        <Field
          label={messages.access.password}
          error={error}
          input={(props) => (
            <input
              {...props}
              type="password"
              autoComplete="current-password"
              // eslint-disable-next-line jsx-a11y/no-autofocus -- the only thing to do here
              autoFocus
              className={cx(textControl, inputRadius, 'h-11')}
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
              }}
            />
          )}
        />
        <div>
          <FormButton type="submit" busy={busy} disabled={busy}>
            {busy ? messages.access.unlocking : messages.access.unlock}
          </FormButton>
        </div>
      </form>
    </Frame>
  );
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * The respondent's email address before the questions: just asked for, or (for one response
 * per person) confirmed with a 6-digit code sent to it.
 */
export function EmailStep({
  verify,
  onSendCode,
  onCheckCode,
  onDone,
  ...frame
}: ScreenProps & {
  verify: boolean;
  onSendCode: (email: string) => Promise<void>;
  onCheckCode: (email: string, code: string) => Promise<void>;
  /** Asked, not confirmed: the address to send with the response. */
  onDone: (email: string) => void;
}) {
  const { messages } = frame.locale;
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const problemText = (problem: unknown) => {
    if (!(problem instanceof ApiRequestError)) return messages.check.sendFailed;
    if (problem.code === 'ALREADY_RESPONDED') return messages.access.alreadyRespondedText;
    if (problem.code === 'WRONG_CODE') return messages.access.wrongCode;
    if (problem.code === 'RATE_LIMITED') return messages.access.tooManyTries;
    return messages.check.sendFailed;
  };

  const submitEmail = async (event: FormEvent) => {
    event.preventDefault();
    const address = email.trim();
    if (!EMAIL_PATTERN.test(address)) {
      setError(messages.check.email);
      return;
    }
    if (!verify) {
      onDone(address);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSendCode(address);
      setSentTo(address);
    } catch (problem) {
      setError(problemText(problem));
    } finally {
      setBusy(false);
    }
  };

  const submitCode = async (event: FormEvent) => {
    event.preventDefault();
    if (!sentTo) return;
    if (!/^\d{6}$/.test(code.trim())) {
      setError(messages.access.wrongCode);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onCheckCode(sentTo, code.trim());
    } catch (problem) {
      setError(problemText(problem));
      setBusy(false);
    }
  };

  return (
    <Frame {...frame}>
      <p className="form-text text-(--form-muted)">
        {verify ? messages.access.verifyText : messages.access.emailText}
      </p>
      {sentTo === null ? (
        <form
          noValidate
          onSubmit={(event) => void submitEmail(event)}
          className="flex flex-col gap-5"
        >
          <Field
            label={messages.access.emailLabel}
            error={error}
            input={(props) => (
              <input
                {...props}
                type="email"
                autoComplete="email"
                inputMode="email"
                className={cx(textControl, inputRadius, 'h-11')}
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                }}
              />
            )}
          />
          <div>
            <FormButton type="submit" busy={busy} disabled={busy}>
              {messages.access.continue}
            </FormButton>
          </div>
        </form>
      ) : (
        <form
          noValidate
          onSubmit={(event) => void submitCode(event)}
          className="flex flex-col gap-5"
        >
          <p role="status" className="form-text">
            {messages.access.codeSent(sentTo)}
          </p>
          <Field
            label={messages.access.codeLabel}
            error={error}
            input={(props) => (
              <input
                {...props}
                // eslint-disable-next-line jsx-a11y/no-autofocus -- the code was just sent
                autoFocus
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                className={cx(
                  textControl,
                  inputRadius,
                  'h-11 max-w-48 tracking-[0.3em] tabular-nums',
                )}
                value={code}
                onChange={(event) => {
                  setCode(event.target.value.replace(/\D/g, ''));
                }}
              />
            )}
          />
          <div className="flex flex-wrap items-center gap-3">
            <FormButton type="submit" busy={busy} disabled={busy}>
              {busy ? messages.access.checking : messages.access.verify}
            </FormButton>
            <button
              type="button"
              className={secondaryButton}
              disabled={busy}
              onClick={() => {
                setCode('');
                setError(null);
                void onSendCode(sentTo).catch((problem: unknown) => {
                  setError(problemText(problem));
                });
              }}
            >
              {messages.access.sendAgain}
            </button>
            <button
              type="button"
              className={secondaryButton}
              disabled={busy}
              onClick={() => {
                setSentTo(null);
                setCode('');
                setError(null);
              }}
            >
              {messages.access.useAnotherEmail}
            </button>
          </div>
        </form>
      )}
    </Frame>
  );
}

/** For forms taking one response per person (or browser) that already have this one's. */
export function AlreadyResponded(frame: ScreenProps) {
  const { messages } = frame.locale;
  return (
    <Frame {...frame}>
      <div role="status" className="flex flex-col gap-2">
        <p className="form-text font-medium">{messages.access.alreadyResponded}</p>
        <p className="form-text text-(--form-muted)">{messages.access.alreadyRespondedText}</p>
      </div>
    </Frame>
  );
}
