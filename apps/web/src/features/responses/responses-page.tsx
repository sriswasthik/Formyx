import { hasRole, type FormDetail } from '@formyx/shared';
import { ArrowLeft, FileQuestion, Lock, PencilRuler, RotateCw, Send } from 'lucide-react';
import { useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { usePageTitle } from '@/app/page-title';
import { ActionTooltip } from '@/components/action-tooltip';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useSession } from '@/features/auth/session-context';
import { FormNav, INLINE_FORM_NAV_QUERY } from '@/features/forms/form-nav';
import { formOpenPath } from '@/features/forms/form-paths';
import { FormStatusBadge } from '@/features/forms/form-status-badge';
import { ShareDialog } from '@/features/forms/share/share-dialog';
import { useFormDetail } from '@/features/forms/use-forms';
import { ApiRequestError } from '@/lib/api';
import { useMediaQuery } from '@/lib/use-media-query';
import { useArrivals } from './arrivals-store';
import { formatCount } from './format';
import { NotifyToggle } from './notify-toggle';
import { LiveIndicator } from './realtime/live-indicator';
import { useLiveResponses } from './realtime/use-live-responses';
import { SummaryTab } from './summary/summary-tab';
import { ResponsesTab } from './table/responses-tab';

type ResponsesView = 'summary' | 'responses';

const PAGE_PADDING = 'px-6 md:px-8 lg:px-10';

function BackToForms() {
  return (
    <ActionTooltip label="All forms">
      <Button asChild variant="ghost" size="icon-sm">
        <Link to="/app/forms" aria-label="Back to all forms">
          <ArrowLeft aria-hidden />
        </Link>
      </Button>
    </ActionTooltip>
  );
}

function PageSkeleton() {
  return (
    <div role="status" aria-label="Loading responses" className="flex min-h-dvh flex-col">
      <div className="flex h-14 items-center gap-3 border-b px-3">
        <Skeleton className="size-8" />
        <Skeleton className="h-5 w-48" />
        <Skeleton className="ml-auto h-8 w-56" />
      </div>
      <div className={`mx-auto flex w-full max-w-6xl flex-col gap-6 py-8 ${PAGE_PADDING}`}>
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-80 rounded-xl" />
      </div>
    </div>
  );
}

function PageProblem({
  icon,
  title,
  description,
  action,
}: {
  icon: typeof Lock;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-6">
      <EmptyState
        className="w-full max-w-md border-none"
        icon={icon}
        title={title}
        description={description}
        action={
          action ?? (
            <Button asChild variant="secondary">
              <Link to="/app/forms">Back to forms</Link>
            </Button>
          )
        }
      />
    </main>
  );
}

/** Says so, politely, when responses arrive while the page is open. */
function ArrivalAnnouncer() {
  const count = useArrivals((state) => state.count);
  const [baseline] = useState(count);
  const arrived = count - baseline;
  return (
    <p role="status" className="sr-only">
      {arrived === 0
        ? ''
        : arrived === 1
          ? 'A new response arrived.'
          : `${formatCount(arrived)} new responses arrived.`}
    </p>
  );
}

