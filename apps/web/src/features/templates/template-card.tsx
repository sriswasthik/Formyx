import { TEMPLATE_CATEGORY_LABELS } from '@formyx/shared';
import { Link } from 'react-router';
import { cn } from '@/lib/utils';
import { questionCountLabel } from '@/features/forms/format';
import type { GalleryTemplate } from './gallery';
import { TemplateThumbnail } from './template-thumbnail';

/** One template in the gallery: its look, name and what it is for, linking to its page. */
export function TemplateCard({
  template,
  headingLevel = 'h3',
}: {
  template: GalleryTemplate;
  headingLevel?: 'h2' | 'h3';
}) {
  const Heading = headingLevel;
  return (
    <li className="relative flex flex-col rounded-xl border bg-card p-2 transition-colors duration-150 ease-standard hover:border-border-strong">
      <TemplateThumbnail template={template} className="border" />
      <div className="flex flex-1 flex-col px-2 pt-3 pb-2">
        <Heading className="text-14 font-medium">
          {/* The whole card is the link; the title names it. */}
          <Link
            to={`/templates/${template.slug}`}
            className={cn(
              'after:absolute after:inset-0 after:rounded-xl',
              // The ring goes round the whole card, as the global one would round the link.
              'focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-ring',
            )}
          >
            {template.name}
          </Link>
        </Heading>
        <p className="mt-1 text-13 text-muted-foreground">{template.description}</p>
        <p className="mt-auto pt-3 text-12 text-muted-foreground tabular-nums">
          {questionCountLabel(template.questions.length)}
          {template.category && <> · {TEMPLATE_CATEGORY_LABELS[template.category]}</>}
        </p>
      </div>
    </li>
  );
}
