import { createDefaultTheme } from '@formyx/shared';
import type { LucideIcon } from 'lucide-react';
import type * as React from 'react';
import { Link } from 'react-router';
import { Logo } from '@/components/brand/logo';
import { ThemeRenderer } from '@/features/form-renderer/theme/theme-renderer';
import { isEmbedded } from '@/lib/embed';
import { cx } from '@/lib/cx';

/** Where the badge leads: home, marked as coming from the badge (and which form), for sign-ups. */
function badgeLink(slug?: string): string {
  const params = new URLSearchParams({ ref: 'badge' });
  if (slug) params.set('form', slug);
  return `/?${params.toString()}`;
}

const badgeClass =
  'inline-flex items-center gap-1.5 rounded-sm text-12 text-(--form-muted,var(--muted-foreground)) underline-offset-4 transition-colors duration-150 ease-standard hover:text-(--form-fg,var(--foreground)) hover:underline';

/** A quiet credit under every public page. Uses the form's colours when inside one. */
export function MadeWithFormyx({
  label = 'Made with Formyx',
  slug,
  newTab,
  badge = true,
  report,
  opensInNewTab,
}: {
  label?: string | undefined;
  /** The form it sits under. */
  slug?: string | undefined;
  /**
   * In an embedded form: opens Formyx in a new tab, rather than inside the host's frame,
   * and says so in these words.
   */
  newTab?: string | undefined;
  /** Shows the credit; plans may hide it. The report link stays either way. */
  badge?: boolean;
  /** "Report this form", in the form's language: a link to report `slug` to Formyx. */
  report?: string | undefined;
  /** "(opens in a new tab)", for the report link, which always does. */
  opensInNewTab?: string | undefined;
}) {
  const content = (
    <>
      <Logo variant="mark" size={16} decorative />
      {label}
    </>
  );
  const credit = !badge ? null : newTab === undefined ? (
    <Link to={badgeLink(slug)} className={badgeClass}>
      {content}
    </Link>
  ) : (
    <a
      href={`${window.location.origin}${badgeLink(slug)}`}
      target="_blank"
      rel="noopener"
      aria-label={`${label} ${newTab}`}
      className={badgeClass}
    >
      {content}
    </a>
  );
  const reportLink =
    report && slug ? (
      // A new tab, so whoever is filling the form in keeps their place.
      <a
        href={`${window.location.origin}/report/${encodeURIComponent(slug)}`}
        target="_blank"
        rel="noopener"
        aria-label={opensInNewTab ? `${report} ${opensInNewTab}` : undefined}
        className={badgeClass}
      >
        {report}
      </a>
    ) : null;
  if (!credit && !reportLink) return null;
  return (
    <footer className="flex flex-col items-center gap-2 px-6 pb-8 text-center">
      {credit}
      {reportLink}
    </footer>
  );
}

interface PublicFormMessageProps {
  icon: LucideIcon;
  /** Small line above the heading, such as the form's title. */
  eyebrow?: string | undefined;
  title: string;
  /** Plain words, or the form's own (rich text) for why it is closed. */
  description: React.ReactNode;
  action?: React.ReactNode;
  /** The credit in the form's language. */
  madeWith?: string | undefined;
}

/** A full page explaining why there is no form to fill in. */
export function PublicFormMessage({
  icon: Icon,
  eyebrow,
  title,
  description,
  action,
  madeWith,
}: PublicFormMessageProps) {
  const embedded = isEmbedded();
  return (
    <div className={cx('flex flex-col', !embedded && 'min-h-dvh bg-background')}>
      <main
        className={cx(
          'flex flex-1 flex-col items-center justify-center px-6 text-center',
          embedded ? 'py-10' : 'py-16',
        )}
      >
        <span className="flex size-10 items-center justify-center rounded-full border bg-surface text-muted-foreground">
          <Icon aria-hidden />
        </span>
        {eyebrow && (
          <p className="mt-5 max-w-sm truncate text-13 text-muted-foreground">{eyebrow}</p>
        )}
        <h1 className={cx(eyebrow ? 'mt-1' : 'mt-5', 'text-24 font-semibold tracking-tight')}>
          {title}
        </h1>
        <div className="mt-2 max-w-sm text-14 text-muted-foreground">{description}</div>
        {action && <div className="mt-6">{action}</div>}
      </main>
      {!embedded && <MadeWithFormyx label={madeWith} />}
    </div>
  );
}

function Bar({ className }: { className: string }) {
  return (
    <div
      className={cx(
        'rounded-(--form-radius) bg-(--form-hover) motion-safe:animate-pulse',
        className,
      )}
    />
  );
}

/** Stands in for the form while it loads, on the default form background. */
export function PublicFormSkeleton() {
  return (
    <ThemeRenderer
      theme={createDefaultTheme()}
      variant={isEmbedded() ? 'embed' : 'page'}
      className={isEmbedded() ? 'overflow-clip rounded-(--form-radius)' : undefined}
    >
      <div role="status" aria-label="Loading the form" className="flex flex-col gap-8">
        <Bar className="h-9 w-2/3" />
        {[0, 1, 2].map((item) => (
          <div key={item} className="flex flex-col gap-3">
            <Bar className="h-5 w-1/2" />
            <Bar className="h-11 w-full" />
          </div>
        ))}
        <Bar className="h-11 w-28" />
      </div>
    </ThemeRenderer>
  );
}
