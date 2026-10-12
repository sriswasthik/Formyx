import { isSameFormSchema, isSameJson, type FormDetail } from '@formyx/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, Upload } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { usePageTitle } from '@/app/page-title';
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
import { Skeleton } from '@/components/ui/skeleton';
import { EditorFormPage, FORM_PAGE_PADDING } from '@/features/forms/editor-form-page';
import { FormTopBar } from '@/features/forms/form-top-bar';
import { formKeys } from '@/features/forms/form-list-cache';
import { publishForm } from '@/features/forms/forms-api';
import { ApiRequestError } from '@/lib/api';
import { cn } from '@/lib/utils';
import { SaveQueueProvider, type DescribeError } from './save-queue';
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
import { SaveStatus } from './save-status';
import { useFormSettingsQuery } from './use-settings';

const describeSaveError: DescribeError = (error) => {
  if (error instanceof ApiRequestError) {
    if (error.status === 409) return 'Changed somewhere else; the latest is shown';
    if (error.code === 'UPGRADE_REQUIRED') return 'Your plan does not include this';
    if (error.code === 'NETWORK_ERROR') return 'Offline';
    return error.message;
  }
  return 'Something went wrong';
};

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
      <FormTopBar form={form} current="settings">
        <SaveStatus />
      </FormTopBar>

      <main id="main-content" className={`flex-1 py-6 lg:py-8 ${FORM_PAGE_PADDING}`}>
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
    </div>
  );
}

/** A form's settings, a section at a time, saved as they change. Editors and owners only. */
export function FormSettingsPage() {
  return (
    <EditorFormPage deniedTitle="Settings are for editors">
      {(form) => (
        <SaveQueueProvider describeError={describeSaveError}>
          <SettingsWorkspace form={form} />
        </SaveQueueProvider>
      )}
    </EditorFormPage>
  );
}
