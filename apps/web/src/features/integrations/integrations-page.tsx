import {
  CHAT_SERVICE_NAMES,
  CHAT_SERVICES,
  CONNECT_ERROR_PARAM,
  CONNECT_RESULT_PARAM,
  INTEGRATION_KINDS,
  INTEGRATION_NAMES,
  integrationKindSchema,
  type FormDetail,
  type IntegrationsOverview,
  type WebhookStatus,
} from '@formyx/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleCheck, CircleX, MessageSquare, RotateCw, Webhook } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { usePageTitle } from '@/app/page-title';
import { ErrorState } from '@/components/error-state';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useSession } from '@/features/auth/session-context';
import { ProBadge } from '@/features/entitlements/pro-badge';
import { useEntitlements } from '@/features/entitlements/use-entitlements';
import { WebhooksSheet } from '@/features/form-editor/webhooks/webhooks-sheet';
import { SaveQueueProvider } from '@/features/form-settings/save-queue';
import { SaveStatus } from '@/features/form-settings/save-status';
import { ChatWebhook } from '@/features/form-settings/sections/notifications-section';
import { EditorFormPage, FORM_PAGE_PADDING } from '@/features/forms/editor-form-page';
import { FormTopBar } from '@/features/forms/form-top-bar';
import { ApiRequestError } from '@/lib/api';
import { formatRelativeTime } from '@/lib/relative-time';
import { useNow } from '@/lib/use-now';
import { FailedJobs } from './failed-jobs';
import { IntegrationCard } from './integration-card';
import { getIntegrations, integrationKeys } from './integrations-api';

const CONNECT_ERRORS: Record<string, string> = {
  denied: 'Access wasn’t granted, so nothing was connected.',
  expired: 'That took too long, or started in another session. Try connecting again.',
  not_allowed: 'Only editors can connect it, on a plan that includes it.',
  failed: 'The service didn’t finish connecting. Try again in a moment.',
};

/** Says how connecting went, once, when the service sends people back here. */
function useConnectResult(formId: string) {
  const [params, setParams] = useSearchParams();
  const queryClient = useQueryClient();
  useEffect(() => {
    const connected = integrationKindSchema.safeParse(params.get(CONNECT_RESULT_PARAM));
    const error = params.get(CONNECT_ERROR_PARAM);
    if (!connected.success && !error) return;
    if (connected.success) {
      toast.success(`${INTEGRATION_NAMES[connected.data]} connected`, {
        description: 'Copying the responses so far. New ones follow as they arrive.',
      });
      void queryClient.invalidateQueries({ queryKey: integrationKeys.overview(formId) });
    } else if (error) {
      toast.error('Not connected', {
        description: CONNECT_ERRORS[error] ?? CONNECT_ERRORS.failed,
      });
    }
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete(CONNECT_RESULT_PARAM);
        next.delete(CONNECT_ERROR_PARAM);
        return next;
      },
      { replace: true },
    );
  }, [params, setParams, formId, queryClient]);
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3" aria-label={title}>
      <div className="flex flex-col gap-0.5">
        <h2 className="text-16 font-semibold tracking-tight">{title}</h2>
        <p className="text-13 text-muted-foreground">{description}</p>
      </div>
      {children}
    </section>
  );
}

function WebhookRow({ webhook }: { webhook: WebhookStatus }) {
  const now = useNow(30_000);
  const last = webhook.lastDelivery;
  return (
    <li className="flex min-w-0 flex-col gap-1 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <span className="truncate font-mono text-13" title={webhook.url}>
        {webhook.url}
      </span>
      <span className="flex shrink-0 items-center gap-1.5 text-13 text-muted-foreground tabular-nums">
        {last ? (
          <>
            {last.succeeded ? (
              <CircleCheck aria-hidden className="text-success" />
            ) : (
              <CircleX aria-hidden className="text-danger" />
            )}
            {last.succeeded
              ? 'Delivered'
              : `Failed${last.statusCode ? ` (${last.statusCode})` : ''}`}{' '}
            {formatRelativeTime(last.createdAt, now)}
          </>
        ) : (
          'Nothing sent yet'
        )}
      </span>
    </li>
  );
}

