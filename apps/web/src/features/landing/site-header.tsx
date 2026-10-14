import { ChevronDown } from 'lucide-react';
import { Link } from 'react-router';
import { Logo } from '@/components/brand/logo';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { FEATURE_PAGE_LINKS } from '@/features/marketing/feature-links';
import { ThemeToggle } from '@/features/theme/theme-toggle';

/** The feature pages, from the header. */
function FeaturesMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="hidden md:inline-flex">
          Features
          <ChevronDown aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        {FEATURE_PAGE_LINKS.map((link) => (
          <DropdownMenuItem key={link.path} asChild>
            <Link to={link.path} className="flex flex-col items-start gap-0.5">
              <span className="text-14 font-medium">{link.label}</span>
              <span className="text-13 text-muted-foreground">{link.summary}</span>
            </Link>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          {/* A plain link: the browser scrolls to the section, from any page. */}
          <a href="/#features">All features</a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function SiteHeader() {
  return (
    <header className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-6 md:px-10">
      <div className="flex items-center gap-4 md:gap-6">
        <Link to="/" className="-m-1 rounded-md p-1" aria-label="Formyx home">
          <Logo decorative />
        </Link>
        <nav aria-label="Main" className="flex items-center gap-1">
          <FeaturesMenu />
          <Button asChild variant="ghost" size="sm" className="hidden md:inline-flex">
            <Link to="/templates">Templates</Link>
          </Button>
          <Button asChild variant="ghost" size="sm" className="hidden md:inline-flex">
            <Link to="/pricing">Pricing</Link>
          </Button>
        </nav>
      </div>
      <nav aria-label="Account" className="flex items-center gap-1 sm:gap-2">
        <ThemeToggle />
        <Button asChild variant="ghost" size="sm">
          <Link to="/login">Log in</Link>
        </Button>
        <Button asChild size="sm">
          <Link to="/signup">Get started</Link>
        </Button>
      </nav>
    </header>
  );
}
