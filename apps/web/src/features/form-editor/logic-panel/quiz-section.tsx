import { QUIZ_FIELD_TYPES, type Field, type QuizAnswer, type QuizSettings } from '@formyx/shared';
import { FormField } from '@/components/form-field';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ProBadge } from '@/features/entitlements/pro-badge';
import { useEditorEntitlements } from '../editor-entitlements';
import { useEditorStore } from '../editor-store-context';
import { NumberInput } from '../settings/number-input';
import { SettingsSection } from '../settings/settings-section';
import { SwitchSetting } from '../settings/switch-setting';
import { issuesAt, useLogicIssues } from './use-logic-issues';

const NEW_QUIZ: QuizSettings = {
  enabled: true,
  answers: {},
  showScore: true,
  revealAnswers: false,
};

/** The options a question's right answers are picked from. */
function choicesOf(field: Field): { id: string; label: string }[] | null {
  if (field.type === 'yes_no') {
    return [
      { id: 'yes', label: 'Yes' },
      { id: 'no', label: 'No' },
    ];
  }
  return 'options' in field ? field.options : null;
}

interface QuestionKeyProps {
  field: Field;
  position: number;
  answer: QuizAnswer | undefined;
  issues: Record<string, string>;
  onChange: (answer: QuizAnswer | undefined, mergeKey?: string) => void;
}

/** One question's right answers and points, or that it is not marked. */
function QuestionKey({ field, position, answer, issues, onChange }: QuestionKeyProps) {
  const choices = choicesOf(field);
  const name = `${position}. ${field.label.trim() || 'Untitled question'}`;
  const id = `quiz-${field.id}`;
  return (
    <li className="flex flex-col gap-3 rounded-lg border p-3" aria-label={name}>
      <SwitchSetting
        id={`${id}-marked`}
        label={name}
        hint={answer ? 'Marked.' : 'Not marked.'}
        checked={answer !== undefined}
        onCheckedChange={(marked) => {
          onChange(marked ? { correct: [], points: 1 } : undefined);
        }}
      />
      {answer && (
        <>
          {choices ? (
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-13 font-medium">
                {field.type === 'multi_choice' ? 'Right answers (all of them)' : 'Right answer'}
              </legend>
              {choices.map((choice) => (
                <div key={choice.id} className="flex items-center gap-2">
                  <Checkbox
                    id={`${id}-${choice.id}`}
                    checked={answer.correct.includes(choice.id)}
                    onCheckedChange={(checked) => {
                      const correct = checked
                        ? choices
                            .map((item) => item.id)
                            .filter((item) => item === choice.id || answer.correct.includes(item))
                        : answer.correct.filter((item) => item !== choice.id);
                      onChange({ ...answer, correct });
                    }}
                  />
                  <Label htmlFor={`${id}-${choice.id}`} className="font-normal">
                    {choice.label || 'Untitled option'}
                  </Label>
                </div>
              ))}
              {issues.correct && <p className="text-13 text-danger-text">{issues.correct}</p>}
            </fieldset>
          ) : (
            <FormField
              id={`${id}-accepted`}
              label={field.type === 'number' ? 'Right answers' : 'Accepted answers'}
              hint={
                field.type === 'number'
                  ? 'Numbers, separated by commas.'
                  : 'Separated by commas. Case and spacing do not matter.'
              }
              error={issues.correct}
            >
              <Input
                value={answer.correct.join(', ')}
                onChange={(event) => {
                  const correct = event.target.value
                    .split(',')
                    .map((text) => text.trim())
                    .filter(Boolean);
                  onChange({ ...answer, correct }, `quiz-accepted:${field.id}`);
                }}
              />
            </FormField>
          )}
          <FormField id={`${id}-points`} label="Points" error={issues.points}>
            <NumberInput
              integer
              className="w-24"
              value={answer.points}
              onValueChange={(points) => {
                onChange({ ...answer, points: points ?? 0 }, `quiz-points:${field.id}`);
              }}
            />
          </FormField>
        </>
      )}
    </li>
  );
}

