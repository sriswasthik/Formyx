import type { ResponsesPerDay } from '@formyx/shared';
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
import { formatCalendarDate } from '../format';
import { responsesLabel } from './responses-label';

/*
 * The chart itself, in a module of its own: Recharts is large, so it loads only when a summary
 * is shown, while the rest of the page is already on screen.
 */

type Day = ResponsesPerDay['days'][number];

const AXIS_TICK = { fill: 'var(--muted-foreground)', fontSize: 12 };

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

interface PerDayAreaChartProps {
  days: Day[];
  /** What the chart shows, in words. */
  description: string;
  animate: boolean;
}

export function PerDayAreaChart({ days, description, animate }: PerDayAreaChartProps) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart
        data={days}
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
          content={(props) => <ChartTooltip active={props.active} payload={props.payload} />}
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
          isAnimationActive={animate}
          animationDuration={250}
          animationEasing="ease-out"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
