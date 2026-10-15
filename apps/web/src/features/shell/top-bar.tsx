import { Menu } from 'lucide-react';
import { Fragment } from 'react';
import { Link } from 'react-router';
import { useBreadcrumbs } from '@/app/page-title';
import { Logo } from '@/components/brand/logo';
import { PAGE_CONTAINER } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { SheetTrigger } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

/**
 * The bar above the page: breadcrumbs (Forms / Event registration) and, on phones, the button
 * that opens the sidebar and the logo. On wider screens it shows only below a top-level page,
 * where the page's own heading would otherwise say all it says.
 */
export function TopBar() {
  const crumbs = useBreadcrumbs();
  const nested = crumbs.length > 1;

  return (
    <header
      className={cn(
        'sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b bg-background',
        PAGE_CONTAINER,
        !nested && 'md:hidden',
      )}
    >
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className="-ml-2 md:hidden"
          aria-label="Open navigation"
        >
          <Menu aria-hidden />
        </Button>
      </SheetTrigger>
      {/* At the top level the page's heading names it; on phones the bar shows the logo. */}
      {!nested && (
        <Link to="/app/forms" className="-m-1 rounded-md p-1" aria-label="Formyx, go to forms">
          <Logo variant="full" decorative />
        </Link>
      )}
      {nested && (
        <nav aria-label="Breadcrumb" className="min-w-0">
          <ol className="flex min-w-0 items-center gap-1.5 text-14">
            {crumbs.map((crumb, index) => {
              const last = index === crumbs.length - 1;
              return (
                <Fragment key={`${String(index)}:${crumb.to}`}>
                  {index > 0 && (
                    <li aria-hidden className="text-subtle-foreground">
                      /
                    </li>
                  )}
                  <li className={cn('min-w-0', !last && 'shrink-0')}>
                    {last ? (
                      <span aria-current="page" className="block truncate font-medium">
                        {crumb.label}
                      </span>
                    ) : (
                      <Link
                        to={crumb.to}
                        className="rounded-sm text-muted-foreground transition-colors duration-150 ease-standard hover:text-foreground"
                      >
                        {crumb.label}
                      </Link>
                    )}
                  </li>
                </Fragment>
              );
            })}
          </ol>
        </nav>
      )}
    </header>
  );
}
