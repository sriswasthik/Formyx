import {
  createRule,
  createVariable,
  isAnswerableFieldType,
  MAX_RULES,
  MAX_VARIABLES,
  NUMERIC_FIELD_TYPES,
  RULE_OPERATIONS,
  VARIABLE_KINDS,
  type Rule,
  type Variable,
} from '@formyx/shared';
import { Plus, Trash2 } from 'lucide-react';
import { ActionTooltip } from '@/components/action-tooltip';
import { FormField } from '@/components/form-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SelectItem } from '@/components/ui/select';
import { ProBadge } from '@/features/entitlements/pro-badge';
import { useEditorEntitlements } from '../editor-entitlements';
import { useEditorStore } from '../editor-store-context';
import { createCondition } from '../logic/condition-edits';
import { NumberInput } from '../settings/number-input';
import { SelectField } from '../settings/select-field';
import { SettingsSection } from '../settings/settings-section';
import { LogicConditions, type LogicSources } from './logic-conditions';
import { issuesAt, useLogicIssues } from './use-logic-issues';

const KIND_LABELS: Record<Variable['kind'], string> = {
  score: 'Score',
  price: 'Price',
  number: 'Number',
};

const OPERATION_LABELS: Record<Rule['operation'], string> = {
  add: 'Add',
  subtract: 'Subtract',
  multiply: 'Multiply by',
  set: 'Set to',
};

