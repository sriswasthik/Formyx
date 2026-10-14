import { formatFileSize, type Usage } from '@formyx/shared';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { formatBillingDate } from './billing-format';

const count = new Intl.NumberFormat('en-IN');

function Meter({
  label,
  used,
  limit,
  format = (value) => count.format(value),
}: {
  label: string;
  used: number;
  limit: number | null;
  format?: (value: number) => string;
}) {
  const share = limit ? Math.min(used / limit, 1) : 0;
  const id = `meter-${label.toLowerCase().replaceAll(' ', '-')}`;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-4 text-14">
        <span id={id} className="font-medium">
          {label}
        </span>
        <span className="text-13 text-muted-foreground tabular-nums">
          {limit === null ? format(used) : `${format(used)} of ${format(limit)}`}
        </span>
      </div>
      {limit !== null && (
        <div
          role="meter"
          aria-labelledby={id}
          aria-valuemin={0}
          aria-valuemax={limit}
          aria-valuenow={Math.min(used, limit)}
          aria-valuetext={`${format(used)} of ${format(limit)}`}
          className="h-1.5 overflow-hidden rounded-full bg-muted"
        >
          <div
            className={cn(
              'h-full rounded-full transition-[width] duration-200 ease-standard motion-reduce:transition-none',
              share >= 1 ? 'bg-danger' : share >= 0.8 ? 'bg-warning' : 'bg-foreground',
            )}
            style={{ width: `${String(share * 100)}%` }}
          />
        </div>
      )}
    </div>
  );
}

/** What the workspace has used this period, against what its plan allows. */
export function UsageCard({ usage }: { usage: Usage }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Usage</CardTitle>
        <CardDescription>
          Responses count from {formatBillingDate(usage.periodStart)} and start again on{' '}
          {formatBillingDate(usage.periodEnd)}. Every response is saved, whatever the count.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <Meter label="Responses" used={usage.responses.used} limit={usage.responses.limit} />
        <Meter
          label="File storage"
          used={usage.storageBytes.used}
          limit={usage.storageBytes.limit}
          format={formatFileSize}
        />
      </CardContent>
    </Card>
  );
}
