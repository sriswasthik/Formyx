import { endScreenLabel, pipedValue, type FormLogic, type StoredOutcome } from '@formyx/shared';

/**
 * Where a response ended up, as the server worked it out: the end screen, the quiz mark and
 * each value. Nothing for responses from before outcomes were kept.
 */
export function ResponseOutcome({
  logic,
  outcome,
}: {
  logic: FormLogic;
  outcome: StoredOutcome | null;
}) {
  if (!outcome) return null;
  const rows = [
    ...(logic.endScreens.length > 1
      ? [{ label: 'End screen', value: endScreenLabel({ logic }, outcome.endScreenId) }]
      : []),
    ...(outcome.quiz
      ? [
          {
            label: 'Quiz score',
            value: `${outcome.quiz.score} out of ${outcome.quiz.max} (${outcome.quiz.percent}%)${
              outcome.quiz.passed === null ? '' : outcome.quiz.passed ? ', passed' : ', not passed'
            }`,
          },
        ]
      : []),
    ...logic.variables.flatMap((variable, index) => {
      const value = outcome.values[variable.id];
      return value === undefined
        ? []
        : [
            {
              label: variable.name.trim() || `Value ${index + 1}`,
              value: pipedValue(variable, value),
            },
          ];
    }),
  ];
  if (rows.length === 0) return null;

  return (
    <section aria-labelledby="response-outcome" className="flex flex-col gap-3">
      <h3 id="response-outcome" className="text-13 font-semibold tracking-tight">
        Outcome
      </h3>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-13">
        {rows.map((row) => (
          <div key={row.label} className="contents">
            <dt className="text-muted-foreground">{row.label}</dt>
            <dd className="break-words tabular-nums">{row.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
