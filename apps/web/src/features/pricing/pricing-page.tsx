import {
  GRACE_DAYS,
  PLAN_LABELS,
  TRIAL_DAYS,
  type BillingInterval,
  type Plan,
} from '@formyx/shared';
import { useState } from 'react';
import { Link } from 'react-router';
import { buttonVariants } from '@/components/ui/button-variants';
import { SiteFooter } from '@/features/landing/site-footer';
import { SiteHeader } from '@/features/landing/site-header';
import { ComparisonTable } from './comparison-table';
import { IntervalToggle } from './interval-toggle';
import { PlanCards } from './plan-cards';

const FAQ = [
  {
    question: 'Do I need a card to start?',
    answer: `No. Every new account gets ${String(TRIAL_DAYS)} days of Pro for its first workspace, without a card. When the trial ends you choose a plan, or carry on with Free.`,
  },
  {
    question: 'What happens to my forms if I go back to Free?',
    answer:
      'They keep working and nothing is deleted. Forms using Pro looks are shown with the closest free fonts and backgrounds, and Pro extras like integrations pause. Upgrading again brings everything back exactly as it was.',
  },
  {
    question: 'What if my forms get more responses than my plan allows?',
    answer:
      'No response is ever lost. We let you know at 80% and at 100% of the month’s responses, so you can upgrade if you need to. The count starts again each billing period.',
  },
  {
    question: 'Can I cancel at any time?',
    answer:
      'Yes, from your workspace’s billing settings. Your plan runs to the end of the period you paid for, and you can resume it any time before then.',
  },
  {
    question: 'What if a payment fails?',
    answer: `Your plan keeps working for ${String(GRACE_DAYS)} days while the payment is retried, and we email you so you can update your payment method.`,
  },
  {
    question: 'How do I pay?',
    answer:
      'Payments are handled by Razorpay: cards, UPI and other methods available in India. Prices are in Indian rupees, and Razorpay emails a receipt for each payment.',
  },
];

/** Plans and prices. Public; the numbers and the comparison come from the shared registry. */
export function PricingPage() {
  const [interval, setBillingInterval] = useState<BillingInterval>('monthly');

  const action = (plan: Plan) => (
    <Link
      to="/signup"
      className={buttonVariants({
        variant: plan === 'PRO' ? 'primary' : 'secondary',
        className: 'w-full',
      })}
    >
      {plan === 'FREE' ? 'Start for free' : `Try ${PLAN_LABELS[plan]}`}
    </Link>
  );

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 pt-12 pb-12 md:px-10 md:pt-20 md:pb-16">
        <div className="flex flex-col items-center gap-3 text-center">
          <h1 className="text-32 font-semibold tracking-tighter md:text-40">Pricing</h1>
          <p className="max-w-xl text-16 text-muted-foreground">
            Start with {TRIAL_DAYS} days of Pro, no card needed. Then keep Free, or pick the plan
            your forms need.
          </p>
          <div className="mt-4">
            <IntervalToggle value={interval} onChange={setBillingInterval} />
          </div>
        </div>

        <section aria-label="Plans" className="mt-10">
          <PlanCards interval={interval} highlight="PRO" action={action} />
        </section>

        <section aria-labelledby="compare" className="mt-20">
          <h2 id="compare" className="text-24 font-semibold tracking-tight">
            Compare plans
          </h2>
          <div className="mt-6">
            <ComparisonTable />
          </div>
        </section>

        <section aria-labelledby="faq" className="mt-20 max-w-3xl">
          <h2 id="faq" className="text-24 font-semibold tracking-tight">
            Questions
          </h2>
          <div className="mt-6 flex flex-col divide-y rounded-xl border">
            {FAQ.map(({ question, answer }) => (
              <details key={question} className="group px-5 py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-md text-14 font-medium focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none [&::-webkit-details-marker]:hidden">
                  {question}
                  <span
                    aria-hidden
                    className="text-muted-foreground transition-transform duration-150 ease-standard group-open:rotate-45 motion-reduce:transition-none"
                  >
                    +
                  </span>
                </summary>
                <p className="mt-2 text-14 text-muted-foreground">{answer}</p>
              </details>
            ))}
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
