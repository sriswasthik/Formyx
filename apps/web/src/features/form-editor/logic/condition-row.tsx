import {
  CONDITION_OPERATOR_LABELS,
  conditionOperatorSchema,
  operatorNeedsValue,
  OPERATORS_BY_FIELD_TYPE,
  type Condition,
  type ConditionMatch,
} from '@formyx/shared';
import { X } from 'lucide-react';
import { ActionTooltip } from '@/components/action-tooltip';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { changeOperator, changeSource, changeValue, type ConditionSource } from './condition-edits';
import { ConditionValueInput } from './condition-value-input';

interface ConditionRowProps {
  index: number;
  condition: Condition;
  sources: readonly ConditionSource[];
  match: ConditionMatch;
  /** Problems with this condition, keyed by `sourceFieldId`, `operator` or `value`. */
  issues: Record<string, string>;
  onChange: (condition: Condition, typing?: boolean) => void;
  onRemove: () => void;
}

function sourceLabel({ field, position }: ConditionSource): string {
  return `${position}. ${field.label.trim() || 'Untitled question'}`;
}

/** One "question, comparison, value" line of a question's logic. */
export function ConditionRow({
  index,
  condition,
  sources,
  match,
  issues,
  onChange,
  onRemove,
}: ConditionRowProps) {
  const number = index + 1;
  const source = sources.find(({ field }) => field.id === condition.sourceFieldId)?.field;
  const operators = source ? OPERATORS_BY_FIELD_TYPE[source.type] : [];
  const needsValue = operatorNeedsValue(condition.operator);
  const lead = index === 0 ? 'When' : match === 'any' ? 'Or when' : 'And when';
  const problem = issues.sourceFieldId ?? issues.operator ?? issues.value;
  const problemId = `condition-${number}-problem`;

  return (
    <li
      className="flex flex-col gap-2 rounded-lg border bg-surface p-3"
      aria-label={`Condition ${number}`}
    >
      <div className="flex h-6 items-center justify-between">
        <span className="text-12 font-medium text-muted-foreground">{lead}</span>
        <ActionTooltip label="Remove condition">
          <Button
            variant="ghost"
            size="icon-sm"
            className="-mr-1.5 size-6"
            aria-label={`Remove condition ${number}`}
            onClick={onRemove}
          >
            <X aria-hidden />
          </Button>
        </ActionTooltip>
      </div>

      <Select
        value={source ? condition.sourceFieldId : ''}
        onValueChange={(id) => {
          const next = sources.find(({ field }) => field.id === id)?.field;
          if (next) onChange(changeSource(condition, next));
        }}
      >
        <SelectTrigger
          aria-label={`Condition ${number}: question`}
          aria-invalid={issues.sourceFieldId ? true : undefined}
          aria-describedby={problem ? problemId : undefined}
          className="w-full"
        >
          <SelectValue placeholder="Choose a question" />
        </SelectTrigger>
        <SelectContent>
          {sources.map((option) => (
            <SelectItem key={option.field.id} value={option.field.id}>
              {sourceLabel(option)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {source && (
        <div className={needsValue ? 'grid grid-cols-2 gap-2' : 'flex'}>
          <Select
            value={condition.operator}
            onValueChange={(value) => {
              const operator = conditionOperatorSchema.safeParse(value);
              if (operator.success) onChange(changeOperator(condition, operator.data, source));
            }}
          >
            <SelectTrigger
              aria-label={`Condition ${number}: comparison`}
              aria-invalid={issues.operator ? true : undefined}
              className="w-full"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {operators.map((operator) => (
                <SelectItem key={operator} value={operator}>
                  {CONDITION_OPERATOR_LABELS[operator]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {needsValue && (
            <ConditionValueInput
              id={`condition-${number}-value`}
              label={`Condition ${number}: value`}
              source={source}
              value={condition.value}
              invalid={Boolean(issues.value)}
              onChange={(value, typing) => {
                onChange(changeValue(condition, value), typing);
              }}
            />
          )}
        </div>
      )}

      {problem && (
        <p id={problemId} className="text-13 text-danger-text">
          {problem}
        </p>
      )}
    </li>
  );
}
