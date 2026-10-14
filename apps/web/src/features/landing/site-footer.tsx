import { Link } from 'react-router';
import { LogoMark } from '@/components/logo';
import { FEATURE_PAGE_LINKS } from '@/features/marketing/feature-links';

const linkClass =
  'rounded-sm text-muted-foreground transition-colors duration-150 ease-standard hover:text-foreground';

interface FooterLink {
  label: string;
  to: string;
}

const COLUMNS: { title: string; links: FooterLink[] }[] = [
  {
    title: 'Product',
    links: [
      ...FEATURE_PAGE_LINKS.map((link) => ({ label: link.label, to: link.path })),
      { label: 'Templates', to: '/templates' },
      { label: 'Pricing', to: '/pricing' },
      { label: 'Changelog', to: '/changelog' },
    ],
  },
  {
    title: 'Support',
    links: [
      { label: 'Help centre', to: '/help' },
      { label: 'Contact us', to: '/contact' },
      { label: 'Log in', to: '/login' },
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
      <div className="mx-auto grid max-w-6xl gap-10 px-6 py-12 text-13 md:grid-cols-[1fr_auto] md:px-10">
        <div className="flex items-start gap-2 text-muted-foreground">
          <LogoMark className="size-5" />
          <span className="tabular-nums">© {new Date().getFullYear()} Formyx</span>
        </div>
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 md:gap-16">
          {COLUMNS.map((column) => (
            <nav key={column.title} aria-label={column.title}>
              <p className="text-13 font-medium">{column.title}</p>
              <ul className="mt-3 flex flex-col gap-2">
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
    </footer>
  );
}
