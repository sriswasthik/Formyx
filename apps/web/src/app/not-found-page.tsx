import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router';
import { Logo } from '@/components/brand/logo';
import { buttonVariants } from '@/components/ui/button-variants';

export function NotFoundPage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <Link to="/" className="mb-12 rounded-md p-1" aria-label="Formyx home">
        <Logo decorative />
      </Link>
      <p className="text-13 font-medium text-muted-foreground tabular-nums">404</p>
      <h1 className="mt-2 text-24 font-semibold tracking-tight">Page not found</h1>
      <p className="mt-2 max-w-sm text-14 text-muted-foreground">
        The page you are looking for does not exist or has been moved.
      </p>
      {/* A plain link, not Button: this page is in every first download (see button-variants). */}
      <Link to="/" className={`${buttonVariants({ variant: 'secondary' })} mt-6`}>
        <ArrowLeft aria-hidden />
        Back to home
      </Link>
    </div>
  );
}
