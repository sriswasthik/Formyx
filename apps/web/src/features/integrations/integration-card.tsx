import {
  INTEGRATION_NAMES,
  type IntegrationKind,
  type IntegrationStatus,
  type IntegrationView,
} from '@formyx/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CircleAlert,
  CircleCheck,
  CirclePause,
  Database,
  ExternalLink,
  FileSpreadsheet,
  LoaderCircle,
  Plug,
  RefreshCw,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ProBadge } from '@/features/entitlements/pro-badge';
import { changeErrorMessage } from '@/lib/api';
import { formatDateTime, formatRelativeTime } from '@/lib/relative-time';
import { useNow } from '@/lib/use-now';
import {
  connectIntegration,
  disconnectIntegration,
  integrationKeys,
  resyncIntegration,
  setIntegrationPaused,
} from './integrations-api';

const KIND_INFO: Record<
  IntegrationKind,
  { icon: LucideIcon; pitch: string; target: string; stays: string }
> = {
  google_sheets: {
    icon: FileSpreadsheet,
    pitch:
      'A spreadsheet in your Google Drive with a row per response, kept up to date as responses arrive and change. New questions become new columns.',
    target: 'Open sheet',
    stays: 'The sheet stays in your Google Drive, with the responses copied so far.',
  },
  notion: {
    icon: Database,
    pitch:
      'A Notion database with a page per response, its answers as typed properties. When connecting, share the page it should go in.',
    target: 'Open database',
    stays: 'The database stays in Notion, with the responses copied so far.',
  },
};

const STATUS: Record<
  IntegrationStatus,
  {
    label: string;
    variant: 'success' | 'warning' | 'danger' | 'neutral' | 'accent';
    icon: LucideIcon;
  }
> = {
  connecting: { label: 'Copying responses', variant: 'accent', icon: LoaderCircle },
  active: { label: 'Up to date', variant: 'success', icon: CircleCheck },
  paused: { label: 'Paused', variant: 'neutral', icon: CirclePause },
  error: { label: 'Not syncing', variant: 'danger', icon: CircleAlert },
  needs_reconnect: { label: 'Needs reconnecting', variant: 'warning', icon: CircleAlert },
};

export function StatusBadge({ status }: { status: IntegrationStatus }) {
  const { label, variant, icon: Icon } = STATUS[status];
  return (
    <Badge variant={variant}>
      <Icon
        aria-hidden
        className={status === 'connecting' ? 'motion-safe:animate-spin' : undefined}
      />
      {label}
    </Badge>
  );
}

/** Starts connecting: off to Google or Notion, back to this page afterwards. */
function useConnect(formId: string, kind: IntegrationKind) {
  return useMutation({
    mutationFn: () => connectIntegration(formId, kind),
    onSuccess: (authorizeUrl) => {
      window.location.assign(authorizeUrl);
    },
    onError: (error) => {
      toast.error(`Could not connect ${INTEGRATION_NAMES[kind]}`, {
        description: changeErrorMessage(error),
      });
    },
  });
}

interface IntegrationCardProps {
  formId: string;
  kind: IntegrationKind;
  integration: IntegrationView | null;
  /** The server has the service's sign-in set up. */
  available: boolean;
  /** The workspace's plan includes it. */
  included: boolean;
  canConnect: boolean;
}

