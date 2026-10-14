import { FIELD_TYPE_LABELS, TEMPLATE_CATEGORY_LABELS } from '@formyx/shared';
import { ChevronRight, Eye, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { NotFoundPage } from '@/app/not-found-page';
import { usePageTitle } from '@/app/page-title';
import { Button } from '@/components/ui/button';
import { buttonVariants } from '@/components/ui/button-variants';
import { previewUpload } from '@/features/form-renderer/file-uploads';
import { FormView } from '@/features/form-renderer/form-view';
import { SiteFooter } from '@/features/landing/site-footer';
import { SiteHeader } from '@/features/landing/site-header';
import { galleryInCategory, gallerySlug, templateAppPath, type GalleryTemplate } from './gallery';
import { TemplateCard } from './template-card';
import { CONTAINER } from '@/features/marketing/layout';
import { cn } from '@/lib/utils';

/** The template as respondents would get it, working, in its look. Nothing is sent. */
function LivePreview({ template }: { template: GalleryTemplate }) {
  // One schema per visit: its ids must stay the same while someone answers it.
  const [schema] = useState(() => template.build());
  const [run, setRun] = useState(0);

  return (
    <section aria-label="Live preview" className="overflow-hidden rounded-xl border">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b bg-background px-4 py-2 text-13 text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Eye aria-hidden />
          Live preview. Try it: nothing is sent.
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setRun((current) => current + 1);
          }}
        >
          <RotateCcw aria-hidden />
          Restart
        </Button>
      </div>
      <div className="flex h-[min(42rem,75dvh)] flex-col overflow-y-auto">
        {/* A new key starts a fresh, empty response. */}
        <FormView
          key={run}
          title={template.defaultTitle}
          schema={schema}
          theme={template.theme}
          titleAs="h2"
          variant="frame"
          uploadFile={previewUpload}
          className="flex-1"
        />
      </div>
    </section>
  );
}

function TemplateDetails({ template }: { template: GalleryTemplate }) {
  usePageTitle(`${template.name} template`);
  const category = template.category;
  const related = category
    ? galleryInCategory(category)
        .filter((other) => other.id !== template.id)
        .slice(0, 3)
    : [];

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className={cn(CONTAINER, 'flex-1 pt-8 pb-24 md:pt-12')}>
        <nav aria-label="Breadcrumb">
          <ol className="flex flex-wrap items-center gap-1 text-13 text-muted-foreground">
            <li>
              <Link to="/templates" className="rounded-sm hover:text-foreground">
                Templates
              </Link>
            </li>
            {category && (
              <li className="flex items-center gap-1">
                <ChevronRight aria-hidden />
                <Link
                  to={`/templates?category=${category}`}
                  className="rounded-sm hover:text-foreground"
                >
                  {TEMPLATE_CATEGORY_LABELS[category]}
                </Link>
              </li>
            )}
          </ol>
        </nav>

        <div className="mt-6 grid items-start gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <div>
            <h1 className="text-32 font-semibold tracking-tighter text-balance">
              {template.name} template
            </h1>
            <p className="mt-3 text-16 text-muted-foreground">{template.seoDescription}</p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              {/* Signed-in visitors go straight on to the app (see GuestRoute). */}
              <Link
                to="/signup"
                state={{ from: templateAppPath(template) }}
                className={buttonVariants({ size: 'lg' })}
              >
                Use this template
              </Link>
              <span className="text-13 text-muted-foreground">Free to start, no card needed.</span>
            </div>

            <h2 className="mt-10 text-16 font-semibold tracking-tight">
              What’s inside{' '}
              <span className="font-normal text-muted-foreground tabular-nums">
                ({template.questions.length})
              </span>
            </h2>
            <ol className="mt-3 flex flex-col divide-y rounded-xl border">
              {template.questions.map((question, index) => (
                <li key={question.id} className="flex items-baseline gap-3 px-4 py-2.5 text-14">
                  <span className="w-5 shrink-0 text-13 text-muted-foreground tabular-nums">
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1">{question.label}</span>
                  <span className="shrink-0 text-12 text-muted-foreground">
                    {FIELD_TYPE_LABELS[question.type]}
                  </span>
                </li>
              ))}
            </ol>
            {template.lookName && (
              <p className="mt-4 text-13 text-muted-foreground">
                Starts in the {template.lookName} look. Colours, fonts and backgrounds can all be
                changed in the Design Studio.
              </p>
            )}
          </div>

          <div className="lg:sticky lg:top-6">
            <LivePreview template={template} />
          </div>
        </div>

        {category && related.length > 0 && (
          <section aria-labelledby="related-title" className="mt-20">
            <h2 id="related-title" className="text-20 font-semibold tracking-tight">
              More in {TEMPLATE_CATEGORY_LABELS[category]}
            </h2>
            <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {related.map((other) => (
                <TemplateCard key={other.id} template={other} />
              ))}
            </ul>
          </section>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}

/** /templates/:slug: one template, its questions and a live preview, and a way to use it. */
export function TemplatePage() {
  const { slug = '' } = useParams();
  const template = gallerySlug(slug);
  if (!template) return <NotFoundPage />;
  // A new template is a new page: fresh preview, fresh answers.
  return <TemplateDetails key={template.id} template={template} />;
}
