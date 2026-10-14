import { Link } from 'react-router';
import { Logo } from '@/components/brand/logo';
import { FEATURE_PAGE_LINKS } from '@/features/marketing/feature-links';
import { CONTAINER } from '@/features/marketing/layout';
import { ThemeToggle } from '@/features/theme/theme-toggle';
import { cn } from '@/lib/utils';

const linkClass =
  'rounded-sm text-muted-foreground transition-colors duration-150 ease-standard hover:text-foreground';

interface FooterLink {
  label: string;
  to: string;
  /** A plain link: the browser scrolls to the section, from any page. */
  anchor?: boolean;
}

const FOOTER_COLUMNS: { title: string; links: FooterLink[] }[] = [
  {
    title: 'Product',
    links: [
      { label: 'Features', to: '/#features', anchor: true },
      ...FEATURE_PAGE_LINKS.map((link) => ({ label: link.label, to: link.path })),
      { label: 'Templates', to: '/templates' },
      { label: 'Pricing', to: '/pricing' },
    ],
  },
  {
    title: 'Resources',
    links: [
      { label: 'Help centre', to: '/help' },
      { label: 'Changelog', to: '/changelog' },
      { label: 'Contact us', to: '/contact' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Terms of service', to: '/terms' },
      { label: 'Privacy policy', to: '/privacy' },
      { label: 'Refunds and cancellation', to: '/refunds' },
      { label: 'Shipping and delivery', to: '/shipping' },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-t">
      <div
        className={cn(
          CONTAINER,
          'grid gap-12 py-12 text-13 md:grid-cols-[minmax(0,1fr)_auto] md:py-16',
        )}
      >
        <div className="flex max-w-xs flex-col items-start gap-3">
          <Logo decorative />
          <p className="text-muted-foreground">
            The form builder for forms people actually enjoy filling in.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 md:gap-16">
          {FOOTER_COLUMNS.map((column) => (
            <nav key={column.title} aria-label={column.title}>
              <p className="font-medium">{column.title}</p>
              <ul className="mt-3 flex flex-col gap-2">
                {column.links.map((link) => (
                  <li key={link.to}>
                    {link.anchor ? (
                      <a href={link.to} className={linkClass}>
                        {link.label}
                      </a>
                    ) : (
                      <Link to={link.to} className={linkClass}>
                        {link.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
      </div>
      <div className={CONTAINER}>
        <div className="flex items-center justify-between gap-4 border-t py-6">
          <p className="text-13 text-muted-foreground tabular-nums">
            © {new Date().getFullYear()} Formyx
          </p>
          <ThemeToggle />
        </div>
      </div>
    </footer>
  );
}
