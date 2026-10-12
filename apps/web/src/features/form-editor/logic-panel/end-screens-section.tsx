import {
  createEndScreen,
  END_SCREEN_ALIGNMENTS,
  isAnswerableFieldType,
  MAX_END_SCREENS,
  MAX_REDIRECT_PARAMS,
  QUIZ_PERCENT_VARIABLE,
  QUIZ_SCORE_VARIABLE,
  type EndScreen,
  type RedirectParam,
} from '@formyx/shared';
import { ArrowDown, ArrowUp, Eye, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { ActionTooltip } from '@/components/action-tooltip';
import { FormField } from '@/components/form-field';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { SelectItem } from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { ProBadge } from '@/features/entitlements/pro-badge';
import { FormView } from '@/features/form-renderer/form-view';
import { ThemeImageField } from '../design/theme-image-field';
import { useEditorEntitlements } from '../editor-entitlements';
import { useEditorStore } from '../editor-store-context';
import { NumberInput } from '../settings/number-input';
import { RichTextEditor } from '../settings/rich-text-editor';
import { SelectField } from '../settings/select-field';
import { SettingsSection } from '../settings/settings-section';
import { SwitchSetting } from '../settings/switch-setting';
import { LogicConditions, type LogicSources } from './logic-conditions';
import { PipedTextField } from './piped-text-field';
import { issuesAt, useLogicIssues } from './use-logic-issues';

/** The name an end screen goes by in pickers and the map. */
function screenName(screen: EndScreen, index: number): string {
  return screen.name.trim() || (index === 0 ? 'Default end screen' : `End screen ${index + 1}`);
}

/** The end screen as respondents see it, in the form's theme, with sample answers. */
function PreviewDialog({ screen, onClose }: { screen: EndScreen; onClose: () => void }) {
  const title = useEditorStore((state) => state.title);
  const schema = useEditorStore((state) => state.schema);
  const theme = useEditorStore((state) => state.theme);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto p-0">
        <DialogHeader className="px-6 pt-6">
          <DialogTitle>{screen.name.trim() || 'End screen'}</DialogTitle>
          <DialogDescription>
            With no answers yet; a quiz shows a sample score of 8 out of 10.
          </DialogDescription>
        </DialogHeader>
        <FormView
          title={title || 'Untitled form'}
          schema={schema}
          theme={theme}
          titleAs="h2"
          variant="frame"
          previewEndScreenId={screen.id}
        />
      </DialogContent>
    </Dialog>
  );
}

interface CardProps {
  screen: EndScreen;
  index: number;
  count: number;
  sources: LogicSources;
  issues: Record<string, string>;
  onChange: (update: (screen: EndScreen) => EndScreen, mergeKey?: string) => void;
  onMove: (to: number) => void;
  onRemove: () => void;
  onPreview: () => void;
}

