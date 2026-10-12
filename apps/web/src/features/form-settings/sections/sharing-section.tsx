import {
  customSlugSchema,
  isPrefillable,
  prefilledLink,
  prefillValue,
  qrCodeColors,
  sharingSettingsSchema,
  type Field,
  type FormDetail,
  type SharingSettings,
} from '@formyx/shared';
import { useQueryClient } from '@tanstack/react-query';
import { ImageOff } from 'lucide-react';
import { useId, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ProBadge } from '@/features/entitlements/pro-badge';
import { useEntitlements } from '@/features/entitlements/use-entitlements';
import { ThemeImageField } from '@/features/form-editor/design/theme-image-field';
import { formKeys } from '@/features/forms/form-list-cache';
import { publicFormPath, publicFormUrl } from '@/features/forms/form-paths';
import { CopyLabel, QrCode } from '@/features/forms/share/share-dialog';
import { useCopy } from '@/features/forms/share/use-copy';
import { ApiRequestError } from '@/lib/api';
import { SettingGroup, SettingRow } from '../setting-row';
import { changeFormSlug, formSettingsKey } from '../settings-api';
import { useLiveSection } from '../use-settings';
import { FieldError, OptionSelect, type Option, type SectionProps } from './section-controls';
import { ValidatedInput } from './validated-input';

