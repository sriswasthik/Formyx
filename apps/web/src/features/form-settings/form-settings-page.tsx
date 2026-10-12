import {
  hasRole,
  qrCodeColors,
  isSameFormSchema,
  isSameJson,
  type FormDetail,
} from '@formyx/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowLeft,
  Check,
  FileQuestion,
  LoaderCircle,
  Lock,
  Search,
  Upload,
} from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { usePageTitle } from '@/app/page-title';
import { ActionTooltip } from '@/components/action-tooltip';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { useSession } from '@/features/auth/session-context';
import { FormNav, INLINE_FORM_NAV_QUERY } from '@/features/forms/form-nav';
import { FormStatusBadge } from '@/features/forms/form-status-badge';
import { formKeys } from '@/features/forms/form-list-cache';
import { publishForm } from '@/features/forms/forms-api';
import { ShareDialog } from '@/features/forms/share/share-dialog';
import { ApiRequestError } from '@/lib/api';
import { useMediaQuery } from '@/lib/use-media-query';
import { cn } from '@/lib/utils';
import { SaveQueueProvider, type DescribeError } from './save-queue';
import { useSaveQueue } from './save-queue-context';
import { AccessSection } from './sections/access-section';
import { AutoresponderSection } from './sections/autoresponder-section';
import { DataSection } from './sections/data-section';
import { ExperienceSection } from './sections/experience-section';
import { GeneralSection } from './sections/general-section';
import { NotificationsSection } from './sections/notifications-section';
import { SharingSection } from './sections/sharing-section';
import {
  isSettingsSection,
  searchSettings,
  SECTION_INFO,
  SETTINGS_SECTIONS,
  settingAnchor,
  type SettingsSection,
} from './settings-index';
import { useFormDetailQuery, useFormSettingsQuery } from './use-settings';

const PAGE_PADDING = 'px-4 sm:px-6 md:px-8 lg:px-10';

const describeSaveError: DescribeError = (error) => {
  if (error instanceof ApiRequestError) {
    if (error.status === 409) return 'Changed somewhere else; the latest is shown';
    if (error.code === 'UPGRADE_REQUIRED') return 'Your plan does not include this';
    if (error.code === 'NETWORK_ERROR') return 'Offline';
    return error.message;
  }
  return 'Something went wrong';
};

/** Saving…, Saved, or what went wrong with a way to try again. */
function SaveStatus() {
  const { status, error, retry } = useSaveQueue();
  return (
    <div role="status" aria-live="polite" className="flex items-center gap-2 text-13">
      {status === 'saving' && (
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <LoaderCircle aria-hidden className="motion-safe:animate-spin" />
          Saving…
        </span>
      )}
      {status === 'saved' && (
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <Check aria-hidden />
          Saved
        </span>
      )}
      {status === 'error' && (
        <span className="flex items-center gap-1.5 text-danger-text">
          <AlertCircle aria-hidden />
          <span className="hidden sm:inline">Couldn&apos;t save{error ? `: ${error}` : ''}</span>
          <span className="sm:hidden">Couldn&apos;t save</span>
          <Button variant="ghost" size="sm" onClick={retry}>
            Retry
          </Button>
        </span>
      )}
    </div>
  );
}

