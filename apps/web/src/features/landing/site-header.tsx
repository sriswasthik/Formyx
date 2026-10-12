import { Link } from 'react-router';
import { Logo } from '@/components/logo';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/features/theme/theme-toggle';

export function SiteHeader() {
  return (
    <header className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-6 md:px-10">
      <Link to="/" className="-m-1 rounded-md p-1" aria-label="Formyx home">
        <Logo />
      </Link>
      <nav aria-label="Account" className="flex items-center gap-1 sm:gap-2">
        <ThemeToggle />
        <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
          <Link to="/pricing">Pricing</Link>
        </Button>
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
