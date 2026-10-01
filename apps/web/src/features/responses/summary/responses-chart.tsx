import {
  ANALYTICS_RANGE_LABELS,
  ANALYTICS_RANGES,
  analyticsRangeSchema,
  type AnalyticsRange,
  type ResponsesPerDay,
} from '@formyx/shared';
import { useReducedMotion } from 'motion/react';
import { useId } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';
import { formatCalendarDate, formatCount } from '../format';

type Day = ResponsesPerDay['days'][number];

const RANGE_SHORT_LABELS: Record<AnalyticsRange, string> = {
  '7d': '7d',
  '30d': '30d',
  '90d': '90d',
};

const AXIS_TICK = { fill: 'var(--muted-foreground)', fontSize: 12 };

function responsesLabel(count: number): string {
  return `${formatCount(count)} ${count === 1 ? 'response' : 'responses'}`;
}

/** The value leads; the day follows, quieter. */
function ChartTooltip({ active, payload }: Pick<TooltipContentProps, 'active' | 'payload'>) {
  const day = payload[0]?.payload as Day | undefined;
  if (!active || !day) return null;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-popover-foreground shadow-popover">
      <p className="flex items-center gap-2 text-14 font-semibold tabular-nums">
        <span aria-hidden className="h-0.5 w-3 rounded-full bg-accent" />
        {responsesLabel(day.responses)}
      </p>
      <p className="text-12 text-muted-foreground">{formatCalendarDate(day.date, 'long')}</p>
    </div>
  );
}

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
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={perDay.days}
                margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
                title="Responses per day"
                desc={description}
              >
                <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="0" />
                <XAxis
                  dataKey="date"
                  tickFormatter={(date: string) => formatCalendarDate(date, 'short')}
                  tick={AXIS_TICK}
                  tickLine={false}
                  axisLine={{ stroke: 'var(--border)' }}
                  tickMargin={8}
                  minTickGap={24}
                  interval="preserveStartEnd"
                />
                <YAxis
                  allowDecimals={false}
                  domain={[0, (max: number) => Math.max(max, 4)]}
                  tick={AXIS_TICK}
                  tickLine={false}
                  axisLine={false}
                  tickMargin={4}
                  width={36}
                />
                <Tooltip
                  cursor={{ stroke: 'var(--border-strong)', strokeWidth: 1 }}
                  content={(props) => (
                    <ChartTooltip active={props.active} payload={props.payload} />
                  )}
                  isAnimationActive={false}
                />
                <Area
                  type="monotone"
                  dataKey="responses"
                  name="Responses"
                  stroke="var(--accent)"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="var(--accent)"
                  fillOpacity={0.08}
                  dot={false}
                  activeDot={{ r: 4, fill: 'var(--accent)', stroke: 'var(--card)', strokeWidth: 2 }}
                  isAnimationActive={!reduceMotion}
                  animationDuration={250}
                  animationEasing="ease-out"
                />
              </AreaChart>
            </ResponsiveContainer>
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
