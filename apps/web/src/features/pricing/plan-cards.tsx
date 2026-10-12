import {
  FEATURES,
  formatLimit,
  getLimit,
  newFeatures,
  PLAN_LABELS,
  PLAN_TAGLINES,
  PLANS,
  type BillingInterval,
  type Plan,
} from '@formyx/shared';
import { Check } from 'lucide-react';
import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { PlanPrice } from './plan-price';

/** What every plan has, Free included. */
const FREE_BASICS = [
  'Unlimited forms and questions',
  'Conditional logic and analytics',
  'Themes, presets and free fonts',
  'Embeds, webhooks and CSV export',
];

/**
 * A card per plan: its price, what it adds to the plan below and its response limit, all
 * from the shared registry. `action` gives each card its button.
 */
export function PlanCards({
  interval,
  plans = PLANS,
  highlight,
  current,
  action,
}: {
  interval: BillingInterval;
  plans?: readonly Plan[];
  /** The plan to point out ("Most popular"). */
  highlight?: Plan;
  /** The workspace's plan, marked as such. */
  current?: Plan;
  action: (plan: Plan) => ReactNode;
}) {
  return (
    <ul
      className={cn(
        'grid gap-4',
        plans.length === 3 ? 'md:grid-cols-3' : plans.length === 2 && 'sm:grid-cols-2',
      )}
    >
      {plans.map((plan) => {
        const index = PLANS.indexOf(plan);
        const below = index > 0 ? PLANS[index - 1] : undefined;
        // Free's basics aren't plan features: every plan has them.
        const items = below
          ? newFeatures(plan).map((featureId) => FEATURES[featureId].name)
          : FREE_BASICS;
        const responses = formatLimit('responses_per_month', getLimit(plan, 'responses_per_month'));
        return (
          <li
            key={plan}
            aria-labelledby={`plan-${plan}`}
            className={cn(
              'flex flex-col gap-5 rounded-xl border bg-card p-6',
              plan === highlight && 'border-foreground/40',
            )}
          >
            <div className="flex flex-col gap-1.5">
              <h3 id={`plan-${plan}`} className="flex items-center gap-2 text-16 font-semibold">
                {PLAN_LABELS[plan]}
                {plan === current && <Badge variant="outline">Your plan</Badge>}
                {plan === highlight && plan !== current && (
                  <Badge variant="accent">Most popular</Badge>
                )}
              </h3>
              <p className="text-13 text-muted-foreground">{PLAN_TAGLINES[plan]}</p>
            </div>
            <PlanPrice plan={plan} interval={interval} />
            {action(plan)}
            <div className="flex flex-col gap-2 border-t pt-5">
              <p className="text-13 font-medium">
                {below ? `Everything in ${PLAN_LABELS[below]}, plus` : 'Includes'}
              </p>
              <ul className="flex flex-col gap-2 text-13">
                <li className="flex gap-2">
                  <Check className="mt-0.5 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="tabular-nums">
                    {responses === 'Unlimited'
                      ? 'Unlimited responses'
                      : `${responses} responses a month`}
                  </span>
                </li>
                {items.map((item) => (
                  <li key={item} className="flex gap-2">
                    <Check className="mt-0.5 shrink-0 text-muted-foreground" aria-hidden />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