export function IntegrationCard({
  formId,
  kind,
  integration,
  available,
  included,
  canConnect,
}: IntegrationCardProps) {
  const queryClient = useQueryClient();
  const now = useNow(30_000);
  const info = KIND_INFO[kind];
  const Icon = info.icon;
  const name = INTEGRATION_NAMES[kind];
  const connect = useConnect(formId, kind);
  const [confirm, setConfirm] = useState<'resync' | 'disconnect' | null>(null);

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: integrationKeys.overview(formId) });
  const action = useMutation({
    mutationFn: async (what: 'pause' | 'resume' | 'resync' | 'disconnect') => {
      if (!integration) return;
      if (what === 'resync') await resyncIntegration(formId, integration.id);
      else if (what === 'disconnect') await disconnectIntegration(formId, integration.id);
      else await setIntegrationPaused(formId, integration.id, what === 'pause');
    },
    onSuccess: (_result, what) => {
      void refresh();
      const message = {
        pause: `${name} paused`,
        resume: `${name} is catching up`,
        resync: `Copying every response to ${name} again`,
        disconnect: `${name} disconnected`,
      }[what];
      toast.success(message);
    },
    onError: (error) => {
      toast.error(`Could not change ${name}`, { description: changeErrorMessage(error) });
    },
  });

  return (
    <article
      aria-labelledby={`integration-${kind}`}
      className="flex flex-col gap-4 rounded-xl border bg-card p-5 sm:p-6"
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-surface">
            <Icon aria-hidden />
          </span>
          <div className="min-w-0">
            <h3
              id={`integration-${kind}`}
              className="flex items-center gap-2 text-14 font-semibold"
            >
              {name}
              {!included && <ProBadge />}
            </h3>
            {integration?.accountLabel && (
              <p className="truncate text-13 text-muted-foreground">
                As {integration.accountLabel}
                {integration.connectedBy && ` · connected by ${integration.connectedBy}`}
              </p>
            )}
          </div>
        </div>
        {integration && <StatusBadge status={integration.status} />}
      </header>

      {!integration ? (
        <>
          <p className="text-13 text-muted-foreground">{info.pitch}</p>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="secondary"
              size="sm"
              disabled={!available || !canConnect || connect.isPending}
              onClick={() => {
                connect.mutate();
              }}
            >
              <Plug aria-hidden />
              {connect.isPending ? 'Opening…' : `Connect ${name}`}
            </Button>
            {!available && (
              <p className="text-13 text-muted-foreground">Not set up on this server yet.</p>
            )}
          </div>
        </>
      ) : (
        <>
          <dl className="grid gap-x-6 gap-y-1 text-13 sm:grid-cols-[auto_1fr]">
            <dt className="text-muted-foreground">Responses go to</dt>
            <dd>
              {integration.target ? (
                <a
                  href={integration.target.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-accent underline-offset-4 hover:underline"
                >
                  {info.target}
                  <ExternalLink aria-hidden className="size-3.5" />
                  <span className="sr-only">(opens in a new tab)</span>
                </a>
              ) : (
                <span className="text-muted-foreground">Being made…</span>
              )}
            </dd>
            <dt className="text-muted-foreground">Last copied</dt>
            <dd className="tabular-nums">
              {integration.lastSyncedAt ? (
                <time
                  dateTime={integration.lastSyncedAt}
                  title={formatDateTime(integration.lastSyncedAt)}
                >
                  {formatRelativeTime(integration.lastSyncedAt, now)}
                </time>
              ) : (
                'Not yet'
              )}
            </dd>
          </dl>

          {integration.lastError &&
            (integration.status === 'error' || integration.status === 'needs_reconnect') && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/5 px-3 py-2.5 text-13 text-danger-text"
              >
                <CircleAlert aria-hidden className="mt-0.5 shrink-0" />
                <p className="min-w-0 break-words">
                  {integration.lastError}
                  {integration.lastErrorAt && (
                    <span className="text-muted-foreground">
                      {' '}
                      · {formatRelativeTime(integration.lastErrorAt, now)}
                    </span>
                  )}
                </p>
              </div>
            )}

          <div className="flex flex-wrap gap-2">
            {integration.status === 'needs_reconnect' ? (
              <Button
                size="sm"
                disabled={!canConnect || connect.isPending}
                onClick={() => {
                  connect.mutate();
                }}
              >
                <Plug aria-hidden />
                Reconnect
              </Button>
            ) : (
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={action.isPending}
                  onClick={() => {
                    action.mutate(integration.status === 'paused' ? 'resume' : 'pause');
                  }}
                >
                  {integration.status === 'paused' ? 'Resume' : 'Pause'}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={action.isPending || integration.status === 'paused'}
                  onClick={() => {
                    setConfirm('resync');
                  }}
                >
                  <RefreshCw aria-hidden />
                  Re-sync everything
                </Button>
              </>
            )}
            <Button
              variant="ghost"
              size="sm"
              disabled={action.isPending}
              onClick={() => {
                setConfirm('disconnect');
              }}
            >
              Disconnect
            </Button>
          </div>
        </>
      )}

      <AlertDialog
        open={confirm !== null}
        onOpenChange={(open) => {
          if (!open) setConfirm(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm === 'resync' ? `Copy every response again?` : `Disconnect ${name}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === 'resync'
                ? kind === 'google_sheets'
                  ? 'The rows below the header are replaced with every response, oldest first. Your own columns beside them stay.'
                  : 'A new database is made with every response, oldest first. The old one stays in Notion.'
                : `New responses stop going to ${name}. ${info.stays}`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant={confirm === 'disconnect' ? 'destructive' : 'primary'}
              onClick={() => {
                if (confirm) action.mutate(confirm);
              }}
            >
              {confirm === 'resync' ? 'Copy again' : 'Disconnect'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </article>
  );
}
