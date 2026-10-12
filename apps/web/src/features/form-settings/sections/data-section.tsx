import { RETENTION_DAYS_MAX, type FormDetail } from '@formyx/shared';
import { useQueryClient } from '@tanstack/react-query';
import { Download, ShieldCheck, Trash2 } from 'lucide-react';
import { useId, useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ProBadge } from '@/features/entitlements/pro-badge';
import { useEntitlements } from '@/features/entitlements/use-entitlements';
import { formKeys } from '@/features/forms/form-list-cache';
import { formatCount } from '@/features/responses/format';
import { responseKeys } from '@/features/responses/response-cache';
import { exportResponsesUrl } from '@/features/responses/responses-api';
import { ApiRequestError } from '@/lib/api';
import { SettingGroup, SettingRow } from '../setting-row';
import { deleteAllResponses } from '../settings-api';
import { useLiveSection } from '../use-settings';
import { FieldError, OptionSelect, type Option, type SectionProps } from './section-controls';
import { ValidatedInput } from './validated-input';

/** Common choices; "Custom" takes any number of days. */
const RETENTION_PRESETS = [30, 90, 180, 365] as const;
const KEEP = 'keep';
const CUSTOM = 'custom';

const RETENTION_OPTIONS: Option<string>[] = [
  { value: KEEP, label: 'Never: keep them' },
  ...RETENTION_PRESETS.map((days) => ({ value: String(days), label: `After ${days} days` })),
  { value: CUSTOM, label: 'After a number of days…' },
];

const daysSchema = z
  .string()
  .trim()
  .regex(/^\d+$/, 'Enter a whole number of days')
  .transform(Number)
  .refine(
    (days) => days >= 1 && days <= RETENTION_DAYS_MAX,
    `Use a number from 1 to ${RETENTION_DAYS_MAX.toLocaleString('en-IN')}`,
  );

function RetentionSetting({
  days,
  onChange,
}: {
  days: number | null;
  onChange: (days: number | null) => void;
}) {
  const selectId = useId();
  const daysId = useId();
  const preset =
    days === null ? KEEP : RETENTION_PRESETS.some((d) => d === days) ? String(days) : CUSTOM;
  const [custom, setCustom] = useState(preset === CUSTOM);
  const choice = custom ? CUSTOM : preset;

  return (
    <div className="flex flex-col gap-3">
      <OptionSelect
        id={selectId}
        label="Delete responses automatically"
        value={choice}
        options={RETENTION_OPTIONS}
        onChange={(next) => {
          setCustom(next === CUSTOM);
          if (next === KEEP) onChange(null);
          else if (next !== CUSTOM) onChange(Number(next));
        }}
      />
      {choice === CUSTOM && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={daysId}>Days to keep each response</Label>
          <ValidatedInput
            id={daysId}
            value={days === null ? '' : String(days)}
            schema={daysSchema}
            inputMode="numeric"
            placeholder="60"
            onValid={onChange}
          />
        </div>
      )}
    </div>
  );
}

