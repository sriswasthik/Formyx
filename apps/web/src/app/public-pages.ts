import { galleryTemplates, TEMPLATE_CATEGORY_LABELS } from '@formyx/shared';
import { FEATURE_PAGE_LINKS } from '../features/marketing/feature-links';

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
    ...FEATURE_PAGE_LINKS.map((link) => ({
      path: link.path,
      title: titled(link.seoTitle),
      description: link.seoDescription,
    })),
    {
      path: '/contact',
      title: titled('Contact us'),
      description: 'How to reach the people behind Formyx: email, when we reply, and our address.',
    },
    {
      path: '/terms',
      title: titled('Terms of service'),
      description:
        'The rules for using Formyx, in plain words: accounts, your content, plans and payments.',
    },
    {
      path: '/privacy',
      title: titled('Privacy policy'),
      description:
        'What Formyx collects, why, who sees it, and how to ask for your data to be deleted.',
    },
    {
      path: '/refunds',
      title: titled('Refund and cancellation policy'),
      description: 'How cancelling a Formyx plan works, and when we refund a payment.',
    },
    {
      path: '/shipping',
      title: titled('Shipping and delivery policy'),
      description:
        'How a Formyx plan you buy is delivered: online, as soon as the payment is confirmed.',
    },
    {
      path: '/changelog',
      title: titled('Changelog'),
      description: 'What’s new in Formyx: every release, with the features and fixes it brought.',
    },
  ];
}