/** Finds a setting by name, and goes to it. */
function SettingsSearch({ onPick }: { onPick: (section: SettingsSection, id: string) => void }) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listId = useId();
  const results = searchSettings(query);
  const pick = (index: number) => {
    const result = results[index];
    if (!result) return;
    onPick(result.section, result.id);
    setQuery('');
  };

  return (
    <div className="relative">
      <Search
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        type="search"
        role="combobox"
        aria-label="Search settings"
        aria-expanded={results.length > 0}
        aria-controls={listId}
        aria-activedescendant={results.length > 0 ? `${listId}-${active}` : undefined}
        placeholder="Search settings"
        className="pl-8"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setActive(0);
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setActive((index) => Math.min(index + 1, results.length - 1));
          } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setActive((index) => Math.max(index - 1, 0));
          } else if (event.key === 'Enter') {
            event.preventDefault();
            pick(active);
          } else if (event.key === 'Escape') {
            setQuery('');
          }
        }}
      />
      {query.trim() !== '' && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Matching settings"
          className="absolute inset-x-0 top-full z-20 mt-1 max-h-80 overflow-y-auto rounded-lg border bg-popover p-1 shadow-popover"
        >
          {results.length === 0 ? (
            <li className="px-2 py-1.5 text-13 text-muted-foreground">No settings match</li>
          ) : (
            results.map((result, index) => (
              <li
                key={result.id}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={index === active}
                className={cn(
                  'flex cursor-pointer flex-col rounded-md px-2 py-1.5',
                  index === active ? 'bg-hover' : 'hover:bg-hover',
                )}
                onMouseDown={(event) => {
                  // Before the input loses focus and the list closes.
                  event.preventDefault();
                  pick(index);
                }}
              >
                <span className="text-13 font-medium">{result.label}</span>
                <span className="text-12 text-muted-foreground">
                  {SECTION_INFO[result.section].label}
                </span>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

function SectionNav({
  current,
  onChange,
}: {
  current: SettingsSection;
  onChange: (section: SettingsSection) => void;
}) {
  return (
    <nav aria-label="Settings sections">
      <ul className="flex flex-col gap-0.5">
        {SETTINGS_SECTIONS.map((section) => {
          const { label, icon: Icon } = SECTION_INFO[section];
          return (
            <li key={section}>
              <button
                type="button"
                aria-current={section === current ? 'page' : undefined}
                onClick={() => {
                  onChange(section);
                }}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-14 text-muted-foreground',
                  'transition-colors duration-150 ease-standard hover:bg-hover hover:text-foreground active:bg-pressed',
                  'aria-[current=page]:bg-pressed aria-[current=page]:font-medium aria-[current=page]:text-foreground',
                )}
              >
                <Icon aria-hidden />
                {label}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Whether the draft's settings or look differ from what respondents see now. */
function hasUnpublishedSettings(form: FormDetail): boolean {
  if (!form.publishedSchema) return false;
  return (
    !isSameJson(form.draftSchema.settings, form.publishedSchema.settings) ||
    (form.publishedTheme !== null && !isSameJson(form.theme, form.publishedTheme)) ||
    !isSameFormSchema(form.draftSchema, form.publishedSchema)
  );
}

function PublishBanner({ form }: { form: FormDetail }) {
  const queryClient = useQueryClient();
  const publish = useMutation({
    mutationFn: () => publishForm(form.id, form.version),
    onSuccess: (published) => {
      queryClient.setQueryData(formKeys.detail(form.id), published);
      toast.success('Published', { description: 'Respondents see the changes now.' });
    },
    onError: (error) => {
      toast.error('Could not publish', {
        description:
          error instanceof ApiRequestError && error.code === 'FORM_INCOMPLETE'
            ? 'Some questions need finishing first. Open the editor to see what.'
            : 'Check your connection and try again.',
      });
    },
  });
  if (!hasUnpublishedSettings(form)) return null;
  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-surface px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-13 text-muted-foreground">
        The form has unpublished changes. Language, formats and its look reach respondents when you
        publish.
      </p>
      <Button
        size="sm"
        variant="secondary"
        disabled={publish.isPending}
        onClick={() => {
          publish.mutate();
        }}
      >
        <Upload aria-hidden />
        Publish
      </Button>
    </div>
  );
}

function SettingsWorkspace({ form }: { form: FormDetail }) {
  const settingsQuery = useFormSettingsQuery(form.id);
  const [params, setParams] = useSearchParams();
  const requested = params.get('section');
  const section: SettingsSection = isSettingsSection(requested) ? requested : 'general';
  const target = params.get('setting');
  const [shareOpen, setShareOpen] = useState(false);
  const shareButton = useRef<HTMLButtonElement>(null);
  const inlineNav = useMediaQuery(INLINE_FORM_NAV_QUERY);
  const published = form.publishedSchema !== null;
  usePageTitle(`Settings · ${form.title}`);

  const go = (next: SettingsSection, setting?: string) => {
    setParams(
      (current) => {
        const updated = new URLSearchParams(current);
        updated.set('section', next);
        if (setting) updated.set('setting', setting);
        else updated.delete('setting');
        return updated;
      },
      { replace: true },
    );
  };

  // A deep link or a search result: bring the setting into view, briefly marked, and focus it.
  useEffect(() => {
    if (!target || !settingsQuery.data) return;
    const row = document.getElementById(settingAnchor(target));
    if (!row) return;
    row.scrollIntoView({ block: 'center' });
    row.dataset.highlight = 'true';
    row.querySelector<HTMLElement>('input, button, textarea, [role="combobox"]')?.focus({
      preventScroll: true,
    });
    const timer = setTimeout(() => {
      row.dataset.highlight = 'false';
    }, 1600);
    return () => {
      clearTimeout(timer);
    };
  }, [target, section, settingsQuery.data]);

  const info = SECTION_INFO[section];
  let body: React.ReactNode;
  if (settingsQuery.isPending) {
    body = (
      <div role="status" aria-label="Loading settings" className="flex flex-col gap-3">
        {[0, 1, 2].map((item) => (
          <Skeleton key={item} className="h-20 rounded-xl" />
        ))}
      </div>
    );
  } else if (settingsQuery.isError) {
    body = (
      <ErrorState
        title="Could not load the settings"
        description="Check your connection and try again."
        action={
          <Button
            variant="secondary"
            disabled={settingsQuery.isFetching}
            onClick={() => void settingsQuery.refetch()}
          >
            Try again
          </Button>
        }
      />
    );
  } else {
    const view = settingsQuery.data;
    const props = { form, view };
    body =
      section === 'general' ? (
        <GeneralSection {...props} />
      ) : section === 'access' ? (
        <AccessSection {...props} />
      ) : section === 'experience' ? (
        <ExperienceSection {...props} />
      ) : section === 'notifications' ? (
        <NotificationsSection {...props} />
      ) : section === 'autoresponder' ? (
        <AutoresponderSection {...props} />
      ) : section === 'sharing' ? (
        <SharingSection {...props} />
      ) : (
        <DataSection {...props} />
      );
  }

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b bg-background px-2 sm:px-3">
        <ActionTooltip label="All forms">
          <Button asChild variant="ghost" size="icon-sm">
            <Link to="/app/forms" aria-label="Back to all forms">
              <ArrowLeft aria-hidden />
            </Link>
          </Button>
        </ActionTooltip>
        <Separator orientation="vertical" className="h-5" />
        <div className="flex min-w-0 flex-1 items-center gap-3 pl-1">
          <h1 className="truncate text-14 font-semibold tracking-tight">{form.title}</h1>
          <FormStatusBadge status={form.status} className="hidden sm:inline-flex" />
        </div>
        <SaveStatus />
        <Separator orientation="vertical" className="mx-1 hidden h-5 sm:block" />
        <FormNav
          formId={form.id}
          current="settings"
          canEdit
          published={published}
          shareRef={shareButton}
          onShare={() => {
            setShareOpen(true);
          }}
        />
      </header>

      <main id="main-content" className={`flex-1 py-6 lg:py-8 ${PAGE_PADDING}`}>
        <div className="mx-auto grid w-full max-w-6xl gap-6 lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-10">
          <aside className="flex flex-col gap-4 lg:sticky lg:top-22 lg:self-start">
            <SettingsSearch onPick={go} />
            <div className="hidden lg:block">
              <SectionNav
                current={section}
                onChange={(next) => {
                  go(next);
                }}
              />
            </div>
            <div className="lg:hidden">
              <Select
                value={section}
                onValueChange={(value) => {
                  if (isSettingsSection(value)) go(value);
                }}
              >
                <SelectTrigger aria-label="Settings section">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SETTINGS_SECTIONS.map((item) => (
                    <SelectItem key={item} value={item}>
                      {SECTION_INFO[item].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </aside>

          <div className="flex min-w-0 flex-col gap-6">
            <PublishBanner form={form} />
            <div className="flex flex-col gap-1">
              <h2 className="text-20 font-semibold tracking-tight">{info.label}</h2>
              <p className="text-14 text-muted-foreground">{info.description}</p>
            </div>
            {body}
          </div>
        </div>
      </main>

      {published && (
        <ShareDialog
          open={shareOpen}
          onOpenChange={setShareOpen}
          slug={form.slug}
          closed={form.status === 'CLOSED'}
          justPublished={false}
          qrColors={qrCodeColors((form.publishedTheme ?? form.theme).colors)}
          {...(inlineNav && { returnFocusTo: shareButton })}
        />
      )}
    </div>
  );
}

function PageSkeleton() {
  return (
    <div role="status" aria-label="Loading settings" className="flex min-h-dvh flex-col">
      <div className="flex h-14 items-center gap-3 border-b px-3">
        <Skeleton className="size-8" />
        <Skeleton className="h-5 w-48" />
        <Skeleton className="ml-auto h-8 w-56" />
      </div>
      <div
        className={`mx-auto grid w-full max-w-6xl gap-10 py-8 lg:grid-cols-[14rem_1fr] ${PAGE_PADDING}`}
      >
        <Skeleton className="h-64" />
        <div className="flex flex-col gap-4">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-48 rounded-xl" />
        </div>
      </div>
    </div>
  );
}

/** A form's settings, a section at a time, saved as they change. Editors and owners only. */
export function FormSettingsPage() {
  const { formId = '' } = useParams();
  const { workspaces } = useSession();
  const formQuery = useFormDetailQuery(formId);

  if (formQuery.isPending) return <PageSkeleton />;

  if (formQuery.isError) {
    const status = formQuery.error instanceof ApiRequestError ? formQuery.error.status : 0;
    return (
      <main className="flex min-h-dvh items-center justify-center px-6">
        {status === 404 || status === 403 ? (
          <EmptyState
            className="w-full max-w-md border-none"
            icon={status === 404 ? FileQuestion : Lock}
            title={status === 404 ? 'Form not found' : "You don't have access to this form"}
            description={
              status === 404
                ? 'It may have been deleted, or the link is wrong.'
                : 'It belongs to a workspace you are not a member of.'
            }
            action={
              <Button asChild variant="secondary">
                <Link to="/app/forms">Back to forms</Link>
              </Button>
            }
          />
        ) : (
          <ErrorState
            className="w-full max-w-md border-none"
            title="Could not load this form"
            description="Check your connection and try again."
            action={
              <Button disabled={formQuery.isFetching} onClick={() => void formQuery.refetch()}>
                Try again
              </Button>
            }
          />
        )}
      </main>
    );
  }

  const form = formQuery.data;
  const role = workspaces.find((workspace) => workspace.id === form.workspaceId)?.role;
  if (!role || !hasRole(role, 'EDITOR')) {
    return (
      <main className="flex min-h-dvh items-center justify-center px-6">
        <EmptyState
          className="w-full max-w-md border-none"
          icon={Lock}
          title="Settings are for editors"
          description="Ask an owner of the workspace to make you an editor."
          action={
            <Button asChild variant="secondary">
              <Link to="/app/forms">Back to forms</Link>
            </Button>
          }
        />
      </main>
    );
  }

  return (
    <SaveQueueProvider describeError={describeSaveError}>
      <SettingsWorkspace form={form} />
    </SaveQueueProvider>
  );
}
