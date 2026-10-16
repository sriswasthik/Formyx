import { DATA_EXPORT_DAYS, type DataExport } from '@formyx/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { toast } from 'sonner';
import { ErrorState } from '@/components/error-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { buttonVariants } from '@/components/ui/button-variants';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useSession } from '@/features/auth/session-context';
import { formatBillingDate } from '@/features/billing/billing-format';
import { changeErrorMessage } from '@/lib/api';
import {
  dataExportDownloadUrl,
  listDataExports,
  privacyKeys,
  requestDataExport,
} from './privacy-api';

/** While an export is being made, look again this often. */
const PENDING_POLL_MS = 4000;

const STATUS: Record<DataExport['status'], { label: string; tone: 'neutral' | 'danger' }> = {
  PENDING: { label: 'Being prepared', tone: 'neutral' },
  READY: { label: 'Ready', tone: 'neutral' },
  FAILED: { label: 'Failed', tone: 'danger' },
  EXPIRED: { label: 'Expired', tone: 'neutral' },
};

function formatSize(bytes: number | null): string {
  if (bytes === null) return '';
  if (bytes < 1024 * 1024) return `${String(Math.max(1, Math.round(bytes / 1024)))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Someone's copy of their data: ask for it, then download it for a week. */
export function DataExportCard() {
  const { user } = useSession();
  const queryClient = useQueryClient();
  const exports = useQuery({
    queryKey: privacyKeys.exports,
    queryFn: listDataExports,
    refetchInterval: (query) =>
      query.state.data?.some((item) => item.status === 'PENDING') ? PENDING_POLL_MS : false,
  });
  const request = useMutation({
    mutationFn: requestDataExport,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: privacyKeys.exports });
      toast.success('We’re preparing your data', {
        description: `We’ll email ${user.email} when it’s ready.`,
      });
    },
    onError: (error) => {
      toast.error('Could not ask for your data', { description: changeErrorMessage(error) });
    },
  });

  if (user.isDemo) return null;
  const pending = exports.data?.some((item) => item.status === 'PENDING') ?? false;

  return (
    <Card id="your-data" className="scroll-mt-24">
      <CardHeader>
        <CardTitle>Your data</CardTitle>
        <CardDescription>
          A copy of your account, the workspaces you own, and their forms and responses, as a ZIP of
          JSON and CSV files. We email you when it’s ready, and it can be downloaded here for{' '}
          {DATA_EXPORT_DAYS} days.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Button
          variant="secondary"
          className="self-start"
          disabled={request.isPending || pending}
          onClick={() => {
            request.mutate();
          }}
        >
          {pending ? 'Preparing your data…' : 'Request my data'}
        </Button>
        {exports.isPending ? (
          <div aria-busy="true" aria-label="Loading your exports" className="flex flex-col gap-2">
            <Skeleton className="h-12 rounded-lg" />
          </div>
        ) : exports.isError ? (
          <ErrorState
            title="Could not load your exports"
            action={
              <Button
                variant="secondary"
                onClick={() => {
                  void exports.refetch();
                }}
              >
                Try again
              </Button>
            }
          />
        ) : exports.data.length > 0 ? (
          <ul className="flex flex-col divide-y rounded-lg border">
            {exports.data.map((item) => {
              const status = STATUS[item.status];
              return (
                <li
                  key={item.id}
                  className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-14 font-medium">
                      Requested {formatBillingDate(item.createdAt)}
                    </span>
                    <span className="text-13 text-muted-foreground tabular-nums">
                      {item.status === 'READY'
                        ? `${formatSize(item.bytes)} · available until ${formatBillingDate(item.expiresAt)}`
                        : item.status === 'FAILED'
                          ? 'Something went wrong. Ask for it again.'
                          : item.status === 'EXPIRED'
                            ? 'No longer kept. Ask for a new copy.'
                            : 'This takes a minute or two.'}
                    </span>
                  </div>
                  {item.status === 'READY' ? (
                    <a
                      href={dataExportDownloadUrl(item.id)}
                      download
                      className={buttonVariants({ variant: 'secondary', size: 'sm' })}
                    >
                      <Download aria-hidden />
                      Download
                    </a>
                  ) : (
                    <Badge variant={status.tone}>{status.label}</Badge>
                  )}
                </li>
              );
            })}
          </ul>
        ) : null}
      </CardContent>
    </Card>
  );
}
