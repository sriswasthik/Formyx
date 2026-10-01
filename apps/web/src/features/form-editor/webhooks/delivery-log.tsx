import type { WebhookDelivery } from '@formyx/shared';
import { CircleCheck, CircleX, History } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDateTime, formatRelativeTime } from '@/lib/relative-time';
import { useNow } from '@/lib/use-now';
import { cn } from '@/lib/utils';
import { deliveryLabel, deliveryOutcome, formatDuration } from './delivery-format';
import { useDeliveries } from './use-webhooks';

/** How the latest attempt went, in a word and a colour (with an icon, never colour alone). */
export function DeliveryBadge({ delivery }: { delivery: WebhookDelivery | null }) {
  if (!delivery) return <Badge variant="outline">No deliveries yet</Badge>;
  const Icon = delivery.succeeded ? CircleCheck : CircleX;
  return (
    <Badge variant={delivery.succeeded ? 'success' : 'danger'} className="max-w-full">
      <Icon aria-hidden />
      <span className="truncate">
        {delivery.succeeded ? 'Delivered' : 'Failed'} · {deliveryOutcome(delivery)}
      </span>
    </Badge>
  );
}

function Row({ delivery, now }: { delivery: WebhookDelivery; now: Date }) {
  const Icon = delivery.succeeded ? CircleCheck : CircleX;
  return (
    <li className="grid grid-cols-[1rem_1fr_auto] items-start gap-x-2.5 gap-y-0.5 py-2.5 text-13">
      <Icon
        aria-hidden
        className={cn('mt-0.5', delivery.succeeded ? 'text-success' : 'text-danger')}
      />
      <div className="min-w-0">
        <p className="font-medium">
          <span className="sr-only">{delivery.succeeded ? 'Delivered: ' : 'Failed: '}</span>
          <span className="tabular-nums">{deliveryOutcome(delivery)}</span>
        </p>
        <p className="text-muted-foreground">{deliveryLabel(delivery)}</p>
      </div>
      <div className="text-right text-muted-foreground tabular-nums">
        <p>
          <time dateTime={delivery.createdAt} title={formatDateTime(delivery.createdAt)}>
            {formatRelativeTime(delivery.createdAt, now)}
          </time>
        </p>
        <p>{formatDuration(delivery.durationMs)}</p>
      </div>
    </li>
  );
}

/** The latest attempts at one webhook, newest first. */
export function DeliveryLog({ formId, webhookId }: { formId: string; webhookId: string }) {
  const deliveries = useDeliveries(formId, webhookId);
  const now = useNow();

  if (deliveries.isPending) {
    return (
      <div aria-hidden className="flex flex-col gap-3 py-2.5">
        {[0, 1, 2].map((row) => (
          <Skeleton key={row} className="h-8 w-full" />
        ))}
      </div>
    );
  }
  if (deliveries.isError) {
    return (
      <div role="alert" className="flex items-center justify-between gap-3 py-2.5 text-13">
        <p className="text-danger-text">The delivery log could not be loaded.</p>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            void deliveries.refetch();
          }}
        >
          Try again
        </Button>
      </div>
    );
  }
  if (deliveries.data.length === 0) {
    return (
      <p className="flex items-center gap-2 py-2.5 text-13 text-muted-foreground">
        <History aria-hidden />
        No deliveries yet. Send a test event to try it.
      </p>
    );
  }
  return (
    <ul aria-label="Deliveries" className="divide-y">
      {deliveries.data.map((delivery) => (
        <Row key={delivery.id} delivery={delivery} now={now} />
      ))}
    </ul>
  );
}
