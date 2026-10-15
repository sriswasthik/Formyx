import {
  REPORT_DETAILS_MAX_LENGTH,
  REPORT_REASON_LABELS,
  REPORT_REASONS,
  reportReasonSchema,
  type ReportReason,
} from '@formyx/shared';
import { useMutation } from '@tanstack/react-query';
import { CircleCheck, Flag } from 'lucide-react';
import { useId, useState } from 'react';
import { useParams } from 'react-router';
import { useNoIndex } from '@/app/page-title';
import { z } from 'zod';
import { FormAlert } from '@/components/form-alert';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { SiteFooter } from '@/features/landing/site-footer';
import { SiteHeader } from '@/features/landing/site-header';
import { apiRequest, ApiRequestError, jsonRequest } from '@/lib/api';

/** "Report this form": linked from under every public form, opened in a new tab. */
export function ReportPage() {
  const { slug = '' } = useParams();
  const id = useId();
  useNoIndex(true);
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [missingReason, setMissingReason] = useState(false);
  const mutation = useMutation({
    mutationFn: (input: { reason: ReportReason; details: string }) =>
      apiRequest(
        `/public/forms/${encodeURIComponent(slug)}/report`,
        z.undefined(),
        jsonRequest('POST', { reason: input.reason, details: input.details || undefined }),
      ),
  });

  const problem =
    mutation.error instanceof ApiRequestError
      ? mutation.error.status === 404
        ? 'We couldn’t find that form. Check the link it came from.'
        : mutation.error.code === 'RATE_LIMITED'
          ? mutation.error.message
          : 'Your report could not be sent. Try again in a moment.'
      : mutation.error
        ? 'Your report could not be sent. Check your connection and try again.'
        : null;

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-xl flex-1 px-6 pt-12 pb-12 md:pt-20 md:pb-16">
        {mutation.isSuccess ? (
          <div role="status" className="flex flex-col items-start gap-3">
            <CircleCheck className="size-6 text-success" aria-hidden />
            <h1 className="text-24 font-semibold tracking-tight">Thanks for telling us</h1>
            <p className="text-14 text-muted-foreground">
              Someone at Formyx will look at this form. Your report is anonymous: the form’s creator
              never learns who sent it.
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 text-muted-foreground">
              <Flag aria-hidden />
              <span className="text-13">Report a form</span>
            </div>
            <h1 className="mt-2 text-24 font-semibold tracking-tight">What’s wrong with it?</h1>
            <p className="mt-2 text-14 text-muted-foreground">
              Formyx forms must never be used to trick people or ask for passwords and bank details.
              Reports are anonymous.
            </p>
            <form
              noValidate
              aria-label="Report this form"
              className="mt-8 flex flex-col gap-6"
              onSubmit={(event) => {
                event.preventDefault();
                const parsed = reportReasonSchema.safeParse(reason);
                if (!parsed.success) {
                  setMissingReason(true);
                  return;
                }
                mutation.mutate({ reason: parsed.data, details: details.trim() });
              }}
            >
              {problem && <FormAlert>{problem}</FormAlert>}
              <fieldset className="flex flex-col gap-3">
                <legend className="mb-3 text-14 font-medium">Reason</legend>
                <RadioGroup
                  value={reason ?? ''}
                  onValueChange={(value) => {
                    setReason(reportReasonSchema.parse(value));
                    setMissingReason(false);
                  }}
                  aria-describedby={missingReason ? `${id}-reason-error` : undefined}
                  aria-invalid={missingReason || undefined}
                  className="flex flex-col gap-3"
                >
                  {REPORT_REASONS.map((value) => (
                    <div key={value} className="flex items-center gap-3">
                      <RadioGroupItem value={value} id={`${id}-${value}`} />
                      <Label htmlFor={`${id}-${value}`} className="font-normal">
                        {REPORT_REASON_LABELS[value]}
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
                {missingReason && (
                  <p id={`${id}-reason-error`} className="text-13 text-danger-text">
                    Choose a reason
                  </p>
                )}
              </fieldset>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${id}-details`}>
                  Anything else? <span className="text-muted-foreground">(optional)</span>
                </Label>
                <Textarea
                  id={`${id}-details`}
                  rows={4}
                  maxLength={REPORT_DETAILS_MAX_LENGTH}
                  value={details}
                  onChange={(event) => {
                    setDetails(event.target.value);
                  }}
                  placeholder="What did it ask for, or say?"
                />
              </div>
              <div>
                <Button type="submit" disabled={mutation.isPending}>
                  {mutation.isPending ? 'Sending…' : 'Send report'}
                </Button>
              </div>
            </form>
          </>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
