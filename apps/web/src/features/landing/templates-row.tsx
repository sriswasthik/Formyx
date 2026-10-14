import { TEMPLATE_CATEGORY_LABELS } from '@formyx/shared';
import { Link } from 'react-router';
import { gallerySlug, type GalleryTemplate } from '@/features/templates/gallery';
import { TemplateThumbnail } from '@/features/templates/template-thumbnail';
import { TILE_ITEM } from './templates-section';

/** Six looks across six kinds of form, each leading to its template's page. */
const ROW_TEMPLATE_SLUGS = [
  'event-registration',
  'customer-satisfaction-survey',
  'party-rsvp',
  'membership-application',
  'call-for-speakers',
  'restaurant-feedback',
] as const;

const ROW = ROW_TEMPLATE_SLUGS.flatMap((slug) => {
  const template = gallerySlug(slug);
  return template ? [template] : [];
});

function TemplateTile({ template }: { template: GalleryTemplate }) {
  return (
    <Link
      to={`/templates/${template.slug}`}
      className="group flex flex-col gap-3 rounded-xl border bg-card p-2 transition-colors duration-150 ease-standard hover:border-border-strong"
    >
      {/* Drawn a third larger and scaled to fit: a sixth of the row is narrower than the
          gallery's cards, and the thumbnail's text is sized for those. */}
      <span className="relative block aspect-[4/3] w-full overflow-hidden rounded-lg border">
        <span className="absolute top-0 left-0 block w-[133.333%] origin-top-left scale-75">
          <TemplateThumbnail template={template} className="rounded-none" />
        </span>
      </span>
      <span className="flex flex-col px-1 pb-1">
        <span className="truncate text-14 font-medium">{template.name}</span>
        <span className="truncate text-12 text-muted-foreground">
          {template.category ? TEMPLATE_CATEGORY_LABELS[template.category] : template.lookName}
        </span>
      </span>
    </Link>
  );
}

/** The row itself, loaded when the section nears the screen (the gallery builds every form). */
export function TemplatesRowTiles() {
  return (
    <>
      {ROW.map((template) => (
        <li key={template.slug} className={TILE_ITEM}>
          <TemplateTile template={template} />
        </li>
      ))}
    </>
  );
}
