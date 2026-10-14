import type { TemplateCategory } from '@formyx/shared';
import { Link } from 'react-router';
import { CONTAINER } from '@/features/marketing/layout';
import { Reveal } from '@/features/marketing/reveal';

/** What people build with Formyx, each leading to its templates. Use cases, not customers. */
const USE_CASES: { label: string; category: TemplateCategory }[] = [
  { label: 'Event registrations', category: 'events' },
  { label: 'Feedback', category: 'feedback' },
  { label: 'Job applications', category: 'hr' },
  { label: 'Quizzes', category: 'quizzes' },
  { label: 'Client intake', category: 'business' },
  { label: 'College admissions', category: 'education' },
];

export function BuiltFor() {
  return (
    <section aria-labelledby="built-for-title" className={CONTAINER}>
      <Reveal className="flex flex-col items-center gap-4 border-y py-8 md:flex-row md:gap-8">
        <h2 id="built-for-title" className="shrink-0 text-13 text-muted-foreground">
          Built for
        </h2>
        <ul className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-14 md:justify-start lg:gap-x-2">
          {USE_CASES.map(({ label, category }, index) => (
            <li key={category} className="flex items-center gap-2">
              {index > 0 && (
                <span aria-hidden className="hidden text-subtle-foreground lg:inline">
                  ·
                </span>
              )}
              <Link
                to={`/templates?category=${category}`}
                className="rounded-sm transition-colors duration-150 ease-standard hover:text-muted-foreground"
              >
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </Reveal>
    </section>
  );
}
