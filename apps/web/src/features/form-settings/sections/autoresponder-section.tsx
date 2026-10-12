import {
  AUTORESPONDER_BODY_MAX_LENGTH,
  AUTORESPONDER_SUBJECT_MAX_LENGTH,
  formLocale,
  isAnswerableFieldType,
  pipeToken,
  renderAutoresponder,
  type AutoresponderSettings,
  type FormDetail,
  type FormMessages,
} from '@formyx/shared';
import { Braces, Send } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useEntitlements } from '@/features/entitlements/use-entitlements';
import { loadFormMessages, loadedFormMessages } from '@/features/form-renderer/i18n/load-messages';
import { ApiRequestError } from '@/lib/api';
import { SettingGroup, SettingRow } from '../setting-row';
import { sendAutoresponderTest } from '../settings-api';
import { useLiveSection } from '../use-settings';
import { FieldError, OptionSelect, type Option, type SectionProps } from './section-controls';

/** Answers and values a template can show, as `{{field:…}}` and `{{var:…}}`. */
function insertables(form: FormDetail): Option<string>[] {
  const { fields, logic } = form.draftSchema;
  return [
    ...fields
      .filter((field) => isAnswerableFieldType(field.type))
      .map((field, index) => ({
        value: pipeToken('field', field.id),
        label: field.label.trim() || `Question ${index + 1}`,
      })),
    ...logic.variables.map((variable) => ({
      value: pipeToken('var', variable.id),
      label: variable.name.trim() || 'A value',
    })),
  ];
}

