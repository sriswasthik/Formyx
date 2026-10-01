import type { Webhook } from '@formyx/shared';
import { ChevronDown, Send, Trash2 } from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';
import { useId, useState } from 'react';
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
import { Button } from '@/components/ui/button';
import { changeErrorMessage } from '@/lib/api';
import { DURATION, EASE_STANDARD } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { deliveryOutcome } from './delivery-format';
import { DeliveryBadge, DeliveryLog } from './delivery-log';
import { SecretReveal } from './secret-reveal';
import { useRemoveWebhook, useSendTestEvent } from './use-webhooks';

interface WebhookCardProps {
  formId: string;
  webhook: Webhook;
  /** Set right after the webhook is added: its secret, shown this once. */
  secret: string | null;
  onSecretSaved: () => void;
}

/** One webhook: where it goes, how its last delivery went, its log and its actions. */
export function WebhookCard({ formId, webhook, secret, onSecretSaved }: WebhookCardProps) {
  const [logOpen, setLogOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const sendTest = useSendTestEvent(formId);
  const remove = useRemoveWebhook(formId);
  const logId = useId();

  return (
    <li className="flex flex-col gap-3 rounded-xl border p-4">
      <div className="flex flex-col gap-1.5">
        <p className="font-mono text-13 break-all">{webhook.url}</p>
        <div>
          <DeliveryBadge delivery={webhook.lastDelivery} />
        </div>
      </div>

      {secret && <SecretReveal secret={secret} onDone={onSecretSaved} />}

      <div className="flex flex-wrap gap-1">
        <Button
          variant="secondary"
          size="sm"
          disabled={sendTest.isPending}
          onClick={() => {
            sendTest.mutate(webhook.id, {
              onSuccess: (delivery) => {
                if (delivery.succeeded) {
                  toast.success(`Test event delivered (${deliveryOutcome(delivery)})`);
                } else {
                  toast.error('The test event failed', { description: deliveryOutcome(delivery) });
                }
              },
              onError: (error) => {
                toast.error('Could not send the test event', {
                  description: changeErrorMessage(error),
                });
              },
            });
          }}
        >
          <Send aria-hidden />
          {sendTest.isPending ? 'Sending…' : 'Send test event'}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          aria-expanded={logOpen}
          aria-controls={logId}
          onClick={() => {
            setLogOpen((open) => !open);
          }}
        >
          <ChevronDown
            aria-hidden
            className={cn(
              'transition-transform duration-150 ease-standard motion-reduce:transition-none',
              logOpen && 'rotate-180',
            )}
          />
          Delivery log
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto"
          aria-label={`Remove the webhook to ${webhook.url}`}
          onClick={() => {
            setConfirmOpen(true);
          }}
        >
          <Trash2 aria-hidden />
          Remove
        </Button>
      </div>

      <AnimatePresence initial={false}>
        {logOpen && (
          <m.div
            id={logId}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: DURATION.base, ease: EASE_STANDARD }}
            className="overflow-hidden border-t"
          >
            <DeliveryLog formId={formId} webhookId={webhook.id} />
          </m.div>
        )}
      </AnimatePresence>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this webhook?</AlertDialogTitle>
            <AlertDialogDescription className="break-all">
              New responses stop going to {webhook.url}. Its delivery log is deleted too.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                // Awaited: once removed, this card is gone before per-call callbacks run.
                remove.mutateAsync(webhook.id).then(
                  () => {
                    toast.success('Webhook removed');
                  },
                  (error: unknown) => {
                    toast.error('Could not remove the webhook', {
                      description: changeErrorMessage(error),
                    });
                  },
                );
              }}
            >
              Remove webhook
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  );
}
