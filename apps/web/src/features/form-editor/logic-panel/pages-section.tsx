import {
  createJump,
  formPages,
  isAnswerableFieldType,
  MAX_JUMPS_PER_PAGE,
  pageTitle,
  START_PAGE_KEY,
  type FormLogic,
  type Jump,
  type PageLayout,
} from '@formyx/shared';
import { Crosshair, Plus, Trash2 } from 'lucide-react';
import { ActionTooltip } from '@/components/action-tooltip';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ProBadge } from '@/features/entitlements/pro-badge';
import { focusQuestion } from '../canvas/focus-question';
import { useEditorEntitlements } from '../editor-entitlements';
import { useEditorStore } from '../editor-store-context';
import { createCondition } from '../logic/condition-edits';
import { SettingsSection } from '../settings/settings-section';
import { SwitchSetting } from '../settings/switch-setting';
import { LogicConditions, type LogicSources } from './logic-conditions';
import { PipedTextField } from './piped-text-field';
import { issuesAt, useLogicIssues } from './use-logic-issues';

type PageSettingsUpdate = (
  update: (page: FormLogic['pages'][string]) => FormLogic['pages'][string],
  mergeKey?: string,
) => void;

/** A key for a jump's destination in its picker. */
const targetKey = (jump: Jump) =>
  jump.to.kind === 'page' ? `page:${jump.to.pageKey}` : `end:${jump.to.endScreenId}`;

interface PageCardProps {
  page: PageLayout;
  pages: readonly PageLayout[];
  number: number;
  onUpdate: PageSettingsUpdate;
}

