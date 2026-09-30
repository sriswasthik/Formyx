import type { FormSummary } from '@formyx/shared';
import { Link } from 'react-router';
import { formatDateTime, formatRelativeTime } from '@/lib/relative-time';
import { cn } from '@/lib/utils';
import { FormActionsMenu, type FormActionHandler } from './form-actions-menu';
import { isPendingForm } from './form-list-cache';
import { FormStatusBadge } from './form-status-badge';
import { responseCountLabel } from './format';

export interface FormItemProps {
  form: FormSummary;
  /** Shared clock, so every "edited" time on the page refreshes together. */
  now: Date;
  canEdit: boolean;
  onAction: FormActionHandler;
}

export function EditedAt({ updatedAt, now }: { updatedAt: string; now: Date }) {
  return (
    <time dateTime={updatedAt} title={formatDateTime(updatedAt)}>
      Edited {formatRelativeTime(updatedAt, now)}
    </time>
  );
}

/** Stretches the title link over the whole card or row, above everything but the menu. */
const stretchedLink = 'outline-none after:absolute after:inset-0 after:rounded-[inherit]';
/** The link hides its own focus ring; the card shows it instead. */
const focusWithin =
  'has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-2 has-[a:focus-visible]:outline-ring';

function FormTitle({ form }: { form: FormSummary }) {
  if (isPendingForm(form)) return <span>{form.title}</span>;
  return (
    <Link to={`/app/forms/${form.id}`} className={stretchedLink}>
      {form.title}
    </Link>
  );
}

export function FormCard({ form, now, canEdit, onAction }: FormItemProps) {
  const pending = isPendingForm(form);

  return (
    <article
      aria-busy={pending || undefined}
      className={cn(
        'relative flex h-full min-h-36 flex-col rounded-xl border bg-card p-5',
        'transition-[border-color,opacity] duration-150 ease-standard hover:border-border-strong',
        focusWithin,
        pending && 'opacity-60',
      )}
    >
      <div className="flex items-start gap-3">
        <h3 className="line-clamp-2 min-w-0 flex-1 text-14 leading-snug font-medium break-words">
          <FormTitle form={form} />
        </h3>
        {!pending && (
          <FormActionsMenu
            form={form}
            canEdit={canEdit}
            onAction={onAction}
            className="relative z-10 -mt-1.5 -mr-2"
          />
        )}
      </div>
      {/* Wraps onto two lines in narrow cards, so it uses spacing rather than separators. */}
      <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1.5 pt-6 text-13 text-muted-foreground">
        <FormStatusBadge status={form.status} />
        <span className="tabular-nums">{responseCountLabel(form.responseCount)}</span>
        <span className="ml-auto">
          <EditedAt updatedAt={form.updatedAt} now={now} />
        </span>
      </div>
    </article>
  );
}

/** Column layout shared by list rows and the list header. */
export const LIST_COLUMNS =
  'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 @2xl:grid-cols-[minmax(0,1fr)_6rem_8rem_8rem_2rem]';

export function FormRow({ form, now, canEdit, onAction }: FormItemProps) {
  const pending = isPendingForm(form);

  return (
    <div
      aria-busy={pending || undefined}
      className={cn(
        LIST_COLUMNS,
        'relative min-h-14 rounded-[inherit] px-4 py-2.5',
        'transition-[background-color,opacity] duration-150 ease-standard hover:bg-hover',
        focusWithin,
        pending && 'opacity-60',
      )}
    >
      <div className="min-w-0">
        <p className="truncate text-14 font-medium">
          <FormTitle form={form} />
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-13 text-muted-foreground @2xl:hidden">
          <FormStatusBadge status={form.status} />
          <span className="tabular-nums">{responseCountLabel(form.responseCount)}</span>
          <span aria-hidden>·</span>
          <EditedAt updatedAt={form.updatedAt} now={now} />
        </p>
      </div>
      <div className="hidden @2xl:block">
        <FormStatusBadge status={form.status} />
      </div>
      <div className="hidden text-13 text-muted-foreground tabular-nums @2xl:block">
        {responseCountLabel(form.responseCount)}
      </div>
      <div className="hidden truncate text-13 text-muted-foreground @2xl:block">
        <EditedAt updatedAt={form.updatedAt} now={now} />
      </div>
      <div className="flex justify-end">
        {!pending && (
          <FormActionsMenu
            form={form}
            canEdit={canEdit}
            onAction={onAction}
            className="relative z-10 -mr-2"
          />
        )}
      </div>
    </div>
  );
}
