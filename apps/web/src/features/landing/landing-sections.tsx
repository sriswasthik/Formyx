import {
  formatInr,
  FORM_TEMPLATE_IDS,
  getLimit,
  PLAN_LABELS,
  PRICES,
  TEMPLATE_CATEGORIES,
  TEMPLATE_CATEGORY_LABELS,
  TRIAL_DAYS,
} from '@formyx/shared';
import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';

const chipClass =
  'inline-flex h-9 items-center rounded-lg border bg-background px-3.5 text-14 transition-colors duration-150 ease-standard hover:border-border-strong hover:bg-hover active:bg-pressed';

/** Every template but the blank form. */
const TEMPLATE_COUNT = FORM_TEMPLATE_IDS.length - 1;

/** A way into the template gallery, by category. */
export function TemplatesBand() {
  return (
    <section aria-labelledby="templates-title" className="border-t">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-20 md:px-10 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-md">
          <h2 id="templates-title" className="text-24 font-semibold tracking-tight">
            Start from one of <span className="tabular-nums">{TEMPLATE_COUNT}</span> templates
          </h2>
          <p className="mt-3 text-16 text-muted-foreground">
            Registrations, RSVPs, feedback, applications, orders and quizzes, each in its own look
            and ready to publish.
          </p>
          <Button asChild variant="secondary" className="mt-6">
            <Link to="/templates">
              Browse templates
              <ArrowRight aria-hidden />
            </Link>
          </Button>
        </div>
        <ul aria-label="Template categories" className="flex max-w-xl flex-wrap gap-2">
          {TEMPLATE_CATEGORIES.map((category) => (
            <li key={category}>
              <Link to={`/templates?category=${category}`} className={chipClass}>
                {TEMPLATE_CATEGORY_LABELS[category]}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** Prices in brief, from the shared registry, and the way to the full comparison. */
export function PricingTeaser() {
  return (
    <section aria-labelledby="pricing-title" className="border-t">
      <div className="mx-auto max-w-6xl px-6 py-20 md:px-10 md:py-28">
        <div className="mx-auto flex max-w-2xl flex-col items-center text-center">
          <h2 id="pricing-title" className="text-24 font-semibold tracking-tight md:text-32">
            Free to start. Fair when you grow.
          </h2>
          <p className="mt-3 text-16 text-muted-foreground">
            The free plan has unlimited forms and{' '}
            <span className="tabular-nums">{getLimit('FREE', 'responses_per_month')}</span>{' '}
            responses a month. {PLAN_LABELS.PRO} is{' '}
            <span className="tabular-nums">{formatInr(PRICES.PRO.monthly)}</span> a month and{' '}
            {PLAN_LABELS.BUSINESS}{' '}
            <span className="tabular-nums">{formatInr(PRICES.BUSINESS.monthly)}</span>, with{' '}
            {TRIAL_DAYS} days of {PLAN_LABELS.PRO} free for every new account.
          </p>
          <div className="mt-8 flex w-full flex-col justify-center gap-3 sm:w-auto sm:flex-row">
            <Button asChild size="lg">
              <Link to="/signup">Get started free</Link>
            </Button>
            <Button asChild size="lg" variant="secondary">
              <Link to="/pricing">Compare plans</Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
