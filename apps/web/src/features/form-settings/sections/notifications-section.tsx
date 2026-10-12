import {
  CHAT_SERVICE_NAMES,
  chatWebhookProblem,
  formNotificationSettingsSchema,
  MAX_NOTIFICATION_EMAILS,
  normalizeEmail,
  type ChatService,
  type NotificationFrequency,
} from '@formyx/shared';
import { useQueryClient } from '@tanstack/react-query';
import { Plug, Send, X } from 'lucide-react';
import { Link } from 'react-router';
import { useId, useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useEntitlements } from '@/features/entitlements/use-entitlements';
import { formIntegrationsPath } from '@/features/forms/form-paths';
import { NotifyToggle } from '@/features/responses/notify-toggle';
import { ApiRequestError } from '@/lib/api';
import { useSaveQueue } from '../save-queue-context';
import { SettingGroup, SettingRow } from '../setting-row';
import { formSettingsKey, setChatWebhook, testChatWebhook } from '../settings-api';
import { useLiveSection } from '../use-settings';
import {
  FieldError,
  OptionRadios,
  OptionSelect,
  type Option,
  type SectionProps,
} from './section-controls';

const emailSchema = z.email('Enter an email address').max(254);

const HOURS: Option<string>[] = Array.from({ length: 24 }, (_, hour) => ({
  value: String(hour),
  label: `${String(hour).padStart(2, '0')}:00`,
}));

/** Addresses to email about each response, beyond the members who asked. */
export function EmailList({
  emails,
  onChange,
}: {
  emails: readonly string[];
  onChange: (emails: string[]) => void;
}) {
  const id = useId();
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const full = emails.length >= MAX_NOTIFICATION_EMAILS;

  const add = () => {
    const checked = emailSchema.safeParse(draft.trim());
    if (!checked.success) {
      setError(checked.error.issues[0]?.message ?? 'Enter an email address');
      return;
    }
    const address = normalizeEmail(checked.data);
    if (emails.some((email) => normalizeEmail(email) === address)) {
      setError('Already added');
      return;
    }
    setError(null);
    setDraft('');
    onChange([...emails, address]);
  };

  return (
    <div className="flex flex-col gap-3">
      {emails.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Other addresses">
          {emails.map((email) => (
            <li
              key={email}
              className="flex items-center gap-1 rounded-md border bg-surface py-0.5 pr-0.5 pl-2 text-13"
            >
              {email}
              <Button
                variant="ghost"
                size="icon-sm"
                className="size-6"
                aria-label={`Remove ${email}`}
                onClick={() => {
                  onChange(emails.filter((candidate) => candidate !== email));
                }}
              >
                <X aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          add();
        }}
      >
        <Label htmlFor={id} className="sr-only">
          Add an address
        </Label>
        <Input
          id={id}
          type="email"
          autoComplete="off"
          placeholder={full ? `Up to ${MAX_NOTIFICATION_EMAILS} addresses` : 'team@example.com'}
          disabled={full}
          value={draft}
          aria-invalid={error ? true : undefined}
          aria-describedby={`${id}-error`}
          onChange={(event) => {
            setDraft(event.target.value);
          }}
        />
        <Button type="submit" variant="secondary" disabled={full}>
          Add
        </Button>
      </form>
      <FieldError id={`${id}-error`} message={error} />
    </div>
  );
}

/** A Slack or Discord incoming webhook: set it, test it, remove it. Its URL is never shown. */
export function ChatWebhook({
  formId,
  service,
  hint,
  onSaved,
}: {
  formId: string;
  service: ChatService;
  hint: string | null;
  /** After connecting or removing it (the Integrations page refreshes). */
  onSaved?: () => void;
}) {
  const queryClient = useQueryClient();
  const queue = useSaveQueue();
  const id = useId();
  const [url, setUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const name = CHAT_SERVICE_NAMES[service];

  const save = (next: string | null) => {
    queue.save(`chat:${service}`, async () => {
      const view = await setChatWebhook(formId, service, next);
      queryClient.setQueryData(formSettingsKey(formId), view);
      onSaved?.();
    });
    setUrl('');
  };

  const test = async () => {
    setTesting(true);
    try {
      await testChatWebhook(formId, service);
      toast.success(`Sent a test message to ${name}`);
    } catch (caught) {
      toast.error(`${name} did not take the test message`, {
        description: caught instanceof ApiRequestError ? caught.message : 'Try again.',
      });
    } finally {
      setTesting(false);
    }
  };

  if (hint) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-14 tabular-nums">
          Webhook <span className="text-muted-foreground">{hint}</span>
        </span>
        <Button variant="secondary" size="sm" disabled={testing} onClick={() => void test()}>
          <Send aria-hidden />
          Send test
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
        const problem = chatWebhookProblem(service, url);
        setError(problem);
        if (!problem) save(url.trim());
      }}
    >
      <Label htmlFor={id} className="sr-only">
        {name} incoming webhook URL
      </Label>
      <div className="flex gap-2">
        <Input
          id={id}
          type="url"
          autoComplete="off"
          placeholder={
            service === 'slack'
              ? 'https://hooks.slack.com/services/…'
              : 'https://discord.com/api/webhooks/…'
          }
          value={url}
          aria-invalid={error ? true : undefined}
          aria-describedby={`${id}-error`}
          onChange={(event) => {
            setUrl(event.target.value);
          }}
        />
        <Button type="submit" variant="secondary">
          Connect
        </Button>
      </div>
      <FieldError id={`${id}-error`} message={error} />
    </form>
  );
}

