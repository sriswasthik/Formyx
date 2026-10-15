import type { ReactNode } from 'react';
import { SiteFooter } from '@/features/landing/site-footer';
import { SiteHeader } from '@/features/landing/site-header';
import { formatPolicyDate, SITE } from './site-config';

export interface LegalSection {
  id: string;
  title: string;
  body: ReactNode;
}

/** A page of a policy: its title, when it changed, a contents list and its sections. */
export function LegalPage({
  title,
  intro,
  sections,
}: {
  title: string;
  intro: ReactNode;
  sections: readonly LegalSection[];
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 pt-12 pb-12 md:px-10 md:pt-20 md:pb-16">
        <h1 className="text-32 font-semibold tracking-tighter text-balance">{title}</h1>
        <p className="mt-2 text-13 text-muted-foreground">
          Last updated{' '}
          <time dateTime={SITE.policiesUpdated}>{formatPolicyDate(SITE.policiesUpdated)}</time>
        </p>
        <div className="mt-6 text-16 text-muted-foreground">{intro}</div>

        <nav aria-label="On this page" className="mt-8 rounded-xl border p-5">
          <h2 className="text-13 font-medium">On this page</h2>
          <ol className="mt-2 grid gap-1 text-14 sm:grid-cols-2">
            {sections.map((section) => (
              <li key={section.id}>
                <a
                  href={`#${section.id}`}
                  className="rounded-sm text-accent underline-offset-4 hover:underline"
                >
                  {section.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        {sections.map((section) => (
          <section
            key={section.id}
            id={section.id}
            aria-labelledby={`${section.id}-title`}
            className="mt-10 scroll-mt-8"
          >
            <h2 id={`${section.id}-title`} className="text-20 font-semibold tracking-tight">
              {section.title}
            </h2>
            <div className="mt-3 flex flex-col gap-3 text-14 leading-relaxed">{section.body}</div>
          </section>
        ))}

        <p className="mt-12 border-t pt-6 text-14 text-muted-foreground">
          Questions about this policy? Write to{' '}
          <a
            href={`mailto:${SITE.contactEmail}`}
            className="text-accent underline-offset-4 hover:underline"
          >
            {SITE.contactEmail}
          </a>
          .
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}

/** A bulleted list inside a policy section. */
export function PolicyList({ items }: { items: readonly ReactNode[] }) {
  return (
    <ul className="flex list-disc flex-col gap-1.5 pl-5 marker:text-muted-foreground">
      {items.map((item, index) => (
        // Fixed text that never reorders: its position is its identity.
        <li key={index}>{item}</li>
      ))}
    </ul>
  );
}