function ResponsesWorkspace({ form, canEdit }: { form: FormDetail; canEdit: boolean }) {
  const [params, setParams] = useSearchParams();
  const view: ResponsesView = params.get('tab') === 'responses' ? 'responses' : 'summary';
  const status = useLiveResponses(form);
  const [shareOpen, setShareOpen] = useState(false);
  const shareButton = useRef<HTMLButtonElement>(null);
  const inlineNav = useMediaQuery(INLINE_FORM_NAV_QUERY);
  const published = form.publishedSchema !== null;
  usePageTitle(`Responses · ${form.title}`);

  const share = () => {
    setShareOpen(true);
  };

  const showView = (next: ResponsesView) => {
    setParams(
      (current) => {
        const updated = new URLSearchParams(current);
        if (next === 'responses') updated.set('tab', 'responses');
        else updated.delete('tab');
        return updated;
      },
      { replace: true },
    );
  };

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b bg-background px-2 sm:px-3">
        <BackToForms />
        <Separator orientation="vertical" className="h-5" />
        <div className="flex min-w-0 flex-1 items-center gap-3 pl-1">
          <h1 className="truncate text-14 font-semibold tracking-tight">{form.title}</h1>
          <FormStatusBadge status={form.status} className="hidden sm:inline-flex" />
        </div>
        <LiveIndicator status={status} className="hidden sm:inline-flex" />
        <Separator orientation="vertical" className="mx-1 hidden h-5 sm:block" />
        <FormNav
          formId={form.id}
          current="responses"
          canEdit={canEdit}
          published={published}
          shareRef={shareButton}
          onShare={share}
        />
      </header>

      <main id="main-content" className={`flex-1 py-6 lg:py-8 ${PAGE_PADDING}`}>
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
          {published ? (
            <Tabs
              value={view}
              onValueChange={(value) => {
                showView(value === 'responses' ? 'responses' : 'summary');
              }}
            >
              <div className="flex flex-col gap-3 border-b sm:flex-row sm:items-end sm:justify-between">
                <TabsList variant="underline" aria-label="Responses" className="w-auto border-b-0">
                  <TabsTrigger value="summary">Summary</TabsTrigger>
                  <TabsTrigger value="responses">
                    Responses
                    <span className="text-13 font-normal text-muted-foreground tabular-nums">
                      {formatCount(form.responseCount)}
                    </span>
                  </TabsTrigger>
                </TabsList>
                <div className="flex items-center justify-between gap-4 pb-3">
                  <LiveIndicator status={status} className="sm:hidden" />
                  <NotifyToggle formId={form.id} />
                </div>
              </div>
              <TabsContent value="summary" className="mt-6">
                <SummaryTab form={form} onShare={share} />
              </TabsContent>
              <TabsContent value="responses" className="mt-6">
                <ResponsesTab form={form} canEdit={canEdit} onShare={share} />
              </TabsContent>
            </Tabs>
          ) : (
            <EmptyState
              icon={Send}
              title="This form isn't published yet"
              description="Publish it from the editor to start collecting responses."
              action={
                canEdit ? (
                  <Button asChild>
                    <Link to={formOpenPath(form.id, true)}>
                      <PencilRuler aria-hidden />
                      Open the editor
                    </Link>
                  </Button>
                ) : undefined
              }
            />
          )}
        </div>
      </main>

      <ArrivalAnnouncer />
      {published && (
        <ShareDialog
          open={shareOpen}
          onOpenChange={setShareOpen}
          slug={form.slug}
          closed={form.status === 'CLOSED'}
          justPublished={false}
          {...(inlineNav && { returnFocusTo: shareButton })}
        />
      )}
    </div>
  );
}

/** A form's responses: a summary with analytics, and every response in a table. Live. */
export function ResponsesPage() {
  const { formId = '' } = useParams();
  const { workspaces } = useSession();
  const formQuery = useFormDetail(formId);

  if (formQuery.isPending) return <PageSkeleton />;

  if (formQuery.isError) {
    const status = formQuery.error instanceof ApiRequestError ? formQuery.error.status : 0;
    if (status === 404) {
      return (
        <PageProblem
          icon={FileQuestion}
          title="Form not found"
          description="It may have been deleted, or the link is wrong."
        />
      );
    }
    if (status === 403) {
      return (
        <PageProblem
          icon={Lock}
          title="You don't have access to this form"
          description="It belongs to a workspace you are not a member of."
        />
      );
    }
    return (
      <main className="flex min-h-dvh items-center justify-center px-6">
        <ErrorState
          className="w-full max-w-md border-none"
          title="Could not load this form"
          description="Check your connection and try again."
          action={
            <Button disabled={formQuery.isFetching} onClick={() => void formQuery.refetch()}>
              <RotateCw aria-hidden />
              Try again
            </Button>
          }
        />
      </main>
    );
  }

  const form = formQuery.data;
  const role = workspaces.find((workspace) => workspace.id === form.workspaceId)?.role;
  return (
    <ResponsesWorkspace
      key={form.id}
      form={form}
      canEdit={role ? hasRole(role, 'EDITOR') : false}
    />
  );
}
