import {
  TEMPLATE_CATEGORIES,
  TEMPLATE_CATEGORY_LABELS,
  type TemplateCategory,
} from '@formyx/shared';
import { Link, useSearchParams } from 'react-router';
import { buttonVariants } from '@/components/ui/button-variants';
import { SiteFooter } from '@/features/landing/site-footer';
import { SiteHeader } from '@/features/landing/site-header';
import { cn } from '@/lib/utils';
import { GALLERY, galleryInCategory } from './gallery';
import { TemplateCard } from './template-card';

function categoryFrom(value: string | null): TemplateCategory | null {
  return TEMPLATE_CATEGORIES.find((category) => category === value) ?? null;
}

const chipClass = cn(
  'inline-flex h-8 items-center rounded-lg border px-3 text-13 font-medium whitespace-nowrap',
  'transition-colors duration-150 ease-standard hover:border-border-strong hover:bg-hover active:bg-pressed',
  'aria-[current=page]:border-accent aria-[current=page]:bg-accent-subtle',
);

/** Every template, by category. Public: each one links to its own page with a live preview. */
export function TemplatesPage() {
  const [searchParams] = useSearchParams();
  const selected = categoryFrom(searchParams.get('category'));
  const categories = selected ? [selected] : TEMPLATE_CATEGORIES;

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 pt-12 pb-24 md:px-10 md:pt-20">
        <h1 className="text-32 font-semibold tracking-tighter text-balance md:text-40">
          Form templates
        </h1>
        <p className="mt-3 max-w-2xl text-16 text-muted-foreground">
          <span className="tabular-nums">{GALLERY.length}</span> ready-made forms, each in its own
          look. Try any of them right here, then make it yours: every question, rule and colour can
          be changed.
        </p>

        <nav aria-label="Categories" className="mt-8">
          <ul className="flex flex-wrap gap-2">
            <li>
              <Link to="/templates" className={chipClass} aria-current={!selected && 'page'}>
                All
              </Link>
            </li>
            {TEMPLATE_CATEGORIES.map((category) => (
              <li key={category}>
                <Link
                  to={`/templates?category=${category}`}
                  className={chipClass}
                  aria-current={selected === category && 'page'}
                >
                  {TEMPLATE_CATEGORY_LABELS[category]}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {categories.map((category) => (
          <section key={category} aria-labelledby={`category-${category}`} className="mt-12">
            <h2 id={`category-${category}`} className="text-20 font-semibold tracking-tight">
              {TEMPLATE_CATEGORY_LABELS[category]}
            </h2>
            <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {galleryInCategory(category).map((template) => (
                <TemplateCard key={template.id} template={template} />
              ))}
            </ul>
          </section>
        ))}

        <section
          aria-labelledby="blank-title"
          className="mt-16 flex flex-col items-start gap-4 rounded-xl border p-6 sm:flex-row sm:items-center sm:justify-between"
        >
          <div>
            <h2 id="blank-title" className="text-16 font-semibold tracking-tight">
              Prefer a blank page?
            </h2>
            <p className="mt-1 text-14 text-muted-foreground">
              Start from nothing and build exactly the form you need.
            </p>
          </div>
          <Link to="/signup" className={buttonVariants({ variant: 'secondary' })}>
            Start from scratch
          </Link>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
