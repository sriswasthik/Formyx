import { useEffect } from 'react';
import { SiteFooter } from '@/features/landing/site-footer';
import { SiteHeader } from '@/features/landing/site-header';
import { CHANGELOG } from './changelog-entries';
import { markChangelogSeen } from './latest';

const dateFormat = new Intl.DateTimeFormat('en', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

/** What shipped, newest first. Public, so it can be linked from anywhere. */
export function ChangelogPage() {
  useEffect(() => {
    markChangelogSeen();
  }, []);

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 pt-12 pb-24 md:px-10 md:pt-20">
        <h1 className="text-32 font-semibold tracking-tighter">Changelog</h1>
        <p className="mt-3 text-16 text-muted-foreground">What’s new in Formyx, as it ships.</p>
        <ol className="mt-12 flex flex-col">
          {CHANGELOG.map((entry) => (
            <li
              key={entry.id}
              aria-labelledby={`changelog-${entry.id}`}
              className="grid gap-2 border-t py-8 md:grid-cols-[10rem_minmax(0,1fr)] md:gap-8"
            >
              <time
                dateTime={entry.date}
                className="text-13 text-muted-foreground tabular-nums md:pt-1"
              >
                {dateFormat.format(new Date(entry.date))}
              </time>
              <article className="min-w-0">
                <h2 id={`changelog-${entry.id}`} className="text-20 font-semibold tracking-tight">
                  {entry.title}
                </h2>
                <p className="mt-2 text-14 text-muted-foreground">{entry.summary}</p>
                <ul className="mt-4 flex list-disc flex-col gap-1.5 pl-5 text-14 marker:text-muted-foreground">
                  {entry.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </article>
            </li>
          ))}
        </ol>
      </main>
      <SiteFooter />
    </div>
  );
}
