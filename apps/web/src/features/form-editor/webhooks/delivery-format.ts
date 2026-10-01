import type { WebhookDelivery } from '@formyx/shared';

/** "200", "500", or why there was no response ("Connection refused"). */
export function deliveryOutcome(delivery: WebhookDelivery): string {
  if (delivery.statusCode !== null) return String(delivery.statusCode);
  return delivery.error ?? 'No response';
}

/** "Response", "Test", with the retry it was: "Response, retry 2". */
export function deliveryLabel(delivery: WebhookDelivery): string {
  const event = delivery.event === 'test' ? 'Test' : 'Response';
  return delivery.attempt > 1 ? `${event}, retry ${delivery.attempt - 1}` : event;
}

/** "120 ms", "1.4 s"; empty when it never got going. */
export function formatDuration(durationMs: number | null): string {
  if (durationMs === null) return '';
  return durationMs < 1000 ? `${durationMs} ms` : `${(durationMs / 1000).toFixed(1)} s`;
}
