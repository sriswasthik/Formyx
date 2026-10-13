import { ArrowRight, Search, SearchX } from 'lucide-react';
import { Link, useSearchParams } from 'react-router';
import { EmptyState } from '@/components/empty-state';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SiteFooter } from '@/features/landing/site-footer';
import { SiteHeader } from '@/features/landing/site-header';
import { SITE } from '@/features/legal/site-config';
import { HELP_ARTICLES, HELP_CATEGORIES, searchHelp, type HelpArticle } from './articles';

function ArticleLink({ article }: { article: HelpArticle }) {
  return (
    <li>
      <Link
        to={`/help/${article.slug}`}
        className="group flex items-start justify-between gap-3 rounded-lg border p-4 transition-colors duration-150 ease-standard hover:border-border-strong hover:bg-hover"
      >
        <span>
          <span className="block text-14 font-medium">{article.title}</span>
          <span className="mt-0.5 block text-13 text-muted-foreground">{article.summary}</span>
        </span>
        <ArrowRight
          className="mt-0.5 shrink-0 text-muted-foreground transition-transform duration-150 ease-standard group-hover:translate-x-0.5 motion-reduce:transition-none"
          aria-hidden
        />
      </Link>
    </li>
  );
}

/** /help: every article by topic, and a search across them that lives in the URL. */
export function HelpCentrePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get('q') ?? '';
  const results = query.trim() ? searchHelp(query) : null;

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-4xl flex-1 px-6 pt-12 pb-24 md:px-10 md:pt-20">
        <h1 className="text-32 font-semibold tracking-tighter">Help centre</h1>
        <p className="mt-3 text-16 text-muted-foreground">Short guides to every part of Formyx.</p>
        <form
          role="search"
          className="relative mt-8"
          onSubmit={(event) => {
            event.preventDefault();
          }}
        >
          <Search
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            aria-label="Search help articles"
            placeholder="Search, e.g. embed, quiz, Google Sheets"
            value={query}
            onChange={(event) => {
              const next = event.target.value;
              setSearchParams(next ? { q: next } : {}, { replace: true });
            }}
            className="h-10 pl-9"
          />
        </form>

        {results ? (
          <section aria-labelledby="results-title" className="mt-10">
            <h2 id="results-title" className="text-13 font-medium text-muted-foreground">
              <span className="tabular-nums">{results.length}</span>{' '}
              {results.length === 1 ? 'article' : 'articles'} for “{query.trim()}”
            </h2>
            {results.length > 0 ? (
              <ul className="mt-3 flex flex-col gap-2">
                {results.map((article) => (
                  <ArticleLink key={article.slug} article={article} />
                ))}
              </ul>
            ) : (
              <EmptyState
                icon={SearchX}
                title="Nothing matches that"
                description="Try another word, or ask us: a person will reply."
                action={
                  <Button asChild variant="secondary">
                    <Link to="/contact">Contact us</Link>
                  </Button>
                }
                className="mt-3"
              />
            )}
          </section>
        ) : (
          HELP_CATEGORIES.map((category) => {
            const articles = HELP_ARTICLES.filter((article) => article.category === category.id);
            return (
              <section key={category.id} aria-labelledby={`help-${category.id}`} className="mt-10">
                <h2 id={`help-${category.id}`} className="text-20 font-semibold tracking-tight">
                  {category.label}
                </h2>
                <ul className="mt-3 grid gap-2 md:grid-cols-2">
                  {articles.map((article) => (
                    <ArticleLink key={article.slug} article={article} />
                  ))}
                </ul>
              </section>
            );
          })
        )}

        <section className="mt-16 flex flex-col items-start gap-4 rounded-xl border p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-16 font-semibold tracking-tight">Still stuck?</h2>
            <p className="mt-1 text-14 text-muted-foreground">
              Write to us and a person will reply within {SITE.replyWithin}.
            </p>
          </div>
          <Button asChild variant="secondary">
            <Link to="/contact">Contact us</Link>
          </Button>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
