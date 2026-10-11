import {
  CONDITION_OPERATOR_LABELS,
  conditionOperatorSchema,
  MAX_LOGIC_CONDITIONS,
  operatorNeedsValue,
  OPERATORS_BY_FIELD_TYPE,
  QUIZ_PERCENT_VARIABLE,
  QUIZ_SCORE_VARIABLE,
  VARIABLE_OPERATORS,
  type Condition,
  type ConditionMatch,
  type LogicCondition,
  type Variable,
  type VariableOperator,
} from '@formyx/shared';
import { Plus, X } from 'lucide-react';
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
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  changeOperator,
  changeSource,
  changeValue,
  createCondition,
  type ConditionSource,
} from '../logic/condition-edits';
import { ConditionValueInput } from '../logic/condition-value-input';
import { NumberInput } from '../settings/number-input';

/** What conditions in one place may check. */
export interface LogicSources {
  /** Questions, numbered as on the canvas. */
  fields: readonly ConditionSource[];
  variables: readonly Variable[];
  /** The quiz score and result: on end screens, which the server picks. */
  quiz: boolean;
}

const VARIABLE_OPERATOR_LABELS: Record<VariableOperator, string> = {
  equals: 'is',
  not_equals: 'is not',
  greater_than: 'is more than',
  at_least: 'is at least',
  less_than: 'is less than',
  at_most: 'is at most',
};

const QUIZ_VALUES = [
  { id: QUIZ_SCORE_VARIABLE, name: 'Quiz score' },
  { id: QUIZ_PERCENT_VARIABLE, name: 'Quiz score (%)' },
] as const;

function asCondition(condition: Extract<LogicCondition, { kind: 'answer' }>): Condition {
  const { kind: _kind, ...rest } = condition;
  return rest;
}

function asLogic(condition: Condition): LogicCondition {
  return { kind: 'answer', ...condition };
}

/** The key a condition's source has in the source picker. */
function sourceKey(condition: LogicCondition): string {
  switch (condition.kind) {
    case 'answer':
      return `field:${condition.sourceFieldId}`;
    case 'variable':
      return `var:${condition.variableId}`;
    case 'quiz':
      return 'quiz';
  }
}

/** A new condition on the last question available, or else the first variable. */
function newCondition(sources: LogicSources): LogicCondition | null {
  const field = sources.fields.at(-1)?.field;
  if (field) return asLogic(createCondition(field));
  const variable = sources.variables[0];
  if (variable) return { kind: 'variable', variableId: variable.id, operator: 'at_least' };
  if (sources.quiz) return { kind: 'quiz', result: 'passed' };
  return null;
}

interface RowProps {
  label: string;
  index: number;
  condition: LogicCondition;
  sources: LogicSources;
  match: ConditionMatch;
  issues: Record<string, string>;
  onChange: (condition: LogicCondition, typing?: boolean) => void;
  onRemove: () => void;
}