function EndScreenCard({
  screen,
  index,
  count,
  sources,
  issues,
  onChange,
  onMove,
  onRemove,
  onPreview,
}: CardProps) {
  const name = screenName(screen, index);
  const id = `end-${screen.id}`;
  const merge = (key: string) => `end-${key}:${screen.id}`;
  const redirect = screen.redirect;
  const valueSources = [
    ...sources.variables.map((variable) => ({
      id: variable.id,
      name: variable.name || 'Untitled value',
    })),
    ...(sources.quiz
      ? [
          { id: QUIZ_SCORE_VARIABLE, name: 'Quiz score' },
          { id: QUIZ_PERCENT_VARIABLE, name: 'Quiz score (%)' },
        ]
      : []),
  ];
  const setParams = (params: RedirectParam[], mergeKey?: string) => {
    onChange(
      (current) =>
        current.redirect ? { ...current, redirect: { ...current.redirect, params } } : current,
      mergeKey,
    );
  };

  return (
    <li className="flex flex-col gap-4 rounded-lg border p-4" aria-label={name}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h4 className="truncate text-14 font-medium">{name}</h4>
          <p className="text-12 text-muted-foreground">
            {index === 0
              ? 'Shown when no other end screen applies.'
              : 'Shown by a jump, or when its conditions hold.'}
          </p>
        </div>
        <div className="flex shrink-0 gap-0.5">
          <ActionTooltip label="Preview">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Preview ${name}`}
              onClick={onPreview}
            >
              <Eye aria-hidden />
            </Button>
          </ActionTooltip>
          {index > 0 && (
            <>
              <ActionTooltip label="Check earlier">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Move ${name} up`}
                  disabled={index <= 1}
                  onClick={() => {
                    onMove(index - 1);
                  }}
                >
                  <ArrowUp aria-hidden />
                </Button>
              </ActionTooltip>
              <ActionTooltip label="Check later">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Move ${name} down`}
                  disabled={index >= count - 1}
                  onClick={() => {
                    onMove(index + 1);
                  }}
                >
                  <ArrowDown aria-hidden />
                </Button>
              </ActionTooltip>
              <ActionTooltip label="Remove end screen">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove ${name}`}
                  onClick={onRemove}
                >
                  <Trash2 aria-hidden />
                </Button>
              </ActionTooltip>
            </>
          )}
        </div>
      </div>

      <FormField id={`${id}-name`} label="Name" hint="For you, such as Passed." error={issues.name}>
        <Input
          value={screen.name}
          maxLength={60}
          onChange={(event) => {
            const value = event.target.value;
            onChange((current) => ({ ...current, name: value }), merge('name'));
          }}
        />
      </FormField>

      {index > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-13 font-medium">Show when</span>
          <LogicConditions
            label={name}
            conditions={screen.when}
            match={screen.match}
            sources={sources}
            issues={issuesAt(issues, 'when')}
            emptyText="Only when a jump leads here."
            onChange={(when, match, typing) => {
              onChange(
                (current) => ({ ...current, when, match }),
                typing ? merge('when') : undefined,
              );
            }}
          />
        </div>
      )}

      <PipedTextField
        id={`${id}-title`}
        label="Title"
        value={screen.title}
        maxLength={200}
        error={issues.title}
        pipe={sources}
        onChange={(title) => {
          onChange((current) => ({ ...current, title }), merge('title'));
        }}
      />
      <RichTextEditor
        id={`${id}-message`}
        label="Message"
        rows={4}
        value={screen.message}
        error={issues.message}
        pipe={sources}
        onChange={(message) => {
          onChange((current) => ({ ...current, message }), merge('message'));
        }}
      />

      <div className="flex flex-col gap-1.5">
        <span className="text-13 font-medium">Image</span>
        <ThemeImageField
          kind="content"
          url={screen.imageUrl}
          onChange={(imageUrl) => {
            onChange(({ imageUrl: _old, ...current }) =>
              imageUrl ? { ...current, imageUrl } : current,
            );
          }}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <span id={`${id}-align`} className="text-13 font-medium">
          Alignment
        </span>
        <ToggleGroup
          type="single"
          aria-labelledby={`${id}-align`}
          value={screen.align}
          className="self-start"
          onValueChange={(value) => {
            const align = END_SCREEN_ALIGNMENTS.find((candidate) => candidate === value);
            if (align) onChange((current) => ({ ...current, align }));
          }}
        >
          <ToggleGroupItem value="center">Centred</ToggleGroupItem>
          <ToggleGroupItem value="left">Left</ToggleGroupItem>
        </ToggleGroup>
      </div>

      {sources.quiz && (
        <SwitchSetting
          id={`${id}-score`}
          label="Show the quiz score"
          hint="With the pass mark, when there is one."
          checked={screen.showScore}
          onCheckedChange={(showScore) => {
            onChange((current) => ({ ...current, showScore }));
          }}
        />
      )}

      <SwitchSetting
        id={`${id}-button`}
        label="Button"
        hint="A link, such as to your website."
        checked={screen.button !== undefined}
        onCheckedChange={(on) => {
          onChange(({ button: _old, ...current }) =>
            on ? { ...current, button: { label: 'Visit our website', url: 'https://' } } : current,
          );
        }}
      />
      {screen.button && (
        <div className="grid grid-cols-2 gap-3">
          <FormField
            id={`${id}-button-label`}
            label="Button text"
            error={issuesAt(issues, 'button').label}
          >
            <Input
              value={screen.button.label}
              maxLength={40}
              onChange={(event) => {
                const label = event.target.value;
                onChange(
                  (current) =>
                    current.button ? { ...current, button: { ...current.button, label } } : current,
                  merge('button-label'),
                );
              }}
            />
          </FormField>
          <FormField id={`${id}-button-url`} label="Link" error={issuesAt(issues, 'button').url}>
            <Input
              type="url"
              value={screen.button.url}
              onChange={(event) => {
                const url = event.target.value;
                onChange(
                  (current) =>
                    current.button ? { ...current, button: { ...current.button, url } } : current,
                  merge('button-url'),
                );
              }}
            />
          </FormField>
        </div>
      )}

      <SwitchSetting
        id={`${id}-redirect`}
        label="Redirect"
        hint="Send respondents to another page afterwards."
        checked={redirect !== undefined}
        onCheckedChange={(on) => {
          onChange(({ redirect: _old, ...current }) =>
            on
              ? { ...current, redirect: { url: 'https://', delaySeconds: 3, params: [] } }
              : current,
          );
        }}
      />
      {redirect && (
        <div className="flex flex-col gap-3 rounded-lg bg-surface p-3">
          <FormField
            id={`${id}-redirect-url`}
            label="Address"
            error={issuesAt(issues, 'redirect').url}
          >
            <Input
              type="url"
              value={redirect.url}
              onChange={(event) => {
                const url = event.target.value;
                onChange(
                  (current) =>
                    current.redirect
                      ? { ...current, redirect: { ...current.redirect, url } }
                      : current,
                  merge('redirect-url'),
                );
              }}
            />
          </FormField>
          <FormField
            id={`${id}-redirect-delay`}
            label="After (seconds)"
            hint="0 to 10. The end screen shows meanwhile."
          >
            <NumberInput
              integer
              className="w-24"
              value={redirect.delaySeconds}
              onValueChange={(value) => {
                const delaySeconds = Math.min(Math.max(value ?? 0, 0), 10);
                onChange(
                  (current) =>
                    current.redirect
                      ? { ...current, redirect: { ...current.redirect, delaySeconds } }
                      : current,
                  merge('redirect-delay'),
                );
              }}
            />
          </FormField>
          <div className="flex flex-col gap-2">
            <span className="text-13 font-medium">Pass on in the address</span>
            {redirect.params.length === 0 && (
              <p className="text-13 text-muted-foreground">Nothing: answers stay private.</p>
            )}
            <ul className="flex flex-col gap-2" aria-label={`${name}: redirect parameters`}>
              {redirect.params.map((param, paramIndex) => {
                const paramIssues = issuesAt(issues, `redirect.params.${paramIndex}`);
                const sourceValue =
                  param.source.kind === 'answer'
                    ? `answer:${param.source.fieldId}`
                    : `var:${param.source.variableId}`;
                return (
                  <li key={paramIndex} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
                    <FormField
                      id={`${id}-param-${paramIndex}-name`}
                      label="Name"
                      error={paramIssues.name}
                    >
                      <Input
                        value={param.name}
                        maxLength={64}
                        className="font-mono"
                        onChange={(event) => {
                          const value = event.target.value;
                          setParams(
                            redirect.params.map((item, itemIndex) =>
                              itemIndex === paramIndex ? { ...item, name: value } : item,
                            ),
                            merge(`param-${paramIndex}`),
                          );
                        }}
                      />
                    </FormField>
                    <SelectField
                      id={`${id}-param-${paramIndex}-source`}
                      label="Value"
                      value={sourceValue}
                      onValueChange={(value) => {
                        const [kind, sourceId = ''] = value.split(/:(.*)/s);
                        const source: RedirectParam['source'] =
                          kind === 'answer'
                            ? { kind: 'answer', fieldId: sourceId }
                            : { kind: 'variable', variableId: sourceId };
                        setParams(
                          redirect.params.map((item, itemIndex) =>
                            itemIndex === paramIndex ? { ...item, source } : item,
                          ),
                        );
                      }}
                    >
                      {sources.fields.map(({ field, position }) => (
                        <SelectItem key={field.id} value={`answer:${field.id}`}>
                          {position}. {field.label.trim() || 'Untitled question'}
                        </SelectItem>
                      ))}
                      {valueSources.map((value) => (
                        <SelectItem key={value.id} value={`var:${value.id}`}>
                          {value.name}
                        </SelectItem>
                      ))}
                    </SelectField>
                    <ActionTooltip label="Remove parameter">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="mb-1.5"
                        aria-label={`Remove parameter ${paramIndex + 1}`}
                        onClick={() => {
                          setParams(
                            redirect.params.filter((_, itemIndex) => itemIndex !== paramIndex),
                          );
                        }}
                      >
                        <Trash2 aria-hidden />
                      </Button>
                    </ActionTooltip>
                  </li>
                );
              })}
            </ul>
            <Button
              variant="ghost"
              size="sm"
              className="self-start"
              disabled={
                redirect.params.length >= MAX_REDIRECT_PARAMS ||
                (sources.fields.length === 0 && valueSources.length === 0)
              }
              onClick={() => {
                const field = sources.fields[0]?.field;
                const value = valueSources[0];
                const source: RedirectParam['source'] | null = field
                  ? { kind: 'answer', fieldId: field.id }
                  : value
                    ? { kind: 'variable', variableId: value.id }
                    : null;
                if (source) setParams([...redirect.params, { name: '', source }]);
              }}
            >
              <Plus aria-hidden />
              Add parameter
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}

/** What respondents see after submitting: a default, and others by jump or condition. */
export function EndScreensSection() {
  const schema = useEditorStore((state) => state.schema);
  const updateLogic = useEditorStore((state) => state.updateLogic);
  const { hasFeature } = useEditorEntitlements();
  const issues = useLogicIssues();
  const [previewing, setPreviewing] = useState<string | null>(null);
  const { endScreens } = schema.logic;
  const sources: LogicSources = {
    fields: schema.fields
      .map((field, index) => ({ field, position: index + 1 }))
      .filter(({ field }) => isAnswerableFieldType(field.type)),
    variables: schema.logic.variables,
    quiz: schema.logic.quiz?.enabled === true,
  };
  const preview = endScreens.find((screen) => screen.id === previewing);

  const setScreens = (next: EndScreen[], mergeKey?: string) => {
    updateLogic((logic) => ({ ...logic, endScreens: next }), mergeKey ? { mergeKey } : undefined);
  };

  return (
    <SettingsSection title="End screens">
      <ol className="flex flex-col gap-3" aria-label="End screens">
        {endScreens.map((screen, index) => (
          <EndScreenCard
            key={screen.id}
            screen={screen}
            index={index}
            count={endScreens.length}
            sources={sources}
            issues={issuesAt(issues, `endScreens.${index}`)}
            onChange={(update, mergeKey) => {
              setScreens(
                endScreens.map((candidate) =>
                  candidate.id === screen.id ? update(candidate) : candidate,
                ),
                mergeKey,
              );
            }}
            onMove={(to) => {
              const next = [...endScreens];
              next.splice(index, 1);
              next.splice(to, 0, screen);
              setScreens(next);
            }}
            onRemove={() => {
              setScreens(endScreens.filter((candidate) => candidate.id !== screen.id));
            }}
            onPreview={() => {
              setPreviewing(screen.id);
            }}
          />
        ))}
      </ol>
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={endScreens.length >= MAX_END_SCREENS}
          onClick={() => {
            setScreens([
              ...endScreens,
              createEndScreen({
                name: `End screen ${endScreens.length + 1}`,
                message: 'Thanks for your answers.',
                showScore: schema.logic.quiz?.enabled === true && schema.logic.quiz.showScore,
              }),
            ]);
          }}
        >
          <Plus aria-hidden />
          Add end screen
        </Button>
        {!hasFeature('advanced_logic') && <ProBadge />}
      </div>
      {preview && (
        <PreviewDialog
          screen={preview}
          onClose={() => {
            setPreviewing(null);
          }}
        />
      )}
    </SettingsSection>
  );
}
