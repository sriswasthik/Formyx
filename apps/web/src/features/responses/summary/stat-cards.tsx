import { averageCompletionTimeMs, completionRate, type AnalyticsTotals } from '@formyx/shared';
import { m } from 'motion/react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { DURATION, EASE_STANDARD } from '@/lib/motion';
import { formatCount, formatDuration, formatPercent } from '../format';

interface Stat {
  label: string;
  value: string;
  detail: string;
}

function stats(totals: AnalyticsTotals): Stat[] {
  const rate = completionRate(totals);
  const averageTime = averageCompletionTimeMs(totals);
  return [
    { label: 'Views', value: formatCount(totals.views), detail: 'Visits to the public form' },
    { label: 'Responses', value: formatCount(totals.responses), detail: 'Submitted so far' },
    {
      label: 'Completion rate',
      value: rate === null ? '—' : formatPercent(rate),
      detail: 'Responses per view',
    },
    {
      label: 'Average time',
      value: averageTime === null ? '—' : formatDuration(averageTime),
      detail: 'From opening to submitting',
    },
  ];
}

const grid = 'grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4';

/** The form's headline numbers, over all time. */
export function StatCards({ totals }: { totals: AnalyticsTotals }) {
  return (
    <dl className={grid}>
      {stats(totals).map((stat) => (
        <Card key={stat.label} className="flex flex-col p-5">
          <dt className="text-13 text-muted-foreground">{stat.label}</dt>
          <dd className="mt-1 text-24 font-semibold tracking-tight tabular-nums">
            {/* A changed number (say, a live response) settles in rather than snapping. */}
            <m.span
              key={stat.value}
              initial={{ opacity: 0.4 }}
              animate={{ opacity: 1 }}
              transition={{ duration: DURATION.slow, ease: EASE_STANDARD }}
              className="inline-block"
            >
              {stat.value}
            </m.span>
          </dd>
          <dd className="mt-1 text-12 text-muted-foreground">{stat.detail}</dd>
        </Card>
      ))}
    </dl>
  );
}

export function StatCardsSkeleton() {
  return (
    <div className={grid}>
      {Array.from({ length: 4 }, (_, index) => (
        <Card key={index} className="flex flex-col gap-2 p-5">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-7 w-16" />
          <Skeleton className="h-3 w-28" />
        </Card>
      ))}
    </div>
  );
}
