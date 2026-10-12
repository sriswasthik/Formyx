import {
  accessSettingsSchema,
  CLOSED_MESSAGE_MAX_LENGTH,
  FORM_PASSWORD_MAX_LENGTH,
  FORM_PASSWORD_MIN_LENGTH,
  RESPONSE_LIMIT_MAX,
  type AccessSettings,
  type OneResponseMode,
} from '@formyx/shared';
import { useQueryClient } from '@tanstack/react-query';
import { KeyRound } from 'lucide-react';
import { useId, useState } from 'react';
import { z } from 'zod';
import { PasswordInput } from '@/components/password-input';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { ProBadge } from '@/features/entitlements/pro-badge';
import { useEntitlements } from '@/features/entitlements/use-entitlements';
import { fromDateTimeLocal, toDateTimeLocal } from '@/features/form-editor/settings/date-time';
import { useSaveQueue } from '../save-queue-context';
import { SettingGroup, SettingRow } from '../setting-row';
import { formSettingsKey, setFormPassword } from '../settings-api';
import { useLiveSection } from '../use-settings';
import { FieldError, OptionRadios, type Option, type SectionProps } from './section-controls';
import { ValidatedInput } from './validated-input';

const passwordSchema = z
  .string()
  .min(FORM_PASSWORD_MIN_LENGTH, `Use at least ${FORM_PASSWORD_MIN_LENGTH} characters`)
  .max(FORM_PASSWORD_MAX_LENGTH, `Use ${FORM_PASSWORD_MAX_LENGTH} characters or fewer`);

function PasswordSetting({ formId, hasPassword }: { formId: string; hasPassword: boolean }) {
  const queryClient = useQueryClient();
  const queue = useSaveQueue();
  const id = useId();
  const [editing, setEditing] = useState(!hasPassword);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const save = (next: string | null) => {
    queue.save('password', async () => {
      const view = await setFormPassword(formId, next);
      queryClient.setQueryData(formSettingsKey(formId), view);
    });
    setPassword('');
    setEditing(next === null);
  };

  if (hasPassword && !editing) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex items-center gap-2 text-14">
          <KeyRound aria-hidden className="text-muted-foreground" />A password is set
        </span>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            setEditing(true);
          }}
        >
          Change
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            save(null);
          }}
        >
          Remove
        </Button>
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        const checked = passwordSchema.safeParse(password);
        if (!checked.success) {
          setError(checked.error.issues[0]?.message ?? 'Check the password');
          return;
        }
        setError(null);
        save(checked.data);
      }}
    >
      <Label htmlFor={id} className="sr-only">
        {hasPassword ? 'New password' : 'Password'}
      </Label>
      <div className="flex gap-2">
        <PasswordInput
          id={id}
          autoComplete="new-password"
          value={password}
          aria-invalid={error ? true : undefined}
          aria-describedby={`${id}-error`}
          onChange={(event) => {
            setPassword(event.target.value);
          }}
        />
        <Button type="submit" variant="secondary">
          {hasPassword ? 'Save' : 'Set'}
        </Button>
        {hasPassword && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setEditing(false);
            }}
          >
            Cancel
          </Button>
        )}
      </div>
      <FieldError id={`${id}-error`} message={error} />
    </form>
  );
}

/** Opening and closing times, checked together: a form cannot close before it opens. */
function SchedulePicker({
  access,
  onChange,
}: {
  access: AccessSettings;
  onChange: (access: AccessSettings) => void;
}) {
  const opensId = useId();
  const closesId = useId();
  const [opens, setOpens] = useState(toDateTimeLocal(access.opensAt));
  const [closes, setCloses] = useState(toDateTimeLocal(access.closesAt));
  const [error, setError] = useState<string | null>(null);

  const change = (nextOpens: string, nextCloses: string) => {
    setOpens(nextOpens);
    setCloses(nextCloses);
    const { opensAt: _opens, closesAt: _closes, ...rest } = access;
    const opensAt = fromDateTimeLocal(nextOpens);
    const closesAt = fromDateTimeLocal(nextCloses);
    const next: AccessSettings = {
      ...rest,
      ...(opensAt && { opensAt }),
      ...(closesAt && { closesAt }),
    };
    const checked = accessSettingsSchema.safeParse(next);
    if (!checked.success) {
      setError(checked.error.issues[0]?.message ?? 'Check the times');
      return;
    }
    setError(null);
    onChange(next);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={opensId}>Opens</Label>
          <Input
            id={opensId}
            type="datetime-local"
            value={opens}
            onChange={(event) => {
              change(event.target.value, closes);
            }}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={closesId}>Closes</Label>
          <Input
            id={closesId}
            type="datetime-local"
            value={closes}
            aria-invalid={error ? true : undefined}
            aria-describedby={`${closesId}-error`}
            onChange={(event) => {
              change(opens, event.target.value);
            }}
          />
        </div>
      </div>
      <FieldError id={`${closesId}-error`} message={error} />
      <p className="text-13 text-muted-foreground">
        In your time zone ({Intl.DateTimeFormat().resolvedOptions().timeZone}). Leave either empty
        for no limit.
      </p>
    </div>
  );
}

