import {
  formatInr,
  isPaidPlan,
  PRICES,
  yearlySaving,
  type BillingInterval,
  type Plan,
} from '@formyx/shared';

/** A plan's price for an interval: "₹299 / month", or the year's price with what it saves. */
export function PlanPrice({ plan, interval }: { plan: Plan; interval: BillingInterval }) {
  if (!isPaidPlan(plan)) {
    return (
      <p className="flex items-baseline gap-1">
        <span className="text-32 font-semibold tracking-tight tabular-nums">{formatInr(0)}</span>
        <span className="text-13 text-muted-foreground">forever</span>
      </p>
    );
  }
  const price = PRICES[plan][interval];
  return (
    <div className="flex flex-col gap-0.5">
      <p className="flex items-baseline gap-1">
        <span className="text-32 font-semibold tracking-tight tabular-nums">
          {formatInr(price)}
        </span>
        <span className="text-13 text-muted-foreground">
          {interval === 'monthly' ? '/ month' : '/ year'}
        </span>
      </p>
      <p className="text-13 text-muted-foreground tabular-nums">
        {interval === 'yearly'
          ? `${formatInr(Math.round(price / 1200) * 100)} a month, saving ${formatInr(yearlySaving(plan).amount)}`
          : `or ${formatInr(PRICES[plan].yearly)} a year`}
      </p>
    </div>
  );
}