function PageCard({ page, pages, number, onUpdate }: PageCardProps) {
  const schema = useEditorStore((state) => state.schema);
  const updateField = useEditorStore((state) => state.updateField);
  const selectField = useEditorStore((state) => state.selectField);
  const { hasFeature } = useEditorEntitlements();
  const issues = issuesAt(useLogicIssues(), `pages.${page.key}`);
  const settings = schema.logic.pages[page.key] ?? {};
  const jumps = settings.jumps ?? [];
  const name = `Page ${number}`;
  const later = pages.filter((candidate) => candidate.index > page.index);

  // Questions on this page or before, numbered as on the canvas.
  const lastIndex = schema.fields.findIndex(
    (field) => field.id === (pages[page.index + 1]?.pageBreak?.id ?? ''),
  );
  const before = lastIndex === -1 ? schema.fields : schema.fields.slice(0, lastIndex);
  const sources: LogicSources = {
    fields: before
      .map((field, index) => ({ field, position: index + 1 }))
      .filter(({ field }) => isAnswerableFieldType(field.type)),
    variables: schema.logic.variables,
    quiz: false,
  };
  const pipe = {
    fields: schema.fields
      .slice(0, page.pageBreak ? schema.fields.indexOf(page.pageBreak) : 0)
      .map((field, index) => ({ field, position: index + 1 }))
      .filter(({ field }) => isAnswerableFieldType(field.type)),
    variables: schema.logic.variables,
    quiz: false,
  };

  const setJumps = (next: Jump[], mergeKey?: string) => {
    onUpdate((current) => ({ ...current, jumps: next }), mergeKey);
  };
  const addJump = () => {
    const to = later.at(-1);
    const jump = createJump(
      to
        ? { kind: 'page', pageKey: to.key }
        : { kind: 'end', endScreenId: schema.logic.endScreens[0]?.id ?? '' },
    );
    // Starts with a condition to fill in, so the new jump does nothing until it is.
    const first = sources.fields.at(-1)?.field;
    setJumps([
      ...jumps,
      first ? { ...jump, when: [{ kind: 'answer', ...createCondition(first) }] } : jump,
    ]);
  };

  return (
    <li className="flex flex-col gap-4 rounded-lg border p-4" aria-label={name}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h4 className="text-14 font-medium">{name}</h4>
          <p className="text-12 text-muted-foreground">
            {page.fields.length === 1 ? '1 question' : `${page.fields.length} questions`}
          </p>
        </div>
        <ActionTooltip label="Show on the canvas">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Show ${name.toLowerCase()} on the canvas`}
            onClick={() => {
              const id = page.pageBreak?.id ?? page.fields[0]?.id ?? null;
              selectField(id);
              focusQuestion(id);
            }}
          >
            <Crosshair aria-hidden />
          </Button>
        </ActionTooltip>
      </div>

      {page.key === START_PAGE_KEY ? (
        <PipedTextField
          id={`page-${page.key}-title`}
          label="Title"
          hint="Optional. Shown above the first page's questions."
          value={settings.title ?? ''}
          maxLength={200}
          error={issues.title}
          onChange={(title) => {
            onUpdate(({ title: _old, ...rest }) => (title ? { ...rest, title } : rest), 'title');
          }}
        />
      ) : (
        page.pageBreak && (
          <PipedTextField
            id={`page-${page.key}-title`}
            label="Title"
            hint="Optional. Shown at the top of the page."
            value={page.pageBreak.label}
            maxLength={500}
            pipe={pipe}
            onChange={(label) => {
              if (page.pageBreak) {
                updateField(
                  page.pageBreak.id,
                  { label },
                  { mergeKey: `label:${page.pageBreak.id}` },
                );
              }
            }}
          />
        )
      )}

      <SwitchSetting
        id={`page-${page.key}-shuffle`}
        label="Shuffle questions"
        hint="Each respondent sees this page's questions in their own order."
        checked={settings.shuffleQuestions === true}
        onCheckedChange={(shuffle) => {
          onUpdate(({ shuffleQuestions: _old, ...rest }) =>
            shuffle ? { ...rest, shuffleQuestions: true } : rest,
          );
        }}
      />

      <div className="flex flex-col gap-3">
        <h5 className="flex items-center gap-1.5 text-13 font-medium">
          After this page
          {!hasFeature('advanced_logic') && <ProBadge feature="advanced_logic" />}
        </h5>
        {jumps.length === 0 && (
          <p className="text-13 text-muted-foreground">
            {later.length > 0 ? 'Respondents go on to the next page.' : 'The form ends here.'}
          </p>
        )}
        <ol className="flex flex-col gap-3" aria-label={`${name}: jumps`}>
          {jumps.map((jump, index) => {
            const label = `${name}, jump ${index + 1}`;
            const jumpIssues = issuesAt(issues, `jumps.${index}`);
            return (
              <li
                key={jump.id}
                className="flex flex-col gap-3 rounded-lg bg-surface p-3"
                aria-label={label}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-12 font-medium text-muted-foreground">
                    Jump {index + 1}
                  </span>
                  <ActionTooltip label="Remove jump">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="-mr-1.5 size-6"
                      aria-label={`Remove ${label.toLowerCase()}`}
                      onClick={() => {
                        setJumps(jumps.filter((candidate) => candidate.id !== jump.id));
                      }}
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  </ActionTooltip>
                </div>
                <LogicConditions
                  label={label}
                  conditions={jump.when}
                  match={jump.match}
                  sources={sources}
                  issues={issuesAt(jumpIssues, 'when')}
                  emptyText="Always"
                  onChange={(when, match, typing) => {
                    setJumps(
                      jumps.map((candidate) =>
                        candidate.id === jump.id ? { ...candidate, when, match } : candidate,
                      ),
                      typing ? `jump:${jump.id}` : undefined,
                    );
                  }}
                />
                <div className="flex flex-col gap-1.5">
                  <span id={`${jump.id}-target`} className="text-13 font-medium">
                    Go to
                  </span>
                  <Select
                    value={targetKey(jump)}
                    onValueChange={(value) => {
                      const [kind, id = ''] = value.split(/:(.*)/s);
                      const to: Jump['to'] =
                        kind === 'page'
                          ? { kind: 'page', pageKey: id }
                          : { kind: 'end', endScreenId: id };
                      setJumps(
                        jumps.map((candidate) =>
                          candidate.id === jump.id ? { ...candidate, to } : candidate,
                        ),
                      );
                    }}
                  >
                    <SelectTrigger
                      aria-labelledby={`${jump.id}-target`}
                      aria-invalid={jumpIssues.to ? true : undefined}
                      className="w-full"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {later.length > 0 && (
                        <SelectGroup>
                          <SelectLabel>Pages</SelectLabel>
                          {later.map((candidate) => (
                            <SelectItem key={candidate.key} value={`page:${candidate.key}`}>
                              {pageTitle(schema, candidate.key)}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      )}
                      <SelectGroup>
                        <SelectLabel>End screens</SelectLabel>
                        {schema.logic.endScreens.map((screen, screenIndex) => (
                          <SelectItem key={screen.id} value={`end:${screen.id}`}>
                            {screen.name.trim() ||
                              (screenIndex === 0
                                ? 'Default end screen'
                                : `End screen ${screenIndex + 1}`)}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  {jumpIssues.to && <p className="text-13 text-danger-text">{jumpIssues.to}</p>}
                </div>
              </li>
            );
          })}
        </ol>
        <Button
          variant="secondary"
          size="sm"
          className="self-start"
          disabled={jumps.length >= MAX_JUMPS_PER_PAGE}
          onClick={addJump}
        >
          <Plus aria-hidden />
          Add jump
        </Button>
        {jumps.length > 0 && (
          <p className="text-12 text-muted-foreground">
            The first jump that applies is taken. Otherwise{' '}
            {later.length > 0 ? 'respondents go on to the next page' : 'the form ends'}.
          </p>
        )}
      </div>
    </li>
  );
}

/** The form's pages, as page breaks divide it: titles, shuffling and where each leads. */
export function PagesSection() {
  const fields = useEditorStore((state) => state.schema.fields);
  const updateLogic = useEditorStore((state) => state.updateLogic);
  const pages = formPages(fields);

  return (
    <SettingsSection title="Pages">
      {pages.length === 1 && (
        <p className="text-13 text-muted-foreground">
          Add a page break from Content and layout to split the form into pages.
        </p>
      )}
      <ol className="flex flex-col gap-3" aria-label="Pages">
        {pages.map((page) => (
          <PageCard
            key={page.key}
            page={page}
            pages={pages}
            number={page.index + 1}
            onUpdate={(update, mergeKey) => {
              updateLogic(
                (logic) => {
                  const { jumps, ...settings } = update(logic.pages[page.key] ?? {});
                  const next = jumps && jumps.length > 0 ? { ...settings, jumps } : settings;
                  const { [page.key]: _old, ...rest } = logic.pages;
                  // Pages with nothing set leave no trace.
                  return {
                    ...logic,
                    pages: Object.keys(next).length > 0 ? { ...rest, [page.key]: next } : rest,
                  };
                },
                mergeKey ? { mergeKey: `page-${mergeKey}:${page.key}` } : undefined,
              );
            }}
          />
        ))}
      </ol>
    </SettingsSection>
  );
}