function LogicConditionRow({
  label,
  index,
  condition,
  sources,
  match,
  issues,
  onChange,
  onRemove,
}: RowProps) {
  const number = index + 1;
  const name = `${label}, condition ${number}`;
  const lead = index === 0 ? 'When' : match === 'any' ? 'Or when' : 'And when';
  const problem =
    issues.sourceFieldId ?? issues.variableId ?? issues.result ?? issues.operator ?? issues.value;
  const problemId = `${label.replace(/\W+/g, '-')}-condition-${number}-problem`;
  const field =
    condition.kind === 'answer'
      ? sources.fields.find((source) => source.field.id === condition.sourceFieldId)?.field
      : undefined;

  const pickSource = (key: string) => {
    const [kind, id = ''] = key.split(/:(.*)/s);
    if (kind === 'field') {
      const next = sources.fields.find((source) => source.field.id === id)?.field;
      if (!next) return;
      onChange(
        condition.kind === 'answer'
          ? asLogic(changeSource(asCondition(condition), next))
          : asLogic(createCondition(next)),
      );
    } else if (kind === 'var') {
      onChange({
        kind: 'variable',
        variableId: id,
        operator: condition.kind === 'variable' ? condition.operator : 'at_least',
      });
    } else if (kind === 'quiz') {
      onChange({ kind: 'quiz', result: 'passed' });
    }
  };

  return (
    <li className="flex flex-col gap-2 rounded-lg border bg-surface p-3" aria-label={name}>
      <div className="flex h-6 items-center justify-between">
        <span className="text-12 font-medium text-muted-foreground">{lead}</span>
        <ActionTooltip label="Remove condition">
          <Button
            variant="ghost"
            size="icon-sm"
            className="-mr-1.5 size-6"
            aria-label={`Remove ${name.toLowerCase()}`}
            onClick={onRemove}
          >
            <X aria-hidden />
          </Button>
        </ActionTooltip>
      </div>

      <Select value={sourceKey(condition)} onValueChange={pickSource}>
        <SelectTrigger
          aria-label={`${name}: what to check`}
          aria-invalid={problem ? true : undefined}
          aria-describedby={problem ? problemId : undefined}
          className="w-full"
        >
          <SelectValue placeholder="Choose what to check" />
        </SelectTrigger>
        <SelectContent>
          {sources.fields.length > 0 && (
            <SelectGroup>
              <SelectLabel>Answers</SelectLabel>
              {sources.fields.map(({ field: option, position }) => (
                <SelectItem key={option.id} value={`field:${option.id}`}>
                  {position}. {option.label.trim() || 'Untitled question'}
                </SelectItem>
              ))}
            </SelectGroup>
          )}
          {sources.variables.length > 0 && (
            <SelectGroup>
              <SelectLabel>Values</SelectLabel>
              {sources.variables.map((variable) => (
                <SelectItem key={variable.id} value={`var:${variable.id}`}>
                  {variable.name.trim() || 'Untitled value'}
                </SelectItem>
              ))}
            </SelectGroup>
          )}
          {sources.quiz && (
            <SelectGroup>
              <SelectLabel>Quiz</SelectLabel>
              {QUIZ_VALUES.map((value) => (
                <SelectItem key={value.id} value={`var:${value.id}`}>
                  {value.name}
                </SelectItem>
              ))}
              <SelectItem value="quiz">Quiz result</SelectItem>
            </SelectGroup>
          )}
        </SelectContent>
      </Select>

      {condition.kind === 'answer' && field && (
        <div className={operatorNeedsValue(condition.operator) ? 'grid grid-cols-2 gap-2' : 'flex'}>
          <Select
            value={condition.operator}
            onValueChange={(value) => {
              const operator = conditionOperatorSchema.safeParse(value);
              if (operator.success) {
                onChange(asLogic(changeOperator(asCondition(condition), operator.data, field)));
              }
            }}
          >
            <SelectTrigger aria-label={`${name}: comparison`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {OPERATORS_BY_FIELD_TYPE[field.type].map((operator) => (
                <SelectItem key={operator} value={operator}>
                  {CONDITION_OPERATOR_LABELS[operator]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {operatorNeedsValue(condition.operator) && (
            <ConditionValueInput
              id={`${problemId}-value`}
              label={`${name}: value`}
              source={field}
              value={condition.value}
              invalid={Boolean(issues.value)}
              onChange={(value, typing) => {
                onChange(asLogic(changeValue(asCondition(condition), value)), typing);
              }}
            />
          )}
        </div>
      )}

      {condition.kind === 'variable' && (
        <div className="grid grid-cols-2 gap-2">
          <Select
            value={condition.operator}
            onValueChange={(value) => {
              const operator = VARIABLE_OPERATORS.find((candidate) => candidate === value);
              if (operator) onChange({ ...condition, operator });
            }}
          >
            <SelectTrigger aria-label={`${name}: comparison`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {VARIABLE_OPERATORS.map((operator) => (
                <SelectItem key={operator} value={operator}>
                  {VARIABLE_OPERATOR_LABELS[operator]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <NumberInput
            aria-label={`${name}: value`}
            aria-invalid={issues.value ? true : undefined}
            value={condition.value}
            onValueChange={(value) => {
              const { value: _old, ...rest } = condition;
              onChange(value === undefined ? rest : { ...rest, value }, true);
            }}
          />
        </div>
      )}

      {condition.kind === 'quiz' && (
        <Select
          value={condition.result}
          onValueChange={(value) => {
            if (value === 'passed' || value === 'failed') onChange({ kind: 'quiz', result: value });
          }}
        >
          <SelectTrigger aria-label={`${name}: result`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="passed">is a pass</SelectItem>
            <SelectItem value="failed">is not a pass</SelectItem>
          </SelectContent>
        </Select>
      )}

      {problem && (
        <p id={problemId} className="text-13 text-danger-text">
          {problem}
        </p>
      )}
    </li>
  );
}

interface LogicConditionsProps {
  /** Names the list and its rows for assistive technology, e.g. "Jump 1". */
  label: string;
  conditions: readonly LogicCondition[];
  match: ConditionMatch;
  sources: LogicSources;
  /** Problems keyed by path below the conditions, e.g. `0.value`. */
  issues: Record<string, string>;
  /** What no conditions means here, e.g. "Always". */
  emptyText: string;
  onChange: (conditions: LogicCondition[], match: ConditionMatch, typing?: boolean) => void;
}

/** "When … and when …": conditions on answers, values or the quiz, with all/any. */
export function LogicConditions({
  label,
  conditions,
  match,
  sources,
  issues,
  emptyText,
  onChange,
}: LogicConditionsProps) {
  const fresh = newCondition(sources);
  return (
    <div className="flex flex-col gap-2">
      {conditions.length === 0 ? (
        <p className="text-13 text-muted-foreground">{emptyText}</p>
      ) : (
        <>
          {conditions.length > 1 && (
            <ToggleGroup
              type="single"
              aria-label={`${label}: conditions to meet`}
              value={match}
              onValueChange={(value) => {
                if (value === 'all' || value === 'any') onChange([...conditions], value);
              }}
              className="self-start"
            >
              <ToggleGroupItem value="all">All are true</ToggleGroupItem>
              <ToggleGroupItem value="any">Any is true</ToggleGroupItem>
            </ToggleGroup>
          )}
          <ol aria-label={`${label}: conditions`} className="flex flex-col gap-2">
            {conditions.map((condition, index) => (
              <LogicConditionRow
                // Conditions have no ids; their position is stable until one is removed.
                key={index}
                label={label}
                index={index}
                condition={condition}
                sources={sources}
                match={match}
                issues={Object.fromEntries(
                  Object.entries(issues)
                    .filter(([path]) => path.startsWith(`${index}.`))
                    .map(([path, message]) => [path.slice(`${index}.`.length), message]),
                )}
                onChange={(next, typing) => {
                  onChange(
                    conditions.map((item, itemIndex) => (itemIndex === index ? next : item)),
                    match,
                    typing,
                  );
                }}
                onRemove={() => {
                  onChange(
                    conditions.filter((_, itemIndex) => itemIndex !== index),
                    match,
                  );
                }}
              />
            ))}
          </ol>
        </>
      )}
      {fresh && (
        <Button
          variant="ghost"
          size="sm"
          className="self-start"
          disabled={conditions.length >= MAX_LOGIC_CONDITIONS}
          onClick={() => {
            onChange([...conditions, fresh], match);
          }}
        >
          <Plus aria-hidden />
          Add condition
        </Button>
      )}
    </div>
  );
}
