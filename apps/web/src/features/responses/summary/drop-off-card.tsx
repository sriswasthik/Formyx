import { biggestDrop, shareOf, type DropOff } from '@formyx/shared';
import { TrendingDown } from 'lucide-react';
import { m, useReducedMotion } from 'motion/react';
import { DURATION, EASE_STANDARD } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { formatCount, formatPercent } from '../format';

interface Step {
  key: string;
  label: string;
  reached: number;
}

/**
 * Drop-off: how many visits reached each page (or question), as a funnel from the visits
 * that started to those that sent a response, with the biggest drop marked.
 */
export function DropOffCard({ dropOff }: { dropOff: DropOff }) {
  const reduceMotion = useReducedMotion() ?? false;
  const drop = biggestDrop(dropOff);
  const steps: Step[] = [
    ...dropOff.steps,
    { key: 'completed', label: 'Sent a response', reached: dropOff.completed },
  ];
  const unit = dropOff.unit === 'page' ? 'page' : 'question';
  const lostStep = drop ? steps[drop.index] : undefined;

  return (
    <section
      aria-labelledby="drop-off-heading"
      className="flex flex-col gap-5 rounded-xl border bg-card p-5 text-card-foreground sm:p-6"
    >
      <header className="flex flex-col gap-1">
        <h2 id="drop-off-heading" className="text-14 font-semibold tracking-tight">
          Drop-off
        </h2>
        <p className="text-13 text-muted-foreground">
          How far visits got, {unit} by {unit}. Counted anonymously.
        </p>
      </header>

      {dropOff.started === 0 ? (
        <p className="text-14 text-muted-foreground">
          No visits counted yet. They are counted from now on, as people open the form.
        </p>
      ) : (
        <>
          {drop && lostStep && (
            <p className="flex items-start gap-2 text-13">
              <TrendingDown aria-hidden className="mt-0.5 size-4 shrink-0 text-warning-text" />
              <span>
                The biggest drop is before <span className="font-medium">{lostStep.label}</span>:{' '}
                <span className="tabular-nums">{formatCount(drop.lost)}</span>{' '}
                {drop.lost === 1 ? 'visit' : 'visits'} left.
              </span>
            </p>
          )}
          <ol className="flex flex-col gap-3" aria-label="Visits reaching each step">
            <li className="flex items-baseline justify-between gap-4 text-14">
              <span>Opened the form</span>
              <span className="text-13 text-muted-foreground tabular-nums">
                {formatCount(dropOff.started)}
              </span>
            </li>
            {steps.map((step, index) => {
              const share = shareOf(step.reached, dropOff.started);
              const biggest = drop?.index === index;
              return (
                <li
                  key={step.key}
                  className="flex flex-col gap-1.5"
                  data-biggest-drop={biggest || undefined}
                >
                  <div className="flex items-baseline justify-between gap-4 text-14">
                    <span className="min-w-0 break-words">
                      {step.label}
                      {biggest && (
                        <span className="sr-only"> (the biggest drop is before this)</span>
                      )}
                    </span>
                    <span className="shrink-0 text-13 text-muted-foreground tabular-nums">
                      <span className="font-medium text-foreground">{formatPercent(share)}</span>
                      <span aria-hidden> · </span>
                      <span className="sr-only">, </span>
                      {formatCount(step.reached)}
                    </span>
                  </div>
                  <div aria-hidden className="h-2 w-full rounded-r-[4px] bg-muted">
                    <m.div
                      className={cn('h-full rounded-r-[4px]', biggest ? 'bg-warning' : 'bg-accent')}
                      initial={{ width: 0 }}
                      animate={{ width: `${share * 100}%` }}
                      transition={{
                        duration: reduceMotion ? 0 : DURATION.slow,
                        ease: EASE_STANDARD,
                      }}
                    />
                  </div>
                </li>
              );
            })}
          </ol>
        </>
      )}
    </section>
  );
}
