import { Link, NavLink } from 'react-router';
import { Logo } from '@/components/brand/logo';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ApiStatus } from '@/features/system/api-status';
import { ThemeToggle } from '@/features/theme/theme-toggle';
import { cn } from '@/lib/utils';

const PAGES = [
  { to: '/styleguide', label: 'Components' },
  { to: '/styleguide/brand', label: 'Brand' },
];

/** The header of the styleguide's pages. */
export function StyleguideHeader() {
  return (
    <header className="sticky top-0 z-30 border-b bg-background">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-6 md:px-10">
        <Link to="/" className="-m-1 rounded-md p-1" aria-label="Formyx home">
          <Logo decorative />
        </Link>
        <Badge variant="outline" className="hidden sm:inline-flex">
          Dev
        </Badge>
        <nav aria-label="Styleguide" className="flex items-center gap-1 sm:ml-2">
          {PAGES.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              end
              className={({ isActive }) =>
                cn(
                  'rounded-md px-2 py-1 text-13 transition-colors duration-150 ease-standard hover:bg-hover',
                  isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
                )
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <div className="hidden sm:block">
            <ApiStatus />
          </div>
          <ThemeToggle />
          <Button asChild variant="secondary" size="sm" className="hidden sm:inline-flex">
            <Link to="/forms">Open app</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
