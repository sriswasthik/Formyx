import { Building2, Clock, Mail } from 'lucide-react';
import { Link } from 'react-router';
import { SiteFooter } from '@/features/landing/site-footer';
import { SiteHeader } from '@/features/landing/site-header';
import { SITE } from './site-config';

const linkClass = 'text-accent underline-offset-4 hover:underline';

/** How to reach the people behind Formyx. */
export function ContactPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 pt-12 pb-24 md:px-10 md:pt-20">
        <h1 className="text-32 font-semibold tracking-tighter">Contact us</h1>
        <p className="mt-3 text-16 text-muted-foreground">
          Questions about your account, billing, or a form you received? Write to us and a person
          will reply.
        </p>

        <ul className="mt-10 grid gap-4 sm:grid-cols-2">
          <li className="rounded-xl border bg-card p-5 sm:col-span-2">
            <Mail className="text-muted-foreground" aria-hidden />
            <h2 className="mt-3 text-14 font-medium">Email</h2>
            <p className="mt-1 text-14">
              <a href={`mailto:${SITE.contactEmail}`} className={linkClass}>
                {SITE.contactEmail}
              </a>
            </p>
            <p className="mt-1 text-13 text-muted-foreground">
              For help, billing, refunds, privacy requests and anything else.
            </p>
          </li>
          <li className="rounded-xl border bg-card p-5">
            <Clock className="text-muted-foreground" aria-hidden />
            <h2 className="mt-3 text-14 font-medium">When we reply</h2>
            <p className="mt-1 text-14 text-muted-foreground">
              Within {SITE.replyWithin}. {SITE.supportHours}.
            </p>
          </li>
          <li className="rounded-xl border bg-card p-5">
            <Building2 className="text-muted-foreground" aria-hidden />
            <h2 className="mt-3 text-14 font-medium">Postal address</h2>
            <address className="mt-1 text-14 text-muted-foreground not-italic">
              {SITE.legalName}
              <br />
              {SITE.address}
            </address>
          </li>
        </ul>

        <section aria-labelledby="respondents-title" className="mt-12">
          <h2 id="respondents-title" className="text-16 font-semibold tracking-tight">
            Filled in someone’s form?
          </h2>
          <p className="mt-2 text-14 text-muted-foreground">
            Forms on {SITE.product} belong to the people who made them. To change or remove your
            answers, contact the form’s owner. If a form looks like a scam, or asks for passwords or
            card details, tell us at{' '}
            <a href={`mailto:${SITE.contactEmail}`} className={linkClass}>
              {SITE.contactEmail}
            </a>{' '}
            and we will look into it straight away.
          </p>
        </section>

        <p className="mt-10 text-14 text-muted-foreground">
          Many answers are already in our{' '}
          <Link to="/help" className={linkClass}>
            help centre
          </Link>
          , our{' '}
          <Link to="/pricing" className={linkClass}>
            pricing questions
          </Link>
          , and in our{' '}
          <Link to="/refunds" className={linkClass}>
            refund policy
          </Link>
          .
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}
