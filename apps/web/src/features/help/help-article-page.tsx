import { ChevronRight } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { NotFoundPage } from '@/app/not-found-page';
import { usePageTitle } from '@/app/page-title';
import { Button } from '@/components/ui/button';
import { SiteFooter } from '@/features/landing/site-footer';
import { SiteHeader } from '@/features/landing/site-header';
import { HELP_ARTICLES, HELP_CATEGORIES, helpArticle, type HelpArticle } from './articles';
import { HelpArticleBody } from './help-article-body';

function Article({ article }: { article: HelpArticle }) {
  usePageTitle(article.title);
  const category = HELP_CATEGORIES.find((candidate) => candidate.id === article.category);
  const related = HELP_ARTICLES.filter(
    (other) => other.category === article.category && other.slug !== article.slug,
  ).slice(0, 3);

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 pt-8 pb-12 md:px-10 md:pt-12 md:pb-16">
        <nav aria-label="Breadcrumb">
          <ol className="flex flex-wrap items-center gap-1 text-13 text-muted-foreground">
            <li>
              <Link to="/help" className="rounded-sm hover:text-foreground">
                Help centre
              </Link>
            </li>
            {category && (
              <li className="flex items-center gap-1">
                <ChevronRight aria-hidden />
                <span>{category.label}</span>
              </li>
            )}
          </ol>
        </nav>
        <article className="mt-6">
          <h1 className="text-32 font-semibold tracking-tighter text-balance">{article.title}</h1>
          <p className="mt-3 text-16 text-muted-foreground">{article.summary}</p>
          <div className="mt-8">
            <HelpArticleBody blocks={article.body} />
          </div>
        </article>

        {related.length > 0 && (
          <section aria-labelledby="related-title" className="mt-12 border-t pt-8">
            <h2 id="related-title" className="text-16 font-semibold tracking-tight">
              Related
            </h2>
            <ul className="mt-3 flex flex-col gap-1">
              {related.map((other) => (
                <li key={other.slug}>
                  <Link
                    to={`/help/${other.slug}`}
                    className="rounded-sm text-14 text-accent underline-offset-4 hover:underline"
                  >
                    {other.title}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="mt-12 flex flex-col items-start gap-3 rounded-xl border p-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-14 text-muted-foreground">Didn’t find what you needed?</p>
          <Button asChild variant="secondary" size="sm">
            <Link to="/contact">Contact us</Link>
          </Button>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}

/** /help/:slug: one help article. */
export function HelpArticlePage() {
  const { slug = '' } = useParams();
  const article = helpArticle(slug);
  if (!article) return <NotFoundPage />;
  return <Article key={article.slug} article={article} />;
}
