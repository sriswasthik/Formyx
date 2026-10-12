import { qrCodeColors, type FormDetail } from '@formyx/shared';
import { ArrowLeft } from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { ActionTooltip } from '@/components/action-tooltip';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useMediaQuery } from '@/lib/use-media-query';
import { FormNav, INLINE_FORM_NAV_QUERY, type FormSection } from './form-nav';
import { FormStatusBadge } from './form-status-badge';
import { ShareDialog } from './share/share-dialog';

/**
 * The top bar of a form's full-screen pages (Settings, Integrations): back to the forms, the
 * form's title and status, anything the page adds (a save status), the form's sections and
 * Share.
 */
export function FormTopBar({
  form,
  current,
  children,
}: {
  form: FormDetail;
  current: FormSection;
  /** Shown before the sections, such as a save status. */
  children?: ReactNode;
}) {
  const [shareOpen, setShareOpen] = useState(false);
  const shareButton = useRef<HTMLButtonElement>(null);
  const inlineNav = useMediaQuery(INLINE_FORM_NAV_QUERY);
  const published = form.publishedSchema !== null;

  return (
    <>
      <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b bg-background px-2 sm:px-3">
        <ActionTooltip label="All forms">
          <Button asChild variant="ghost" size="icon-sm">
            <Link to="/app/forms" aria-label="Back to all forms">
              <ArrowLeft aria-hidden />
            </Link>
          </Button>
        </ActionTooltip>
        <Separator orientation="vertical" className="h-5" />
        <div className="flex min-w-0 flex-1 items-center gap-3 pl-1">
          <h1 className="truncate text-14 font-semibold tracking-tight">{form.title}</h1>
          <FormStatusBadge status={form.status} className="hidden sm:inline-flex" />
        </div>
        {children && (
          <>
            {children}
            <Separator orientation="vertical" className="mx-1 hidden h-5 sm:block" />
          </>
        )}
        <FormNav
          formId={form.id}
          current={current}
          canEdit
          published={published}
          shareRef={shareButton}
          onShare={() => {
            setShareOpen(true);
          }}
        />
      </header>
      {published && (
        <ShareDialog
          open={shareOpen}
          onOpenChange={setShareOpen}
          slug={form.slug}
          closed={form.status === 'CLOSED'}
          justPublished={false}
          qrColors={qrCodeColors((form.publishedTheme ?? form.theme).colors)}
          {...(inlineNav && { returnFocusTo: shareButton })}
        />
      )}
    </>
  );
}