/** The form's address: changing it keeps the old one working, as a redirect. */
function SlugSetting({ form, slug }: { form: FormDetail; slug: string }) {
  const queryClient = useQueryClient();
  const id = useId();
  const [draft, setDraft] = useState(slug);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const prefix = publicFormUrl('').replace(/\/$/, '');
  const changed = draft.trim().toLowerCase() !== slug;

  const save = async () => {
    const checked = customSlugSchema.safeParse(draft);
    if (!checked.success) {
      setError(checked.error.issues[0]?.message ?? 'Check the address');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const view = await changeFormSlug(form.id, checked.data);
      queryClient.setQueryData(formSettingsKey(form.id), view);
      queryClient.setQueryData<FormDetail>(
        formKeys.detail(form.id),
        (current) => current && { ...current, slug: view.slug },
      );
      void queryClient.invalidateQueries({ queryKey: formKeys.workspace(form.workspaceId) });
      setDraft(view.slug);
      toast.success('Address changed', { description: 'Links to the old one still work.' });
    } catch (caught) {
      setError(
        caught instanceof ApiRequestError && caught.status !== 0
          ? caught.message
          : 'Could not change the address. Try again.',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <Label htmlFor={id} className="sr-only">
        Form address
      </Label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="flex min-w-0 flex-1 items-center rounded-lg border border-input bg-background transition-[border-color] duration-150 ease-standard hover:border-control has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring has-[[aria-invalid]]:border-danger">
          <span className="truncate pl-3 text-14 text-muted-foreground" aria-hidden>
            {prefix.replace(/^https?:\/\//, '')}/
          </span>
          <input
            id={id}
            value={draft}
            autoComplete="off"
            spellCheck={false}
            aria-invalid={error ? true : undefined}
            aria-describedby={`${id}-error ${id}-hint`}
            className="h-9 min-w-24 flex-1 bg-transparent pr-3 text-16 outline-none md:text-14"
            onChange={(event) => {
              setDraft(event.target.value);
              setError(null);
            }}
          />
        </div>
        <Button type="submit" variant="secondary" disabled={!changed || saving}>
          {saving ? 'Saving…' : 'Change'}
        </Button>
      </div>
      <FieldError id={`${id}-error`} message={error} />
      <p id={`${id}-hint`} className="text-13 text-muted-foreground">
        Lowercase letters, numbers and hyphens. Links to the old address keep working.
      </p>
    </form>
  );
}

/** Roughly how a chat app shows the form's link. */
function LinkPreview({
  form,
  slug,
  sharing,
}: {
  form: FormDetail;
  slug: string;
  sharing: SharingSettings;
}) {
  const schema = form.publishedSchema ?? form.draftSchema;
  const title = sharing.socialTitle || form.publishedTitle || form.title;
  const description = sharing.socialDescription || schema.description?.trim() || '';
  const version = form.publishedAt ? new Date(form.publishedAt).getTime() : 0;
  const image =
    sharing.socialImageUrl ??
    (form.publishedAt
      ? `/api/public/forms/${encodeURIComponent(slug)}/og.png?v=${version}`
      : undefined);
  const host =
    publicFormUrl(slug)
      .replace(/^https?:\/\//, '')
      .split('/')[0] ?? '';

  return (
    <figure className="max-w-md overflow-hidden rounded-xl border bg-surface">
      {image ? (
        <img
          src={image}
          alt="How the link looks when shared"
          width={1200}
          height={630}
          className="aspect-[1200/630] w-full border-b bg-muted object-cover"
        />
      ) : (
        <div className="flex aspect-[1200/630] w-full flex-col items-center justify-center gap-2 border-b bg-muted px-6 text-center text-13 text-muted-foreground">
          <ImageOff aria-hidden />
          Made from the form&apos;s look once it is published.
        </div>
      )}
      <figcaption className="flex flex-col gap-0.5 px-4 py-3">
        <span className="text-12 text-muted-foreground">{host}</span>
        <span className="truncate text-14 font-semibold">{title}</span>
        {description && (
          <span className="line-clamp-2 text-13 text-muted-foreground">{description}</span>
        )}
      </figcaption>
    </figure>
  );
}

const socialTitleSchema = sharingSettingsSchema.shape.socialTitle.unwrap();
const socialDescriptionSchema = sharingSettingsSchema.shape.socialDescription.unwrap();

/** Values a choice question takes in a link: its option labels, as people would type them. */
function choiceOptions(field: Field): Option<string>[] | null {
  if (field.type === 'yes_no') {
    return [
      { value: 'yes', label: 'Yes' },
      { value: 'no', label: 'No' },
    ];
  }
  if (field.type === 'single_choice' || field.type === 'dropdown') {
    const labels = [...new Set(field.options.map((option) => option.label.trim()))];
    return labels.filter(Boolean).map((label) => ({ value: label, label }));
  }
  return null;
}

const NOT_SET = '__not_set__';

/** Fills in a few answers and gives the link that starts the form with them. */
function PrefillBuilder({ form, slug }: { form: FormDetail; slug: string }) {
  const schema = form.publishedSchema ?? form.draftSchema;
  const fields = useMemo(
    () =>
      schema.fields.filter(
        (field) => isPrefillable(field) || (field.type === 'hidden' && field.paramName !== ''),
      ),
    [schema],
  );
  const [values, setValues] = useState<Record<string, string>>({});
  const inputRef = useRef<HTMLInputElement>(null);
  const { copied, copy } = useCopy('link', () => inputRef.current?.select());
  const baseId = useId();

  // Hidden fields are named by their parameter; questions by their id.
  const paramOf = (field: Field) => (field.type === 'hidden' ? field.paramName : field.id);
  const link = prefilledLink(
    publicFormUrl(slug),
    Object.fromEntries(
      fields.flatMap((field) => {
        const value = values[field.id];
        return value ? [[paramOf(field), value]] : [];
      }),
    ),
  );

  if (fields.length === 0) {
    return (
      <p className="text-14 text-muted-foreground">
        Add a text, choice, number or date question (or a hidden field) to fill it in from a link.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        {fields.map((field, index) => {
          const id = `${baseId}-${field.id}`;
          const value = values[field.id] ?? '';
          const label =
            field.type === 'hidden'
              ? `Hidden: ${field.paramName}`
              : field.label.trim() || `Question ${index + 1}`;
          const set = (next: string) => {
            setValues((current) => ({ ...current, [field.id]: next }));
          };
          const options = choiceOptions(field);
          const invalid =
            field.type !== 'hidden' &&
            value.trim() !== '' &&
            prefillValue(field, value) === undefined;
          return (
            <div key={field.id} className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor={id} className="truncate">
                {label}
              </Label>
              {options ? (
                <OptionSelect
                  id={id}
                  value={value || NOT_SET}
                  options={[{ value: NOT_SET, label: 'Not filled in' }, ...options]}
                  onChange={(next) => {
                    set(next === NOT_SET ? '' : next);
                  }}
                />
              ) : (
                <Input
                  id={id}
                  value={value}
                  placeholder={
                    field.type === 'multi_choice' ? 'Option labels, separated by commas' : undefined
                  }
                  aria-invalid={invalid ? true : undefined}
                  aria-describedby={`${id}-error`}
                  onChange={(event) => {
                    set(event.target.value);
                  }}
                />
              )}
              <FieldError
                id={`${id}-error`}
                message={invalid ? 'Not a valid answer: the form will leave it empty.' : null}
              />
            </div>
          );
        })}
      </div>
      <div className="flex gap-2">
        <Input
          ref={inputRef}
          readOnly
          aria-label="Prefilled link"
          value={link}
          className="min-w-0 flex-1 font-mono text-13"
          onFocus={(event) => {
            event.currentTarget.select();
          }}
        />
        <Button variant="secondary" className="w-28 shrink-0" onClick={() => void copy(link)}>
          <CopyLabel copied={copied} label="Copy link" />
        </Button>
        <span role="status" className="sr-only">
          {copied ? 'Prefilled link copied' : ''}
        </span>
      </div>
      <p className="text-13 text-muted-foreground">
        Respondents can still change prefilled answers. Questions are matched to the published form.
      </p>
    </div>
  );
}

/** The form's address, how its link looks when shared, prefilled links and its QR code. */
export function SharingSection({ form, view }: SectionProps) {
  const setSharing = useLiveSection(form.id, 'sharing');
  const { hasFeature } = useEntitlements();
  const sharing = view.settings.sharing;
  const ids = { title: useId(), description: useId() };
  const customSocial = hasFeature('custom_social');
  const theme = form.publishedTheme ?? form.theme;

  const setOptional = <K extends keyof SharingSettings>(
    key: K,
    value: SharingSettings[K] | undefined,
    typing: boolean,
  ) => {
    const { [key]: _old, ...rest } = sharing;
    setSharing(value ? { ...rest, [key]: value } : rest, { typing });
  };

  return (
    <div className="flex flex-col gap-6">
      <SettingGroup title="Address">
        <SettingRow
          id="slug"
          label="Form address"
          description={
            <>
              Now at{' '}
              <a
                href={publicFormPath(view.slug)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent underline-offset-4 hover:underline"
              >
                {publicFormPath(view.slug)}
              </a>
              .
            </>
          }
          stacked
        >
          <SlugSetting key={view.slug} form={form} slug={view.slug} />
        </SettingRow>
      </SettingGroup>

      <SettingGroup title="Link preview">
        <SettingRow
          id="social"
          label="When the link is shared"
          description="Chat apps and social sites show this card. Leave a box empty to use the form's title and description."
          stacked
        >
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={ids.title}>Title</Label>
                <ValidatedInput
                  id={ids.title}
                  value={sharing.socialTitle ?? ''}
                  schema={socialTitleSchema}
                  placeholder={form.publishedTitle ?? form.title}
                  onValid={(socialTitle) => {
                    setOptional('socialTitle', socialTitle, true);
                  }}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={ids.description}>Description</Label>
                <ValidatedInput
                  id={ids.description}
                  value={sharing.socialDescription ?? ''}
                  schema={socialDescriptionSchema}
                  multiline
                  rows={3}
                  placeholder="The form's description"
                  onValid={(socialDescription) => {
                    setOptional('socialDescription', socialDescription, true);
                  }}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="flex items-center gap-2 text-14 font-medium">
                  Image
                  {!customSocial && <ProBadge />}
                </span>
                <ThemeImageField
                  kind="content"
                  url={sharing.socialImageUrl}
                  copy={{
                    noun: 'image',
                    hint: "Without one, it is made from the form's look and title. 1200 × 630 works best.",
                  }}
                  onChange={(socialImageUrl) => {
                    setOptional('socialImageUrl', socialImageUrl, false);
                  }}
                />
              </div>
            </div>
            <LinkPreview form={form} slug={view.slug} sharing={sharing} />
          </div>
        </SettingRow>
        <SettingRow
          id="favicon"
          label="Favicon"
          description="The small icon in the browser tab."
          pro={!customSocial}
          stacked
        >
          <ThemeImageField
            kind="content"
            url={sharing.faviconUrl}
            copy={{ noun: 'icon', hint: 'A square PNG, at least 64 × 64, works best.' }}
            onChange={(faviconUrl) => {
              setOptional('faviconUrl', faviconUrl, false);
            }}
          />
        </SettingRow>
      </SettingGroup>

      <SettingGroup title="Links and print">
        <SettingRow
          id="prefill"
          label="Prefilled link"
          description="A link that starts the form with some answers filled in, for example from your CRM or an email."
          stacked
        >
          <PrefillBuilder form={form} slug={view.slug} />
        </SettingRow>
        <SettingRow
          id="qr"
          label="QR code"
          description="In the form's colours when they scan well; dark on white when they would not."
          stacked
        >
          <QrCode
            key={view.slug}
            url={publicFormUrl(view.slug)}
            slug={view.slug}
            colors={qrCodeColors(theme.colors)}
          />
        </SettingRow>
      </SettingGroup>
    </div>
  );
}
