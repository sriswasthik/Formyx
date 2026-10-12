import { PLAN_LABELS, PLANS, planComparison } from '@formyx/shared';
import { Check, Minus } from 'lucide-react';

/** Every plan side by side: limits, then each group of features, from the shared registry. */
export function ComparisonTable() {
  const sections = planComparison();
  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full min-w-[36rem] border-collapse text-14">
        <caption className="sr-only">What each plan includes</caption>
        <thead>
          <tr className="border-b bg-surface">
            <th
              scope="col"
              className="w-[40%] px-4 py-3 text-left text-13 font-medium text-muted-foreground"
            >
              Feature
            </th>
            {PLANS.map((plan) => (
              <th key={plan} scope="col" className="px-4 py-3 text-left text-14 font-semibold">
                {PLAN_LABELS[plan]}
              </th>
            ))}
          </tr>
        </thead>
        {sections.map(({ title, rows }) => (
          <tbody key={title}>
            <tr className="border-b">
              <th
                scope="colgroup"
                colSpan={PLANS.length + 1}
                className="bg-surface/60 px-4 pt-5 pb-2 text-left text-12 font-medium tracking-wide text-muted-foreground uppercase"
              >
                {title}
              </th>
            </tr>
            {rows.map((row) => (
              <tr key={row.id} className="border-b last:border-b-0">
                <th scope="row" className="px-4 py-3 text-left align-top font-normal">
                  <span className="block font-medium">{row.name}</span>
                  {row.description && (
                    <span className="mt-0.5 block text-13 text-muted-foreground">
                      {row.description}
                    </span>
                  )}
                </th>
                {PLANS.map((plan) => {
                  const value = row.values[plan];
                  return (
                    <td key={plan} className="px-4 py-3 align-top tabular-nums">
                      {typeof value === 'string' ? (
                        value
                      ) : value ? (
                        <>
                          <Check className="text-foreground" aria-hidden />
                          <span className="sr-only">Included</span>
                        </>
                      ) : (
                        <>
                          <Minus className="text-muted-foreground" aria-hidden />
                          <span className="sr-only">Not included</span>
                        </>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </div>
  );
}