const limitSchema = z
  .string()
  .trim()
  .refine((value) => value === '' || /^\d+$/.test(value), 'Enter a whole number')
  .transform((value) => (value === '' ? undefined : Number(value)))
  .refine(
    (value) => value === undefined || (value >= 1 && value <= RESPONSE_LIMIT_MAX),
    `Use a number from 1 to ${RESPONSE_LIMIT_MAX.toLocaleString('en-IN')}`,
  );

const closedMessageSchema = z
  .string()
  .max(CLOSED_MESSAGE_MAX_LENGTH, `Use ${CLOSED_MESSAGE_MAX_LENGTH} characters or fewer`);

/** Who can respond, how often and when. Every change applies at once. */
export function AccessSection({ form, view }: SectionProps) {
  const setAccess = useLiveSection(form.id, 'access');
  const { hasFeature } = useEntitlements();
  const access = view.settings.access;
  const ids = {
    requireEmail: useId(),
    limit: useId(),
    edits: useId(),
    listed: useId(),
    message: useId(),
  };

  const oneResponseOptions: Option<OneResponseMode>[] = [
    { value: 'off', label: 'Off', hint: 'Anyone with the link can respond as often as they like.' },
    {
      value: 'browser',
      label: 'Once per browser',
      hint: 'Remembered on their device. Easy to get round (another browser), but no sign-in.',
    },
    {
      value: 'email',
      label: 'Once per email address',
      hint: 'They confirm their address with a code we email them. Checked on our server.',
      badge: hasFeature('verified_responses') ? undefined : <ProBadge />,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <SettingGroup title="Who can respond">
        <SettingRow
          id="password"
          label="Password"
          description="Respondents type it before they see anything. Changing or removing it applies at once, and asks again everyone who had it."
          stacked
        >
          <PasswordSetting formId={form.id} hasPassword={view.hasPassword} />
        </SettingRow>
        <SettingRow id="one-response" label="One response per person" stacked>
          <OptionRadios
            label="One response per person"
            value={access.oneResponsePer}
            options={oneResponseOptions}
            onChange={(oneResponsePer) => {
              setAccess({ ...access, oneResponsePer });
            }}
          />
        </SettingRow>
        <SettingRow
          id="require-email"
          label="Ask for respondents' email"
          description={
            access.oneResponsePer === 'email'
              ? 'Asked already: one response per email address confirms it.'
              : 'Before the first question. Kept with each response, and used by the autoresponder.'
          }
          controlId={ids.requireEmail}
        >
          <Switch
            id={ids.requireEmail}
            checked={access.requireEmail || access.oneResponsePer === 'email'}
            disabled={access.oneResponsePer === 'email'}
            onCheckedChange={(requireEmail) => {
              setAccess({ ...access, requireEmail });
            }}
          />
        </SettingRow>
      </SettingGroup>

      <SettingGroup title="When">
        <SettingRow
          id="schedule"
          label="Opening and closing times"
          description="Before it opens, the form says when it will. After it closes, it says so."
          stacked
        >
          <SchedulePicker
            access={access}
            onChange={(next) => {
              setAccess(next);
            }}
          />
        </SettingRow>
        <SettingRow
          id="response-limit"
          label="Response limit"
          description="Closes the form once it has this many responses."
          controlId={ids.limit}
        >
          <ValidatedInput
            id={ids.limit}
            value={access.responseLimit === undefined ? '' : String(access.responseLimit)}
            schema={limitSchema}
            inputMode="numeric"
            placeholder="No limit"
            onValid={(responseLimit) => {
              const { responseLimit: _old, ...rest } = access;
              setAccess(responseLimit === undefined ? rest : { ...rest, responseLimit }, {
                typing: true,
              });
            }}
          />
        </SettingRow>
        <SettingRow
          id="closed-message"
          label="Closed message"
          description="Shown once the form is closed, full or past its closing time. **Bold**, *italic* and [links](https://…) work."
          controlId={ids.message}
          stacked
        >
          <ValidatedInput
            id={ids.message}
            value={access.closedMessage ?? ''}
            schema={closedMessageSchema}
            multiline
            rows={3}
            placeholder="It is no longer accepting responses."
            onValid={(closedMessage) => {
              const { closedMessage: _old, ...rest } = access;
              setAccess(closedMessage.trim() ? { ...rest, closedMessage } : rest, {
                typing: true,
              });
            }}
          />
        </SettingRow>
      </SettingGroup>

      <SettingGroup title="After they respond">
        <SettingRow
          id="edits"
          label="Changing responses"
          description="Each respondent gets a private link (on the end screen, and in the autoresponder) to change their answers while the form is open."
          controlId={ids.edits}
        >
          <Switch
            id={ids.edits}
            checked={access.allowEdits}
            onCheckedChange={(allowEdits) => {
              setAccess({ ...access, allowEdits });
            }}
          />
        </SettingRow>
        <SettingRow
          id="unlisted"
          label="Search engines"
          description="Forms are only found through their link. Turn this on to let search engines list it too."
          controlId={ids.listed}
        >
          <Switch
            id={ids.listed}
            checked={!access.unlisted}
            onCheckedChange={(listed) => {
              setAccess({ ...access, unlisted: !listed });
            }}
          />
        </SettingRow>
      </SettingGroup>
    </div>
  );
}
