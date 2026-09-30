import { MAX_CONDITIONS, type Condition, type ConditionMatch, type Field } from '@formyx/shared';
import { Plus } from 'lucide-react';
import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import type { FieldPatch } from '../editor-store';
import { SettingsSection } from '../settings/settings-section';
import { conditionSources, createCondition } from './condition-edits';
import { ConditionRow } from './condition-row';

interface LogicSettingsProps {
  field: Field;
  index: number;
  fields: readonly Field[];
  /** Problems under this question, keyed by the rest of their path (`conditions.0.value`). */
  issues: Record<string, string>;
  update: (patch: FieldPatch, mergeKey?: string) => void;
}

const sourceTriggerSelector = (number: number) => `[aria-label="Condition ${number}: question"]`;

function focusLater(selector: string) {
  requestAnimationFrame(() => {
    document.querySelector<HTMLElement>(selector)?.focus();
  });
}

/** "Show this question only when…": the conditions that decide whether it is shown. */
export function LogicSettings({ field, index, fields, issues, update }: LogicSettingsProps) {
  const sources = useMemo(() => conditionSources(fields, index), [fields, index]);
  const conditions = field.conditions ?? [];
  const match: ConditionMatch = field.conditionMatch ?? 'all';
  const noun = field.type === 'statement' ? 'text' : 'question';

  const setConditions = (next: Condition[], mergeKey?: string) => {
    update(
      next.length === 0
        ? { conditions: undefined, conditionMatch: undefined }
        : // With one condition "all" and "any" mean the same, so the choice is dropped.
          { conditions: next, ...(next.length < 2 && { conditionMatch: undefined }) },
      mergeKey,
    );
  };

  const add = () => {
    const source = sources.at(-1)?.field;
    if (!source) return;
    setConditions([...conditions, createCondition(source)]);
    focusLater(sourceTriggerSelector(conditions.length + 1));
  };

  if (sources.length === 0) {
    return (
      <SettingsSection title="Logic">
        <p className="text-13 text-muted-foreground">
          {index === 0
            ? `The first ${noun} is always shown. Logic can depend on answers to earlier questions.`
            : 'Logic can depend on answers to earlier questions. There are none above this one yet.'}
        </p>
      </SettingsSection>
    );
  }

  return (
    <SettingsSection title="Logic">
      {conditions.length === 0 ? (
        <p className="text-13 text-muted-foreground">
          Always shown. Add a condition to show this {noun} only for some answers.
        </p>
      ) : (
        <>
          <p className="text-14">Show this {noun} only when</p>
          {conditions.length > 1 && (
            <ToggleGroup
              type="single"
              aria-label="Conditions to meet"
              value={match}
              onValueChange={(value) => {
                if (value === 'all' || value === 'any') {
                  update({ conditionMatch: value === 'all' ? undefined : value });
                }
              }}
              className="self-start"
            >
              <ToggleGroupItem value="all">All are true</ToggleGroupItem>
              <ToggleGroupItem value="any">Any is true</ToggleGroupItem>
            </ToggleGroup>
          )}
          <ol aria-label="Conditions" className="flex flex-col gap-2">
            {conditions.map((condition, conditionIndex) => (
              <ConditionRow
                // Conditions have no ids; their position is stable until one is removed.
                key={conditionIndex}
                index={conditionIndex}
                condition={condition}
                sources={sources}
                match={match}
                issues={issuesAt(issues, `conditions.${conditionIndex}`)}
                onChange={(next, typing) => {
                  setConditions(
                    conditions.map((item, itemIndex) =>
                      itemIndex === conditionIndex ? next : item,
                    ),
                    typing ? `condition-value:${conditionIndex}` : undefined,
                  );
                }}
                onRemove={() => {
                  setConditions(conditions.filter((_, itemIndex) => itemIndex !== conditionIndex));
                  focusLater('[data-add-condition]');
                }}
              />
            ))}
          </ol>
        </>
      )}
      <Button
        variant={conditions.length === 0 ? 'secondary' : 'ghost'}
        size="sm"
        className="self-start"
        data-add-condition
        disabled={conditions.length >= MAX_CONDITIONS}
        onClick={add}
      >
        <Plus aria-hidden />
        Add condition
      </Button>
    </SettingsSection>
  );
}

/** The problems under `prefix`, keyed by the rest of their path. */
function issuesAt(issues: Record<string, string>, prefix: string): Record<string, string> {
  return Object.fromEntries(
    Object.entries(issues)
      .filter(([path]) => path.startsWith(`${prefix}.`))
      .map(([path, message]) => [path.slice(prefix.length + 1), message]),
  );
}