/** Deletes every response, after the form's title is typed to confirm. */
function DeleteAll({ form }: { form: FormDetail }) {
  const queryClient = useQueryClient();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const matches = typed.trim() === form.title.trim();

  const remove = async () => {
    setDeleting(true);
    setError(null);
    try {
      const { deleted } = await deleteAllResponses(form.id, typed);
      queryClient.setQueryData<FormDetail>(
        formKeys.detail(form.id),
        (current) => current && { ...current, responseCount: 0 },
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: responseKeys.all(form.id) }),
        queryClient.invalidateQueries({ queryKey: formKeys.workspace(form.workspaceId) }),
      ]);
      setOpen(false);
      toast.success(
        deleted === 1 ? 'Deleted 1 response' : `Deleted ${formatCount(deleted)} responses`,
      );
    } catch (caught) {
      setError(caught instanceof ApiRequestError ? caught.message : 'Could not delete. Try again.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <Button
        variant="secondary"
        className="text-danger-text"
        disabled={form.responseCount === 0}
        onClick={() => {
          setTyped('');
          setError(null);
          setOpen(true);
        }}
      >
        <Trash2 aria-hidden />
        Delete all responses
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <form
            className="contents"
            onSubmit={(event) => {
              event.preventDefault();
              if (matches && !deleting) void remove();
            }}
          >
            <AlertDialogHeader>
              <AlertDialogTitle>
                Delete all {formatCount(form.responseCount)}{' '}
                {form.responseCount === 1 ? 'response' : 'responses'}?
              </AlertDialogTitle>
              <AlertDialogDescription>
                Every answer and uploaded file goes, for everyone, and the summary starts again from
                nothing. This can&apos;t be undone: download them first if you need them.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={id}>
                Type <span className="font-semibold">{form.title}</span> to confirm
              </Label>
              <Input
                id={id}
                value={typed}
                autoComplete="off"
                aria-invalid={error ? true : undefined}
                aria-describedby={`${id}-error`}
                onChange={(event) => {
                  setTyped(event.target.value);
                }}
              />
              <FieldError id={`${id}-error`} message={error} />
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel type="button">Cancel</AlertDialogCancel>
              <Button type="submit" variant="destructive" disabled={!matches || deleting}>
                {deleting ? 'Deleting…' : 'Delete all responses'}
              </Button>
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/** How long responses are kept, what is not kept at all, and taking them out. */
export function DataSection({ form, view }: SectionProps) {
  const setData = useLiveSection(form.id, 'data');
  const { hasFeature } = useEntitlements();
  const excel = hasFeature('excel_export');
  const none = form.responseCount === 0;

  return (
    <div className="flex flex-col gap-6">
      <SettingGroup title="Keeping responses">
        <SettingRow
          id="retention"
          label="Delete responses automatically"
          description="Responses older than this are deleted, with their files, once an hour."
        >
          <RetentionSetting
            days={view.settings.data.retentionDays}
            onChange={(retentionDays) => {
              setData({ retentionDays }, { typing: true });
            }}
          />
        </SettingRow>
        <SettingRow id="ip" label="IP addresses" stacked>
          <p className="flex items-start gap-2 text-14">
            <ShieldCheck aria-hidden className="mt-0.5 shrink-0 text-success" />
            <span>
              Formyx never stores respondents&apos; IP addresses. They are used only for a moment,
              to slow down spam, and then forgotten.
            </span>
          </p>
        </SettingRow>
      </SettingGroup>

      <SettingGroup title="Taking them out">
        <SettingRow
          id="export"
          label="Download responses"
          description={
            none
              ? 'Nothing to download yet.'
              : `All ${formatCount(form.responseCount)}, with every answer, as a file.`
          }
          stacked
        >
          <div className="flex flex-wrap items-center gap-2">
            {none ? (
              <Button variant="secondary" disabled>
                <Download aria-hidden />
                CSV
              </Button>
            ) : (
              <Button asChild variant="secondary">
                <a href={exportResponsesUrl(form.id, 'csv')} download>
                  <Download aria-hidden />
                  CSV
                </a>
              </Button>
            )}
            {none || !excel ? (
              <Button variant="secondary" disabled>
                <Download aria-hidden />
                Excel
              </Button>
            ) : (
              <Button asChild variant="secondary">
                <a href={exportResponsesUrl(form.id, 'xlsx')} download>
                  <Download aria-hidden />
                  Excel
                </a>
              </Button>
            )}
            {!excel && <ProBadge />}
          </div>
        </SettingRow>
        <SettingRow
          id="delete-all"
          label="Delete all responses"
          description="Keeps the form and its link; only the responses go."
        >
          <DeleteAll form={form} />
        </SettingRow>
      </SettingGroup>
    </div>
  );
}