function PageBody({ form, overview }: { form: FormDetail; overview: IntegrationsOverview }) {
  const queryClient = useQueryClient();
  const { hasFeature } = useEntitlements();
  const { user } = useSession();
  const [webhooksOpen, setWebhooksOpen] = useState(false);
  const refresh = () =>
    void queryClient.invalidateQueries({ queryKey: integrationKeys.overview(form.id) });
  const canConnect = !user.isDemo;

  return (
    <div className="flex flex-col gap-10">
      <Section
        title="Spreadsheets and databases"
        description="Every response copied where your team already works, as it arrives."
      >
        <div className="grid gap-4 lg:grid-cols-2">
          {INTEGRATION_KINDS.map((kind) => (
            <IntegrationCard
              key={kind}
              formId={form.id}
              kind={kind}
              integration={overview.integrations.find((item) => item.kind === kind) ?? null}
              available={overview.available[kind]}
              included={hasFeature(kind)}
              canConnect={canConnect}
            />
          ))}
        </div>
      </Section>

      <Section
        title="Chat"
        description="A message in a Slack or Discord channel for each new or changed response, with its answers and a link to it."
      >
        <div className="grid gap-4 lg:grid-cols-2">
          {CHAT_SERVICES.map((service) => (
            <article
              key={service}
              aria-labelledby={`chat-${service}`}
              className="flex flex-col gap-3 rounded-xl border bg-card p-5 sm:p-6"
            >
              <div className="flex items-center gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-surface">
                  <MessageSquare aria-hidden />
                </span>
                <h3
                  id={`chat-${service}`}
                  className="flex items-center gap-2 text-14 font-semibold"
                >
                  {CHAT_SERVICE_NAMES[service]}
                  {!hasFeature('chat_notifications') && <ProBadge />}
                </h3>
              </div>
              <p className="text-13 text-muted-foreground">
                {service === 'slack'
                  ? 'Make an incoming webhook in Slack for the channel, then paste its URL.'
                  : "In the channel's settings, make a webhook under Integrations, then paste its URL."}
              </p>
              <ChatWebhook
                formId={form.id}
                service={service}
                hint={overview.chat[service]?.hint ?? null}
                onSaved={refresh}
              />
            </article>
          ))}
        </div>
      </Section>

      <Section
        title="Webhooks"
        description="A signed request to your own endpoint for each new response, retried for a while if it fails."
      >
        <div className="flex flex-col gap-4 rounded-xl border bg-card p-5 sm:p-6">
          {overview.webhooks.length > 0 ? (
            <ul className="divide-y" aria-label="Webhooks">
              {overview.webhooks.map((webhook) => (
                <WebhookRow key={webhook.id} webhook={webhook} />
              ))}
            </ul>
          ) : (
            <p className="text-13 text-muted-foreground">No webhooks yet.</p>
          )}
          <div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setWebhooksOpen(true);
              }}
            >
              <Webhook aria-hidden />
              {overview.webhooks.length > 0 ? 'Manage webhooks' : 'Add a webhook'}
            </Button>
          </div>
        </div>
        <WebhooksSheet
          formId={form.id}
          open={webhooksOpen}
          onOpenChange={(open) => {
            setWebhooksOpen(open);
            if (!open) refresh();
          }}
        />
      </Section>

      <Section
        title="Failed jobs"
        description="Emails, deliveries and copies that kept failing. They were tried several times, waiting longer each time."
      >
        <FailedJobs formId={form.id} failures={overview.failures} />
      </Section>
    </div>
  );
}

function IntegrationsWorkspace({ form }: { form: FormDetail }) {
  usePageTitle(`Integrations · ${form.title}`);
  useConnectResult(form.id);
  const query = useQuery({
    queryKey: integrationKeys.overview(form.id),
    queryFn: () => getIntegrations(form.id),
    // While something is copying, follow along.
    refetchInterval: (current) =>
      current.state.data?.integrations.some((item) => item.status === 'connecting') ? 3000 : false,
  });

  let body: React.ReactNode;
  if (query.isPending) {
    body = (
      <div role="status" aria-label="Loading integrations" className="flex flex-col gap-4">
        <Skeleton className="h-6 w-56" />
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-44 rounded-xl" />
          <Skeleton className="h-44 rounded-xl" />
        </div>
        <Skeleton className="h-32 rounded-xl" />
      </div>
    );
  } else if (query.isError) {
    body = (
      <ErrorState
        title="Could not load the integrations"
        description={
          query.error instanceof ApiRequestError && query.error.status === 403
            ? query.error.message
            : 'Check your connection and try again.'
        }
        action={
          <Button
            variant="secondary"
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
          >
            <RotateCw aria-hidden />
            Try again
          </Button>
        }
      />
    );
  } else {
    body = <PageBody form={form} overview={query.data} />;
  }

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <FormTopBar form={form} current="integrations">
        <SaveStatus />
      </FormTopBar>
      <main id="main-content" className={`flex-1 py-6 lg:py-8 ${FORM_PAGE_PADDING}`}>
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
          <div className="flex flex-col gap-1">
            <h2 className="text-20 font-semibold tracking-tight">Integrations</h2>
            <p className="text-14 text-muted-foreground">
              Where this form’s responses go besides Formyx, and how each is doing.
            </p>
          </div>
          {body}
        </div>
      </main>
    </div>
  );
}

const describeSaveError = (error: unknown) =>
  error instanceof ApiRequestError ? error.message : 'Something went wrong';

/** A form's integrations: Sheets, Notion, Slack, Discord, webhooks and failed jobs. Editors only. */
export function IntegrationsPage() {
  return (
    <EditorFormPage deniedTitle="Integrations are for editors">
      {(form) => (
        <SaveQueueProvider describeError={describeSaveError}>
          <IntegrationsWorkspace form={form} />
        </SaveQueueProvider>
      )}
    </EditorFormPage>
  );
}
