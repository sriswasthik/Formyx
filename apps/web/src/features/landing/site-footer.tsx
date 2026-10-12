import { Link } from 'react-router';
import { LogoMark } from '@/components/logo';

const linkClass =
  'rounded-sm text-muted-foreground transition-colors duration-150 ease-standard hover:text-foreground';

export function SiteFooter() {
  return (
    <footer className="border-t">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-8 text-13 sm:flex-row sm:items-center sm:justify-between md:px-10">
        <div className="flex items-center gap-2 text-muted-foreground">
          <LogoMark className="size-5" />
          <span className="tabular-nums">© {new Date().getFullYear()} Formyx</span>
        </div>
        <nav aria-label="Footer" className="flex gap-6">
          {/* A plain link: the browser scrolls to the section, from any page. */}
          <a href="/#features" className={linkClass}>
            Features
          </a>
          <Link to="/pricing" className={linkClass}>
            Pricing
          </Link>
          <Link to="/changelog" className={linkClass}>
            Changelog
          </Link>
          <Link to="/login" className={linkClass}>
            Log in
          </Link>
        </nav>
      </div>
    </footer>
  );
}
