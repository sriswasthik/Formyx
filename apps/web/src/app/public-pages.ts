import { galleryTemplates, TEMPLATE_CATEGORY_LABELS } from '@formyx/shared';

/*
 * The public pages search engines and link previews should know about. At build time,
 * build/static-pages.ts gives each its own copy of index.html, with this title, description
 * and structured data already in the <head> (crawlers read it without running the app), and
 * lists them all in sitemap.xml. Plain data only: this module is loaded by the build, in Node.
 */

export interface PublicPage {
  /** Where it lives, e.g. `/templates/wedding-rsvp`. */
  path: string;
  /** The document title, as the app sets it (see `formatDocumentTitle`). */
  title: string;
  description: string;
  /** schema.org structured data, written as JSON-LD. */
  structuredData?: Record<string, unknown>;
}

const titled = (title: string) => `${title} · Formyx`;

export function publicPages(): PublicPage[] {
  const templates = galleryTemplates();
  return [
    {
      path: '/pricing',
      title: titled('Pricing'),
      description:
        'Formyx pricing in rupees: start free, or go Pro or Business for more responses, custom domains, premium design and team features.',
    },
    {
      path: '/templates',
      title: titled('Form templates'),
      description: `${templates.length} free form templates for events, feedback, hiring, education, orders and quizzes. Preview each one, then make it yours.`,
    },
    ...templates.map((template) => ({
      path: `/templates/${template.slug}`,
      title: titled(`${template.name} template`),
      description: template.seoDescription,
      structuredData: {
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        name: `${template.name} template`,
        description: template.seoDescription,
        ...(template.category && {
          about: TEMPLATE_CATEGORY_LABELS[template.category],
        }),
        isPartOf: { '@type': 'WebSite', name: 'Formyx' },
      },
    })),
    {
      path: '/changelog',
      title: titled('Changelog'),
      description: 'What’s new in Formyx: every release, with the features and fixes it brought.',
    },
  ];
}
