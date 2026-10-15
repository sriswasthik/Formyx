import { Link } from 'react-router';
import { Logo } from '@/components/brand/logo';
import { FEATURE_PAGE_LINKS } from '@/features/marketing/feature-links';
import { CONTAINER } from '@/features/marketing/layout';
import { ThemeSwitch } from '@/features/theme/theme-switch';
import { cn } from '@/lib/utils';

const linkClass =
  'rounded-sm text-muted-foreground transition-colors duration-150 ease-standard hover:text-foreground';

interface FooterLink {
  label: string;
  /** The router scrolls to `#features` once the home page has drawn it, from any page. */
  to: string;
}

const FOOTER_COLUMNS: { title: string; links: FooterLink[] }[] = [
  {
    title: 'Product',
    links: [
      { label: 'Features', to: '/#features' },
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
];

/** On one line at the very bottom: every page links them (payment providers ask for it). */
const LEGAL_LINKS: FooterLink[] = [
  { label: 'Terms', to: '/terms' },
  { label: 'Privacy', to: '/privacy' },
  { label: 'Refund policy', to: '/refunds' },
  { label: 'Shipping policy', to: '/shipping' },
];

/**
 * The marketing pages' footer: the brand on the left and two link columns on the right, then
 * one quiet line with the copyright, the legal pages and the theme switch.
 */
export function SiteFooter() {
  return (
    <footer className="border-t">
      <div className={cn(CONTAINER, 'pt-12 pb-8 md:pt-16')}>
        <div className="grid gap-10 md:grid-cols-[minmax(0,1fr)_auto] md:gap-16">
          <div className="flex max-w-xs flex-col items-start gap-4">
            <Link to="/" aria-label="Formyx home" className="rounded-md">
              <Logo decorative />
            </Link>
            <p className="text-14 text-muted-foreground">
              The form builder for forms people actually enjoy filling in.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-8 sm:gap-16 lg:gap-24">
            {FOOTER_COLUMNS.map((column) => (
              <nav key={column.title} aria-label={column.title}>
                <p className="text-13 font-medium">{column.title}</p>
                <ul className="mt-4 flex flex-col gap-2.5 text-14">
                  {column.links.map((link) => (
                    <li key={link.to}>
                      <Link to={link.to} className={linkClass}>
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>
        </div>

        <div className="mt-12 flex flex-col items-start gap-5 border-t pt-6 text-13 text-muted-foreground md:mt-16 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
            <p className="tabular-nums">© {new Date().getFullYear()} Formyx</p>
            <nav aria-label="Legal">
              <ul className="flex flex-wrap gap-x-5 gap-y-2">
                {LEGAL_LINKS.map((link) => (
                  <li key={link.to}>
                    <Link to={link.to} className={linkClass}>
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
          <ThemeSwitch />
        </div>
      </div>
    </footer>
  );
}
