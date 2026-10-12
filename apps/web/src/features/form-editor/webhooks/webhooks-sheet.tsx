import {
  createWebhookInputSchema,
  MAX_WEBHOOKS_PER_FORM,
  WEBHOOK_SIGNATURE_HEADER,
} from '@formyx/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { Webhook as WebhookIcon } from 'lucide-react';
import { useRef, useState, type MutableRefObject } from 'react';
import { useForm } from 'react-hook-form';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { FormAlert } from '@/components/form-alert';
import { FormField } from '@/components/form-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { applyServerError } from '@/features/auth/server-errors';
import { useAddWebhook, useWebhooks } from './use-webhooks';
import { WebhookCard } from './webhook-card';

function AddWebhookForm({
  formId,
  full,
  urlRef,
  onAdded,
}: {
  formId: string;
  full: boolean;
  urlRef: MutableRefObject<HTMLInputElement | null>;
  onAdded: (webhookId: string, secret: string) => void;
}) {
  const add = useAddWebhook(formId);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm({ resolver: zodResolver(createWebhookInputSchema), defaultValues: { url: '' } });
  const { ref: registerRef, ...urlField } = register('url');

  return (
    <form
      noValidate
      onSubmit={(event) =>
        void handleSubmit(({ url }) => {
          setFormError(null);
          add.mutate(url, {
            onSuccess: ({ webhook, secret }) => {
              reset({ url: '' });
              onAdded(webhook.id, secret);
            },
            onError: (error) => {
              setFormError(applyServerError(error, ['url'], setError));
            },
          });
        })(event)
      }
      className="flex flex-col gap-3"
    >
      {formError && <FormAlert>{formError}</FormAlert>}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="min-w-0 flex-1">
          <FormField
            id="webhook-url"
            label="Endpoint URL"
            error={errors.url?.message}
            hint={full ? `A form can have up to ${MAX_WEBHOOKS_PER_FORM} webhooks.` : undefined}
          >
            <Input
              type="url"
              inputMode="url"
              autoComplete="off"
              placeholder="https://example.com/hooks/formyx"
              disabled={full}
              ref={(element) => {
                registerRef(element);
                urlRef.current = element;
              }}
              {...urlField}
            />
          </FormField>
        </div>
        <Button type="submit" className="sm:mt-6" disabled={full || add.isPending}>
          {add.isPending ? 'Adding…' : 'Add webhook'}
        </Button>
      </div>
    </form>
  );
}

function WebhooksBody({ formId }: { formId: string }) {
  const webhooks = useWebhooks(formId);
  // The secret of the webhook just added, until its owner says it is saved.
  const [revealed, setRevealed] = useState<{ webhookId: string; secret: string } | null>(null);
  const urlRef = useRef<HTMLInputElement | null>(null);

  let list;
  if (webhooks.isPending) {
    list = (
      <div aria-hidden className="flex flex-col gap-3">
        <Skeleton className="h-28 w-full rounded-xl" />
        <Skeleton className="h-28 w-full rounded-xl" />
      </div>
    );
  } else if (webhooks.isError) {
    list = (
      <ErrorState
        title="Webhooks could not be loaded"
        description="Check your connection and try again."
        action={
          <Button
            variant="secondary"
            onClick={() => {
              void webhooks.refetch();
            }}
          >
            Try again
          </Button>
        }
      />
    );
  } else if (webhooks.data.length === 0) {
    list = (
      <EmptyState
        icon={WebhookIcon}
        title="No webhooks yet"
        description="Add an endpoint above and each new response is sent to it."
        className="py-10"
        action={
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              urlRef.current?.focus();
            }}
          >
            Add a webhook
          </Button>
        }
      />
    );
  } else {
    list = (
      <ul aria-label="Webhooks" className="flex flex-col gap-3">
        {webhooks.data.map((webhook) => (
          <WebhookCard
            key={webhook.id}
            formId={formId}
            webhook={webhook}
            secret={revealed?.webhookId === webhook.id ? revealed.secret : null}
            onSecretSaved={() => {
              setRevealed(null);
            }}
          />
        ))}
      </ul>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <AddWebhookForm
        formId={formId}
        full={(webhooks.data?.length ?? 0) >= MAX_WEBHOOKS_PER_FORM}
        urlRef={urlRef}
        onAdded={(webhookId, secret) => {
          setRevealed({ webhookId, secret });
        }}
      />
      {list}
      <p className="text-13 text-muted-foreground">
        Each request carries an{' '}
        <code className="font-mono text-12">{WEBHOOK_SIGNATURE_HEADER}</code> header:{' '}
        <code className="font-mono text-12">sha256=</code> and the HMAC-SHA256 of the raw request
        body, keyed with the webhook’s secret. Compute the same and compare before trusting a
        request. A failed delivery is tried five more times, waiting about twice as long each time
        (30 seconds at first, up to about a quarter of an hour in all); one that still fails is
        listed under Failed jobs.
      </p>
    </div>
  );
}

interface WebhooksSheetProps {
  formId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Where editors add, test and remove a form's webhooks, and read their delivery logs. */
export function WebhooksSheet({ formId, open, onOpenChange }: WebhooksSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Webhooks</SheetTitle>
          <SheetDescription>
            Formyx sends a signed POST request to each endpoint whenever someone submits this form.
          </SheetDescription>
        </SheetHeader>
        {/* Only mounted while open: the new webhook's secret goes when the sheet closes. */}
        <div className="px-5 pb-5">
          <WebhooksBody formId={formId} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