/** Quiz mode: right answers and points, the pass mark, and what respondents see after. */
export function QuizSection() {
  const fields = useEditorStore((state) => state.schema.fields);
  const quiz = useEditorStore((state) => state.schema.logic.quiz);
  const updateLogic = useEditorStore((state) => state.updateLogic);
  const { hasFeature } = useEditorEntitlements();
  const logicIssues = useLogicIssues();
  const issues = issuesAt(logicIssues, 'quiz');
  const enabled = quiz?.enabled === true;
  const quizzable = fields
    .map((field, index) => ({ field, position: index + 1 }))
    .filter(({ field }) => QUIZ_FIELD_TYPES.includes(field.type));

  const setQuiz = (update: (current: QuizSettings) => QuizSettings, mergeKey?: string) => {
    updateLogic(
      (logic) => ({ ...logic, quiz: update(logic.quiz ?? NEW_QUIZ) }),
      mergeKey ? { mergeKey } : undefined,
    );
  };

  return (
    <SettingsSection title="Quiz">
      <SwitchSetting
        id="quiz-enabled"
        label="Quiz mode"
        hint="Mark answers right or wrong and give respondents a score."
        checked={enabled}
        onCheckedChange={(on) => {
          updateLogic((logic) =>
            logic.quiz
              ? { ...logic, quiz: { ...logic.quiz, enabled: on } }
              : // A new quiz shows its score on every end screen.
                {
                  ...logic,
                  quiz: { ...NEW_QUIZ, enabled: on },
                  endScreens: logic.endScreens.map((screen) => ({ ...screen, showScore: true })),
                },
          );
        }}
      />
      {!hasFeature('quiz_mode') && (
        <p className="flex items-center gap-1.5 text-13 text-muted-foreground">
          <ProBadge feature="quiz_mode" /> Publishing a quiz takes a Pro plan.
        </p>
      )}
      {quiz?.enabled && (
        <>
          <FormField
            id="quiz-pass-mark"
            label="Pass mark (%)"
            hint="Optional. The share of the points needed to pass, for end screens to check."
            error={issues.passPercent}
          >
            <NumberInput
              integer
              className="w-24"
              placeholder="None"
              value={quiz.passPercent}
              onValueChange={(passPercent) => {
                setQuiz(
                  ({ passPercent: _old, ...rest }) =>
                    passPercent === undefined ? rest : { ...rest, passPercent },
                  'quiz-pass',
                );
              }}
            />
          </FormField>
          <SwitchSetting
            id="quiz-show-score"
            label="Show the score"
            hint="On every end screen, after submitting."
            checked={quiz.showScore}
            onCheckedChange={(showScore) => {
              updateLogic((logic) => ({
                ...logic,
                quiz: { ...(logic.quiz ?? NEW_QUIZ), showScore },
                endScreens: logic.endScreens.map((screen) => ({ ...screen, showScore })),
              }));
            }}
          />
          <SwitchSetting
            id="quiz-reveal"
            label="Reveal the right answers"
            hint="After submitting, respondents see which answers were right."
            checked={quiz.revealAnswers}
            onCheckedChange={(revealAnswers) => {
              setQuiz((current) => ({ ...current, revealAnswers }));
            }}
          />
          {logicIssues.quiz && <p className="text-13 text-danger-text">{logicIssues.quiz}</p>}
          <h4 className="pt-2 text-13 font-medium">Questions</h4>
          {quizzable.length === 0 ? (
            <p className="text-13 text-muted-foreground">
              Add choice, yes/no, short text or number questions to mark.
            </p>
          ) : (
            <ul className="flex flex-col gap-3" aria-label="Questions to mark">
              {quizzable.map(({ field, position }) => (
                <QuestionKey
                  key={field.id}
                  field={field}
                  position={position}
                  answer={quiz.answers[field.id]}
                  issues={issuesAt(issues, `answers.${field.id}`)}
                  onChange={(answer, mergeKey) => {
                    setQuiz((current) => {
                      const { [field.id]: _old, ...rest } = current.answers;
                      return {
                        ...current,
                        answers: answer ? { ...rest, [field.id]: answer } : rest,
                      };
                    }, mergeKey);
                  }}
                />
              ))}
            </ul>
          )}
        </>
      )}
    </SettingsSection>
  );
}
