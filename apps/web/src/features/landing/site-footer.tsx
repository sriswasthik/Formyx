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
 * The marketing pages' footer: a dark panel, the same in either theme (its `dark` class gives
 * everything inside the dark tokens, so links, the focus ring and the theme switch keep their
 * contrast). The brand and the links sit close together, then one line with the copyright, the
 * legal pages and the theme switch.
 */
export function SiteFooter() {
  return (
    <footer className="px-2 pb-2 sm:px-3 sm:pb-3">
      <div className="dark overflow-hidden rounded-xl border bg-surface text-foreground [color-scheme:dark]">
        <div className={cn(CONTAINER, 'pt-10 pb-6 md:pt-12')}>
          <div className="flex flex-col gap-8 md:flex-row md:justify-between md:gap-12">
            <div className="flex max-w-64 flex-col items-start gap-3">
              <Link to="/" aria-label="Formyx home" className="rounded-md">
                <Logo decorative />
              </Link>
              <p className="text-14 text-muted-foreground">
                The form builder for forms people actually enjoy filling in.
              </p>
            </div>
            <div className="flex flex-wrap gap-x-16 gap-y-8 lg:gap-x-24">
              {FOOTER_COLUMNS.map((column) => (
                <nav key={column.title} aria-label={column.title}>
                  <p className="text-13 font-medium">{column.title}</p>
                  {/* Product's six links in two short columns rather than one tall one. */}
                  <ul
                    className={cn(
                      'mt-3 grid gap-y-2 text-14',
                      column.links.length > 3 && 'grid-flow-col grid-rows-3 gap-x-10',
                    )}
                  >
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

          {/* One line on wider screens; on phones the copyright and the switch share a row,
              with the legal links under them. */}
          <div className="mt-10 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t pt-5 text-13 text-muted-foreground">
            <p className="tabular-nums">© {new Date().getFullYear()} Formyx</p>
            <nav
              aria-label="Legal"
              className="order-last w-full md:order-none md:mr-auto md:w-auto"
            >
              <ul className="flex flex-wrap gap-x-5 gap-y-1.5">
                {LEGAL_LINKS.map((link) => (
                  <li key={link.to}>
                    <Link to={link.to} className={linkClass}>
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
            <ThemeSwitch />
          </div>
        </div>
      </div>
    </footer>
  );
}