/** Who hears about new responses by email, and how often. */
export function NotificationsSection({ form, view }: SectionProps) {
  const setNotifications = useLiveSection(form.id, 'notifications');
  const { hasFeature } = useEntitlements();
  const notifications = view.settings.notifications;
  const hourId = useId();

  const frequencyOptions: Option<NotificationFrequency>[] = [
    { value: 'instant', label: 'For every response', hint: 'An email as each one arrives.' },
    {
      value: 'daily',
      label: 'A daily digest',
      hint: 'One email a day listing the new responses. Chat messages still come as they arrive.',
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <SettingGroup title="Email">
        <SettingRow
          id="my-email"
          label="Email me"
          description="Just for you: each member chooses for themselves."
          compact
        >
          <NotifyToggle formId={form.id} />
        </SettingRow>
        <SettingRow
          id="extra-emails"
          label="Other addresses"
          description="Such as a shared inbox. They get the same emails as members."
          pro={!hasFeature('extra_recipients')}
          stacked
        >
          <EmailList
            emails={notifications.emails}
            onChange={(emails) => {
              const next = { ...notifications, emails };
              if (formNotificationSettingsSchema.safeParse(next).success) setNotifications(next);
            }}
          />
        </SettingRow>
        <SettingRow id="frequency" label="How often" stacked>
          <OptionRadios
            label="How often"
            value={notifications.frequency}
            options={frequencyOptions}
            onChange={(frequency) => {
              setNotifications({ ...notifications, frequency });
            }}
          />
          {notifications.frequency === 'daily' && (
            <div className="mt-4 flex flex-col gap-1.5 sm:max-w-56">
              <Label htmlFor={hourId}>Send the digest at</Label>
              <OptionSelect
                id={hourId}
                value={String(notifications.digestHour)}
                options={HOURS}
                onChange={(hour) => {
                  setNotifications({ ...notifications, digestHour: Number(hour) });
                }}
              />
              <p className="text-13 text-muted-foreground">
                In the workspace&apos;s time zone (workspace settings).
              </p>
            </div>
          )}
        </SettingRow>
      </SettingGroup>

      <SettingGroup title="Elsewhere">
        <SettingRow
          id="chat"
          label="Slack, Discord, Google Sheets and webhooks"
          description="New responses can also go to chat channels, spreadsheets, Notion and your own endpoints."
        >
          <Button asChild variant="secondary" size="sm">
            <Link to={formIntegrationsPath(form.id)}>
              <Plug aria-hidden />
              Open Integrations
            </Link>
          </Button>
        </SettingRow>
      </SettingGroup>
    </div>
  );
}
