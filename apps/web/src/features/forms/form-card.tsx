import type { FormListItem, FormTheme } from '@formyx/shared';
import { useState } from 'react';
import { Link } from 'react-router';
import { ThemeBackground } from '@/features/form-renderer/theme/background';
import { ThemeThumbnail } from '@/features/form-renderer/theme/theme-thumbnail';
import { themeStyle } from '@/features/form-renderer/theme/theme-variables';
import { formatDateTime, formatRelativeTime } from '@/lib/relative-time';
import { useNearScreen } from '@/lib/use-near-screen';
import { cn } from '@/lib/utils';
import { FormActionsMenu, type FormActionHandler } from './form-actions-menu';
import { isPendingForm } from './form-list-cache';
import { formOpenPath } from './form-paths';
import { FormStatus } from './form-status';
import { responseCountLabel } from './format';

export interface FormItemProps {
  form: FormListItem;
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

/** "12 responses", and "+3 today" when there are new ones. */
function Responses({ form }: { form: FormListItem }) {
  return (
    <span className="tabular-nums">
      {responseCountLabel(form.responseCount)}
      {form.responsesToday > 0 && (
        <span className="text-success-text"> +{form.responsesToday} today</span>
      )}
    </span>
  );
}

/** Stretches the title link over the whole card or row, above everything but the menu. */
const stretchedLink = 'outline-none after:absolute after:inset-0 after:rounded-[inherit]';
/** The link hides its own focus ring; the card shows it instead. */
const focusWithin =
  'has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-2 has-[a:focus-visible]:outline-ring';
/** The actions button: shown on hover or focus, and always on touch screens. */
const revealedMenu =
  'opacity-0 group-hover:opacity-100 group-has-[a:focus-visible]:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100 [@media(hover:none)]:opacity-100';

function FormTitle({ form, canEdit }: { form: FormListItem; canEdit: boolean }) {
  if (isPendingForm(form)) return <span>{form.title}</span>;
  return (
    <Link to={formOpenPath(form.id, canEdit)} className={stretchedLink}>
      {form.title}
    </Link>
  );
}

/** A thumbnail is still: no drifting backgrounds in a grid of them. */
function still(theme: FormTheme): FormTheme {
  return { ...theme, motion: { ...theme.motion, animatedBackground: false } };
}

export function FormCard({ form, now, canEdit, onAction }: FormItemProps) {
  const pending = isPendingForm(form);
  const [thumb, setThumb] = useState<HTMLDivElement | null>(null);
  const near = useNearScreen(thumb);

  return (
    <article
      aria-busy={pending || undefined}
      className={cn(
        'group relative flex h-full flex-col overflow-hidden rounded-xl border bg-card',
        'transition-[border-color,opacity] duration-150 ease-standard hover:border-border-strong',
        focusWithin,
        pending && 'opacity-60',
      )}
    >
      <div ref={setThumb} className="overflow-hidden border-b">
        <div className="transition-transform duration-200 ease-standard motion-safe:group-hover:scale-[1.02]">
          {near ? (
            <ThemeThumbnail
              theme={still(form.theme)}
              title={form.title}
              aspect="16/10"
              className="rounded-none"
            />
          ) : (
            <div className="aspect-[16/10] bg-muted" />
          )}
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-start gap-2">
          <h3 className="min-w-0 flex-1 truncate text-14 leading-8 font-medium">
            <FormTitle form={form} canEdit={canEdit} />
          </h3>
          {!pending && (
            <FormActionsMenu
              form={form}
              canEdit={canEdit}
              onAction={onAction}
              className={cn('relative z-10 -mr-2', revealedMenu)}
            />
          )}
        </div>
        {/* Wraps onto two lines in narrow cards, so it uses spacing rather than separators. */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-13 text-muted-foreground">
          <FormStatus status={form.status} />
          <Responses form={form} />
          <span className="ml-auto">
            <EditedAt updatedAt={form.updatedAt} now={now} />
          </span>
        </div>
      </div>
    </article>
  );
}

/** A form's look as a 40px square, for the list. */
function FormSwatch({ theme }: { theme: FormTheme }) {
  const [box, setBox] = useState<HTMLSpanElement | null>(null);
  const near = useNearScreen(box);
  const look = still(theme);
  return (
    <span
      ref={setBox}
      aria-hidden
      className="relative isolate flex size-10 items-end overflow-hidden rounded-md border bg-muted p-1.5"
      style={near ? themeStyle(look) : undefined}
    >
      {near && (
        <>
          <ThemeBackground theme={look} />
          <span className="block h-2 w-full rounded-[2px] bg-(--form-button-bg)" />
        </>
      )}
    </span>
  );
}

/** Column layout shared by list rows and the list header. */
export const LIST_COLUMNS =
  'grid grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-x-3 @2xl:grid-cols-[2.5rem_minmax(0,1fr)_7rem_10rem_9rem_2rem] @2xl:gap-x-4';

export function FormRow({ form, now, canEdit, onAction }: FormItemProps) {
  const pending = isPendingForm(form);

  return (
    <div
      aria-busy={pending || undefined}
      className={cn(
        LIST_COLUMNS,
        'group relative min-h-16 rounded-[inherit] px-4 py-3',
        'transition-[background-color,opacity] duration-150 ease-standard hover:bg-hover',
        focusWithin,
        pending && 'opacity-60',
      )}
    >
      <FormSwatch theme={form.theme} />
      <div className="min-w-0">
        <p className="truncate text-14 font-medium">
          <FormTitle form={form} canEdit={canEdit} />
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-13 text-muted-foreground @2xl:hidden">
          <FormStatus status={form.status} />
          <span aria-hidden>·</span>
          <Responses form={form} />
        </p>
      </div>
      <div className="hidden text-13 text-muted-foreground @2xl:block">
        <FormStatus status={form.status} />
      </div>
      <div className="hidden text-13 text-muted-foreground @2xl:block">
        <Responses form={form} />
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