/** Values worked out from the answers, and the rules that work them out. */
export function ValuesSection() {
  const schema = useEditorStore((state) => state.schema);
  const updateLogic = useEditorStore((state) => state.updateLogic);
  const { hasFeature } = useEditorEntitlements();
  const issues = useLogicIssues();
  const { variables, rules } = schema.logic;

  const sources: LogicSources = {
    fields: schema.fields
      .map((field, index) => ({ field, position: index + 1 }))
      .filter(({ field }) => isAnswerableFieldType(field.type)),
    variables,
    quiz: false,
  };
  const numberQuestions = sources.fields.filter(({ field }) =>
    NUMERIC_FIELD_TYPES.includes(field.type),
  );

  const setVariables = (next: Variable[], mergeKey?: string) => {
    updateLogic((logic) => ({ ...logic, variables: next }), mergeKey ? { mergeKey } : undefined);
  };
  const updateVariable = (id: string, patch: Partial<Variable>, mergeKey?: string) => {
    setVariables(
      variables.map((variable) => {
        if (variable.id !== id) return variable;
        const next = { ...variable, ...patch };
        if (next.kind !== 'price') delete next.currency;
        else next.currency ??= 'INR';
        return next;
      }),
      mergeKey && `${mergeKey}:${id}`,
    );
  };
  const setRules = (next: Rule[], mergeKey?: string) => {
    updateLogic((logic) => ({ ...logic, rules: next }), mergeKey ? { mergeKey } : undefined);
  };
  const updateRule = (id: string, patch: Partial<Rule>, mergeKey?: string) => {
    setRules(
      rules.map((rule) => (rule.id === id ? { ...rule, ...patch } : rule)),
      mergeKey && `${mergeKey}:${id}`,
    );
  };

  return (
    <SettingsSection title="Values">
      <p className="flex items-center gap-1.5 text-13 text-muted-foreground">
        Scores, prices and other numbers worked out from the answers, to show on end screens, pipe
        into text and decide jumps.
        {!hasFeature('advanced_logic') && <ProBadge />}
      </p>

      <ul className="flex flex-col gap-3" aria-label="Values">
        {variables.map((variable, index) => {
          const at = issuesAt(issues, `variables.${index}`);
          const label = variable.name.trim() || `Value ${index + 1}`;
          return (
            <li
              key={variable.id}
              className="flex flex-col gap-3 rounded-lg border p-3"
              aria-label={label}
            >
              <div className="flex items-end gap-2">
                <div className="min-w-0 flex-1">
                  <FormField id={`variable-${variable.id}-name`} label="Name" error={at.name}>
                    <Input
                      value={variable.name}
                      maxLength={40}
                      onChange={(event) => {
                        updateVariable(variable.id, { name: event.target.value }, 'variable-name');
                      }}
                    />
                  </FormField>
                </div>
                <ActionTooltip label="Remove value">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="mb-1"
                    aria-label={`Remove ${label}`}
                    onClick={() => {
                      setVariables(variables.filter((candidate) => candidate.id !== variable.id));
                    }}
                  >
                    <Trash2 aria-hidden />
                  </Button>
                </ActionTooltip>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <SelectField
                  id={`variable-${variable.id}-kind`}
                  label="Kind"
                  value={variable.kind}
                  onValueChange={(value) => {
                    const kind = VARIABLE_KINDS.find((candidate) => candidate === value);
                    if (kind) updateVariable(variable.id, { kind });
                  }}
                >
                  {VARIABLE_KINDS.map((kind) => (
                    <SelectItem key={kind} value={kind}>
                      {KIND_LABELS[kind]}
                    </SelectItem>
                  ))}
                </SelectField>
                <FormField
                  id={`variable-${variable.id}-initial`}
                  label="Starts at"
                  error={at.initial}
                >
                  <NumberInput
                    value={variable.initial}
                    onValueChange={(initial) => {
                      updateVariable(variable.id, { initial: initial ?? 0 }, 'variable-initial');
                    }}
                  />
                </FormField>
              </div>
              {variable.kind === 'price' && (
                <FormField
                  id={`variable-${variable.id}-currency`}
                  label="Currency"
                  hint="A three-letter code, such as INR or USD."
                  error={at.currency}
                >
                  <Input
                    className="w-28 uppercase"
                    maxLength={3}
                    value={variable.currency ?? ''}
                    onChange={(event) => {
                      updateVariable(
                        variable.id,
                        { currency: event.target.value.toUpperCase() },
                        'variable-currency',
                      );
                    }}
                  />
                </FormField>
              )}
            </li>
          );
        })}
      </ul>
      <Button
        variant="secondary"
        size="sm"
        className="self-start"
        disabled={variables.length >= MAX_VARIABLES}
        onClick={() => {
          const kind = variables.length === 0 ? 'score' : 'number';
          setVariables([...variables, createVariable(kind)]);
        }}
      >
        <Plus aria-hidden />
        Add value
      </Button>

      {variables.length > 0 && (
        <div className="flex flex-col gap-3 pt-2">
          <h4 className="text-13 font-medium">Rules</h4>
          <p className="text-13 text-muted-foreground">
            They run in order, each starting from what the ones before left.
          </p>
          <ol className="flex flex-col gap-3" aria-label="Rules">
            {rules.map((rule, index) => {
              const at = issuesAt(issues, `rules.${index}`);
              const label = `Rule ${index + 1}`;
              return (
                <li
                  key={rule.id}
                  className="flex flex-col gap-3 rounded-lg border p-3"
                  aria-label={label}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-12 font-medium text-muted-foreground">{label}</span>
                    <ActionTooltip label="Remove rule">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="-mr-1.5 size-6"
                        aria-label={`Remove ${label.toLowerCase()}`}
                        onClick={() => {
                          setRules(rules.filter((candidate) => candidate.id !== rule.id));
                        }}
                      >
                        <Trash2 aria-hidden />
                      </Button>
                    </ActionTooltip>
                  </div>
                  <LogicConditions
                    label={label}
                    conditions={rule.when}
                    match={rule.match}
                    sources={sources}
                    issues={issuesAt(at, 'when')}
                    emptyText="Always applies."
                    onChange={(when, match, typing) => {
                      updateRule(rule.id, { when, match }, typing ? 'rule-condition' : undefined);
                    }}
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <SelectField
                      id={`rule-${rule.id}-operation`}
                      label="Then"
                      value={rule.operation}
                      onValueChange={(value) => {
                        const operation = RULE_OPERATIONS.find((candidate) => candidate === value);
                        if (operation) updateRule(rule.id, { operation });
                      }}
                    >
                      {RULE_OPERATIONS.map((operation) => (
                        <SelectItem key={operation} value={operation}>
                          {OPERATION_LABELS[operation]}
                        </SelectItem>
                      ))}
                    </SelectField>
                    <SelectField
                      id={`rule-${rule.id}-variable`}
                      label={
                        rule.operation === 'add'
                          ? 'To'
                          : rule.operation === 'subtract'
                            ? 'From'
                            : 'Value'
                      }
                      value={rule.variableId}
                      error={at.variableId}
                      onValueChange={(variableId) => {
                        updateRule(rule.id, { variableId });
                      }}
                    >
                      {variables.map((variable, variableIndex) => (
                        <SelectItem key={variable.id} value={variable.id}>
                          {variable.name.trim() || `Value ${variableIndex + 1}`}
                        </SelectItem>
                      ))}
                    </SelectField>
                  </div>
                  <SelectField
                    id={`rule-${rule.id}-amount-kind`}
                    label="By"
                    value={
                      rule.amount.kind === 'number' ? 'number' : `answer:${rule.amount.fieldId}`
                    }
                    error={at.amount}
                    onValueChange={(value) => {
                      if (value === 'number') {
                        updateRule(rule.id, { amount: { kind: 'number', value: 1 } });
                      } else {
                        updateRule(rule.id, {
                          amount: { kind: 'answer', fieldId: value.slice('answer:'.length) },
                        });
                      }
                    }}
                  >
                    <SelectItem value="number">A number</SelectItem>
                    {numberQuestions.map(({ field, position }) => (
                      <SelectItem key={field.id} value={`answer:${field.id}`}>
                        The answer to {position}. {field.label.trim() || 'Untitled question'}
                      </SelectItem>
                    ))}
                  </SelectField>
                  {rule.amount.kind === 'number' && (
                    <FormField id={`rule-${rule.id}-amount`} label="Number">
                      <NumberInput
                        className="w-32"
                        value={rule.amount.value}
                        onValueChange={(value) => {
                          updateRule(
                            rule.id,
                            { amount: { kind: 'number', value: value ?? 0 } },
                            'rule-amount',
                          );
                        }}
                      />
                    </FormField>
                  )}
                </li>
              );
            })}
          </ol>
          <Button
            variant="secondary"
            size="sm"
            className="self-start"
            disabled={rules.length >= MAX_RULES}
            onClick={() => {
              const first = variables[0];
              if (!first) return;
              const rule = createRule(first.id);
              const source = sources.fields.at(-1)?.field;
              setRules([
                ...rules,
                source ? { ...rule, when: [{ kind: 'answer', ...createCondition(source) }] } : rule,
              ]);
            }}
          >
            <Plus aria-hidden />
            Add rule
          </Button>
        </div>
      )}
    </SettingsSection>
  );
}
