import {
  ANALYTICS_RANGE_LABELS,
  ANALYTICS_RANGES,
  analyticsRangeSchema,
  type AnalyticsRange,
  type ResponsesPerDay,
} from '@formyx/shared';
import { useReducedMotion } from 'motion/react';
import { lazy, Suspense, useId } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';
import { formatCalendarDate } from '../format';
import { responsesLabel } from './responses-label';

// Recharts loads with the first summary, while the rest of the page is already showing.
const PerDayAreaChart = lazy(() =>
  import('./per-day-area-chart').then((module) => ({ default: module.PerDayAreaChart })),
);

const RANGE_SHORT_LABELS: Record<AnalyticsRange, string> = {
  '7d': '7d',
  '30d': '30d',
  '90d': '90d',
};

/** Words for what the chart shows, for screen readers and as the figure's caption. */
function describe(perDay: ResponsesPerDay): string {
  const total = perDay.days.reduce((sum, day) => sum + day.responses, 0);
  const range = ANALYTICS_RANGE_LABELS[perDay.range].toLowerCase();
  if (total === 0) return `No responses in the ${range}.`;
  const busiest = perDay.days.reduce((best, day) => (day.responses > best.responses ? day : best));
  return `${responsesLabel(total)} in the ${range}. Busiest day: ${formatCalendarDate(busiest.date, 'long')}, with ${responsesLabel(busiest.responses)}.`;
}

interface ResponsesChartProps {
  perDay: ResponsesPerDay;
  range: AnalyticsRange;
  onRangeChange: (range: AnalyticsRange) => void;
  /** A new range is loading: the current chart stays, dimmed, until it arrives. */
  updating: boolean;
}

export function ResponsesChart({ perDay, range, onRangeChange, updating }: ResponsesChartProps) {
  const reduceMotion = useReducedMotion() ?? false;
  const titleId = useId();
  const description = describe(perDay);
  const total = perDay.days.reduce((sum, day) => sum + day.responses, 0);

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-3 p-5 pb-0 sm:p-6 sm:pb-0">
        <div className="flex flex-col gap-1">
          <CardTitle id={titleId}>Responses over time</CardTitle>
          <p className="text-13 text-muted-foreground tabular-nums">
            {responsesLabel(total)} in the {ANALYTICS_RANGE_LABELS[perDay.range].toLowerCase()}
          </p>
        </div>
        <ToggleGroup
          type="single"
          aria-label="Chart period"
          value={range}
          onValueChange={(value) => {
            const parsed = analyticsRangeSchema.safeParse(value);
            if (parsed.success) onRangeChange(parsed.data);
          }}
        >
          {ANALYTICS_RANGES.map((option) => (
            <ToggleGroupItem
              key={option}
              value={option}
              aria-label={ANALYTICS_RANGE_LABELS[option]}
              className="px-2.5 tabular-nums"
            >
              {RANGE_SHORT_LABELS[option]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </CardHeader>
      <CardContent className="p-5 pt-4 sm:p-6 sm:pt-4">
        <figure
          aria-labelledby={titleId}
          aria-busy={updating || undefined}
          className={cn('transition-opacity duration-200 ease-standard', updating && 'opacity-60')}
        >
          <div className="h-60">
            <Suspense fallback={<Skeleton className="size-full" />}>
              <PerDayAreaChart
                days={perDay.days}
                description={description}
                animate={!reduceMotion}
              />
            </Suspense>
          </div>
          <figcaption className="sr-only">{description}</figcaption>
          <table className="sr-only">
            <caption>Responses per day</caption>
            <thead>
              <tr>
                <th scope="col">Day</th>
                <th scope="col">Responses</th>
              </tr>
            </thead>
            <tbody>
              {perDay.days.map((day) => (
                <tr key={day.date}>
                  <th scope="row">{formatCalendarDate(day.date, 'long')}</th>
                  <td>{day.responses}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </figure>
      </CardContent>
    </Card>
  );
}
