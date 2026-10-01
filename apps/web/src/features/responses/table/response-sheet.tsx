import type { Field, SubmissionRecord } from '@formyx/shared';
import { CircleAlert, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiRequestError } from '@/lib/api';
import { formatDateTime, formatRelativeTime } from '@/lib/relative-time';
import { formatDuration } from '../format';
import { useResponse } from '../use-responses';
import { AnswerDetail } from './answer-value';

interface ResponseSheetProps {
  formId: string;
  fields: Field[];
  /** The open response, or `null` when the sheet is closed. */
  responseId: string | null;
  onClose: () => void;
  /** Editors can delete; leave out for viewers. */
  onDelete?: (id: string) => void;
}

function Details({ response }: { response: SubmissionRecord }) {
  const { completionTimeMs, metadata } = response;
  const rows = [
    { label: 'Submitted', value: formatDateTime(response.createdAt) },
    ...(completionTimeMs === null
      ? []
      : [{ label: 'Time to complete', value: formatDuration(completionTimeMs) }]),
    ...(metadata.referrer ? [{ label: 'Came from', value: metadata.referrer }] : []),
    ...(metadata.userAgent ? [{ label: 'Browser', value: metadata.userAgent }] : []),
    { label: 'Response ID', value: response.id },
  ];

  return (
    <section aria-labelledby="response-details" className="flex flex-col gap-3">
      <h3 id="response-details" className="text-13 font-semibold tracking-tight">
        Details
      </h3>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-13">
        {rows.map((row) => (
          <div key={row.label} className="contents">
            <dt className="text-muted-foreground">{row.label}</dt>
            <dd className="break-words tabular-nums">{row.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function SheetBody({
  formId,
  fields,
  responseId,
  open,
}: {
  formId: string;
  fields: Field[];
  responseId: string;
  open: boolean;
}) {
  const query = useResponse(formId, responseId, open);

  if (query.isPending) {
    return (
      <div role="status" aria-label="Loading the response" className="flex flex-col gap-5">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="flex flex-col gap-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-5 w-full" />
          </div>
        ))}
      </div>
    );
  }

  if (query.isError) {
    const gone = query.error instanceof ApiRequestError && query.error.status === 404;
    return (
      <div role="alert" className="flex items-start gap-3 rounded-lg border p-4 text-14">
        <CircleAlert aria-hidden className="mt-0.5 shrink-0 text-danger" />
        <div className="flex flex-col gap-1">
          <p className="font-medium">
            {gone ? 'This response no longer exists' : 'Could not load this response'}
          </p>
          <p className="text-muted-foreground">
            {gone ? 'Someone may have deleted it.' : 'Check your connection and try again.'}
          </p>
          {!gone && (
            <Button
              variant="secondary"
              size="sm"
              className="mt-2 w-fit"
              onClick={() => void query.refetch()}
            >
              Try again
            </Button>
          )}
        </div>
      </div>
    );
  }

  const response = query.data;
  return (
    <div className="flex flex-col gap-8">
      <dl className="flex flex-col gap-5">
        {fields.map((field, index) => (
          <div key={field.id} className="flex flex-col gap-1.5">
            <dt className="text-13 font-medium text-muted-foreground">
              <span className="mr-1.5 tabular-nums">{index + 1}.</span>
              {field.label.trim() || 'Untitled question'}
            </dt>
            <dd>
              <AnswerDetail field={field} value={response.answers[field.id]} />
            </dd>
          </div>
        ))}
      </dl>
      <Details response={response} />
    </div>
  );
}

/** One response in full, beside the table. */
export function ResponseSheet({
  formId,
  fields,
  responseId,
  onClose,
  onDelete,
}: ResponseSheetProps) {
  // Keep showing the last response while the sheet slides away.
  const [shownId, setShownId] = useState(responseId);
  if (responseId !== null && responseId !== shownId) setShownId(responseId);
  const open = responseId !== null;
  // Closed, the sheet only shows what it has while it slides away: nothing is fetched again.
  const query = useResponse(formId, shownId, open);
  const createdAt = query.data?.createdAt;

  return (
    <Sheet
      open={open}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent side="right" className="w-full max-w-full overflow-y-auto sm:w-[32rem]">
        <SheetHeader className="border-b">
          <SheetTitle>Response</SheetTitle>
          <SheetDescription>
            {createdAt ? (
              <>
                Submitted <time dateTime={createdAt}>{formatRelativeTime(createdAt)}</time>
              </>
            ) : (
              'Loading…'
            )}
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 p-5">
          {shownId && (
            <SheetBody formId={formId} fields={fields} responseId={shownId} open={open} />
          )}
        </div>
        {onDelete && query.data && (
          <SheetFooter className="border-t">
            <Button
              variant="secondary"
              className="w-full text-danger-text sm:w-fit"
              onClick={() => {
                if (shownId) onDelete(shownId);
              }}
            >
              <Trash2 aria-hidden />
              Delete response
            </Button>
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  );
}