/** A subject or body box with an "Insert" menu that drops a token at the caret. */
function TemplateField({
  id,
  label,
  value,
  max,
  multiline,
  tokens,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  max: number;
  multiline: boolean;
  tokens: Option<string>[];
  onChange: (value: string) => void;
}) {
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState(value);
  const change = (next: string) => {
    setDraft(next);
    const problem = next.length > max ? `Use ${max} characters or fewer` : null;
    setError(problem);
    if (!problem) onChange(next);
  };
  // Where the caret goes once the menu closes, after an insert.
  const caret = useRef<number | null>(null);
  const insert = (token: string) => {
    const box = ref.current;
    const start = box?.selectionStart ?? draft.length;
    const end = box?.selectionEnd ?? draft.length;
    change(`${draft.slice(0, start)}${token}${draft.slice(end)}`);
    caret.current = start + token.length;
  };
  const props = {
    id,
    ref,
    value: draft,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': `${id}-error`,
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor={id}>{label}</Label>
        {tokens.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Insert an answer into the ${label.toLowerCase()}`}
              >
                <Braces aria-hidden />
                Insert answer
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="max-h-72 max-w-72 overflow-y-auto"
              // After an insert, focus goes back to the box, at the end of what was inserted.
              onCloseAutoFocus={(event) => {
                const at = caret.current;
                const box = ref.current;
                if (at === null || !box) return;
                event.preventDefault();
                caret.current = null;
                box.focus();
                box.setSelectionRange(at, at);
              }}
            >
              {tokens.map((token) => (
                <DropdownMenuItem
                  key={token.value}
                  onSelect={() => {
                    insert(token.value);
                  }}
                >
                  <span className="truncate">{token.label}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      {multiline ? (
        <Textarea
          {...props}
          rows={7}
          onChange={(event) => {
            change(event.target.value);
          }}
        />
      ) : (
        <Input
          {...props}
          onChange={(event) => {
            change(event.target.value);
          }}
        />
      )}
      <FieldError id={`${id}-error`} message={error} />
    </div>
  );
}

/** The email as it would be sent, with sample answers, drawn by the email's own renderer. */
function Preview({ form, settings }: { form: FormDetail; settings: AutoresponderSettings }) {
  const language = form.draftSchema.settings.language;
  const [messages, setMessages] = useState<FormMessages>(() => loadedFormMessages(language));
  useEffect(() => {
    let current = true;
    void loadFormMessages(language).then((loaded) => {
      if (current) setMessages(loaded);
    });
    return () => {
      current = false;
    };
  }, [language]);

  const email = useMemo(() => {
    const answers: Record<string, string> = {};
    for (const field of form.draftSchema.fields) {
      if (field.type === 'email') answers[field.id] = 'someone@example.com';
      else if (field.type === 'short_text' || field.type === 'long_text') {
        answers[field.id] = `[${field.label.trim() || 'Answer'}]`;
      }
    }
    return renderAutoresponder({
      formTitle: form.title,
      schema: form.draftSchema,
      theme: form.theme,
      settings,
      answers,
      outcome: form.draftSchema.logic.quiz?.enabled
        ? { values: {}, quiz: { score: 8, max: 10, percent: 80, passed: true } }
        : null,
      editUrl: 'https://formyx.app/',
      locale: formLocale(form.draftSchema.settings, messages),
    });
  }, [form, settings, messages]);

  return (
    <div className="flex flex-col gap-2">
      <p className="text-13">
        <span className="text-muted-foreground">Subject: </span>
        <span className="font-medium">{email.subject}</span>
      </p>
      <iframe
        title="Preview of the autoresponder email"
        // Nothing in it runs or navigates.
        sandbox=""
        srcDoc={email.html}
        className="h-[34rem] w-full rounded-lg border bg-white"
      />
    </div>
  );
}

const replyToSchema = z.union([z.literal(''), z.email('Enter an email address').max(254)]);

/** The email respondents get after sending: what it says, where it goes, and a preview. */
export function AutoresponderSection({ form, view }: SectionProps) {
  const setAutoresponder = useLiveSection(form.id, 'autoresponder');
  const { hasFeature } = useEntitlements();
  const settings = view.settings.autoresponder;
  const { access } = view.settings;
  const asksEmail = access.requireEmail || access.oneResponsePer === 'email';
  const tokens = useMemo(() => insertables(form), [form]);
  const [sending, setSending] = useState(false);
  const ids = {
    enabled: useId(),
    recipient: useId(),
    subject: useId(),
    body: useId(),
    replyTo: useId(),
    answers: useId(),
    score: useId(),
    edit: useId(),
  };
  const [replyTo, setReplyTo] = useState(settings.replyTo ?? '');
  const [replyError, setReplyError] = useState<string | null>(null);

  const recipients: Option<string>[] = [
    {
      value: 'respondent',
      label: asksEmail
        ? 'The address asked for before the questions'
        : 'The address asked for before the questions (turn it on in Access)',
    },
    ...form.draftSchema.fields
      .filter((field) => field.type === 'email')
      .map((field) => ({ value: field.id, label: field.label.trim() || 'Email question' })),
  ];
  const update = (patch: Partial<AutoresponderSettings>, typing = false) => {
    setAutoresponder({ ...settings, ...patch }, { typing });
  };

  const sendTest = async () => {
    setSending(true);
    try {
      await sendAutoresponderTest(form.id, settings);
      toast.success('Sent you a test email', { description: 'With sample answers in it.' });
    } catch (caught) {
      toast.error('Could not send the test email', {
        description: caught instanceof ApiRequestError ? caught.message : 'Try again.',
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <SettingGroup>
        <SettingRow
          id="autoresponder"
          label="Send an autoresponder"
          description="After each response, in the form's language. An address gets at most three a day from one form."
          controlId={ids.enabled}
          pro={!hasFeature('autoresponder')}
        >
          <Switch
            id={ids.enabled}
            checked={settings.enabled}
            onCheckedChange={(enabled) => {
              update({ enabled });
            }}
          />
        </SettingRow>
        <SettingRow id="autoresponder-to" label="Send to" controlId={ids.recipient}>
          <OptionSelect
            id={ids.recipient}
            value={settings.recipientFieldId ?? 'respondent'}
            options={recipients}
            onChange={(value) => {
              update({ recipientFieldId: value === 'respondent' ? null : value });
            }}
          />
        </SettingRow>
      </SettingGroup>

      <div className="grid gap-6 xl:grid-cols-2">
        <SettingGroup title="Email">
          <div className="flex flex-col gap-4 px-5 py-4 sm:px-6">
            <TemplateField
              id={ids.subject}
              label="Subject"
              value={settings.subject}
              max={AUTORESPONDER_SUBJECT_MAX_LENGTH}
              multiline={false}
              tokens={tokens}
              onChange={(subject) => {
                update({ subject }, true);
              }}
            />
            <TemplateField
              id={ids.body}
              label="Message"
              value={settings.body}
              max={AUTORESPONDER_BODY_MAX_LENGTH}
              multiline
              tokens={tokens}
              onChange={(body) => {
                update({ body }, true);
              }}
            />
            <p className="text-13 text-muted-foreground">
              **Bold**, *italic*, [links](https://…) and lists with “- ” work.
            </p>
            {(
              [
                ['includeAnswers', ids.answers, 'A copy of their answers'],
                ['includeScore', ids.score, 'The quiz score, if the form is a quiz'],
                ['includeEditLink', ids.edit, 'The link to change their response, if allowed'],
              ] as const
            ).map(([key, id, label]) => (
              <div key={key} className="flex items-center justify-between gap-4">
                <Label htmlFor={id}>{label}</Label>
                <Switch
                  id={id}
                  checked={settings[key]}
                  onCheckedChange={(checked) => {
                    update({ [key]: checked });
                  }}
                />
              </div>
            ))}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={ids.replyTo}>Replies go to</Label>
              <Input
                id={ids.replyTo}
                type="email"
                placeholder="Formyx's address (no replies)"
                value={replyTo}
                aria-invalid={replyError ? true : undefined}
                aria-describedby={`${ids.replyTo}-error`}
                onChange={(event) => {
                  const next = event.target.value.trim();
                  setReplyTo(event.target.value);
                  const checked = replyToSchema.safeParse(next);
                  setReplyError(checked.success ? null : 'Enter an email address');
                  if (!checked.success) return;
                  const { replyTo: _old, ...rest } = settings;
                  setAutoresponder(next ? { ...rest, replyTo: next } : rest, { typing: true });
                }}
              />
              <FieldError id={`${ids.replyTo}-error`} message={replyError} />
            </div>
            <div>
              <Button variant="secondary" disabled={sending} onClick={() => void sendTest()}>
                <Send aria-hidden />
                Send me a test
              </Button>
            </div>
          </div>
        </SettingGroup>
        <SettingGroup title="Preview">
          <div className="px-5 py-4 sm:px-6">
            <Preview form={form} settings={settings} />
          </div>
        </SettingGroup>
      </div>
    </div>
  );
}
