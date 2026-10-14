import { Menu, X } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { Logo } from '@/components/brand/logo';
import { Button } from '@/components/ui/button';
import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { CONTAINER } from '@/features/marketing/layout';
import { cn } from '@/lib/utils';
import { useScrolled } from './use-scrolled';

interface NavLink {
  label: string;
  /** The router scrolls to `#features` once the home page has drawn it, from any page. */
  to: string;
}

const NAV_LINKS: readonly NavLink[] = [
  { label: 'Features', to: '/#features' },
  { label: 'Templates', to: '/templates' },
  { label: 'Pricing', to: '/pricing' },
  { label: 'Changelog', to: '/changelog' },
];

function NavItem({
  link,
  className,
  onClick,
}: {
  link: NavLink;
  className: string;
  onClick?: () => void;
}) {
  return (
    <Link to={link.to} className={className} onClick={onClick}>
      {link.label}
    </Link>
  );
}

const desktopLink =
  'rounded-md px-3 py-1.5 text-14 text-muted-foreground transition-colors duration-150 ease-standard hover:bg-hover hover:text-foreground active:bg-pressed';

/** The links and account buttons, in a full-width sheet from the top, on phones. */
function MobileMenu() {
  const [open, setOpen] = useState(false);
  const close = () => {
    setOpen(false);
  };
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu">
          <Menu aria-hidden />
        </Button>
      </SheetTrigger>
      <SheetContent
        side="top"
        showCloseButton={false}
        aria-describedby={undefined}
        className="gap-0 pb-6"
      >
        <div className={cn(CONTAINER, 'flex h-16 items-center justify-between')}>
          <SheetTitle asChild>
            <span>
              <Logo decorative />
              <span className="sr-only">Menu</span>
            </span>
          </SheetTitle>
          <SheetClose asChild>
            <Button variant="ghost" size="icon" aria-label="Close menu">
              <X aria-hidden />
            </Button>
          </SheetClose>
        </div>
        <nav aria-label="Main" className={cn(CONTAINER, 'flex flex-col')}>
          {NAV_LINKS.map((link) => (
            <NavItem
              key={link.to}
              link={link}
              onClick={close}
              className="-mx-3 rounded-md px-3 py-3 text-16 transition-colors duration-150 ease-standard hover:bg-hover active:bg-pressed"
            />
          ))}
        </nav>
        <div className={cn(CONTAINER, 'mt-4 grid grid-cols-2 gap-3')}>
          <Button asChild variant="secondary" size="lg">
            <Link to="/login" onClick={close}>
              Log in
            </Link>
          </Button>
          <Button asChild size="lg">
            <Link to="/signup" onClick={close}>
              Get started
            </Link>
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/**
 * The marketing pages' header: sticky, transparent at the top of the page, with a background
 * and a bottom border once the page has scrolled.
 */
export function SiteHeader() {
  const scrolled = useScrolled();
  return (
    <header
      data-scrolled={scrolled || undefined}
      className={cn(
        'sticky top-0 z-40 border-b transition-colors duration-150 ease-standard',
        scrolled ? 'border-border bg-background' : 'border-transparent bg-transparent',
      )}
    >
      <div className={cn(CONTAINER, 'flex h-16 items-center justify-between gap-4')}>
        <div className="flex items-center gap-6">
          <Link to="/" className="-m-1 rounded-md p-1" aria-label="Formyx home">
            <Logo decorative />
          </Link>
          <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
            {NAV_LINKS.map((link) => (
              <NavItem key={link.to} link={link} className={desktopLink} />
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
            <Link to="/login">Log in</Link>
          </Button>
          <Button asChild size="sm">
            <Link to="/signup">Get started</Link>
          </Button>
          <MobileMenu />
        </div>
      </div>
    </header>
  );
}
