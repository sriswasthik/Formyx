import {
  FEEDBACK_KIND_LABELS,
  FEEDBACK_KINDS,
  FEEDBACK_MAX_LENGTH,
  feedbackInputSchema,
  type FeedbackKind,
} from '@formyx/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useLocation } from 'react-router';
import { toast } from 'sonner';
import type { z } from 'zod';
import { FormField } from '@/components/form-field';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { changeErrorMessage } from '@/lib/api';
import { sendFeedback } from './feedback-api';

const formSchema = feedbackInputSchema.pick({ kind: true, message: true });
type FormValues = z.input<typeof formSchema>;

const PLACEHOLDERS: Record<FeedbackKind, string> = {
  idea: 'What would make Formyx better for you?',
  problem: 'What happened, and what did you expect?',
  other: 'Tell us anything.',
};

function FeedbackForm({ onDone }: { onDone: () => void }) {
  const { pathname } = useLocation();
  const {
    control,
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { kind: 'idea', message: '' },
  });
  const send = useMutation({ mutationFn: sendFeedback });
  const kind = useWatch({ control, name: 'kind' });
  const length = useWatch({ control, name: 'message' }).length;

  return (
    <form
      noValidate
      onSubmit={(event) =>
        void handleSubmit((values) => {
          send.mutate(
            { ...values, page: pathname },
            {
              onSuccess: () => {
                toast.success('Thanks for the feedback', {
                  description: 'The team reads every message.',
                });
                onDone();
              },
              onError: (error) => {
                toast.error('Could not send your feedback', {
                  description: changeErrorMessage(error),
                });
              },
            },
          );
        })(event)
      }
      className="flex flex-col gap-5"
    >
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-14 font-medium">What is it about?</legend>
        <Controller
          control={control}
          name="kind"
          render={({ field }) => (
            <RadioGroup
              value={field.value}
              onValueChange={field.onChange}
              className="grid gap-2 sm:grid-cols-3"
            >
              {FEEDBACK_KINDS.map((option) => (
                <Label
                  key={option}
                  htmlFor={`feedback-kind-${option}`}
                  className="flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2.5 text-14 transition-colors duration-150 ease-standard hover:border-border-strong has-data-[state=checked]:border-accent has-data-[state=checked]:bg-accent-subtle"
                >
                  <RadioGroupItem id={`feedback-kind-${option}`} value={option} />
                  {FEEDBACK_KIND_LABELS[option]}
                </Label>
              ))}
            </RadioGroup>
          )}
        />
      </fieldset>
      <FormField
        id="feedback-message"
        label="Your message"
        error={errors.message?.message}
        hint={`${String(length)} / ${String(FEEDBACK_MAX_LENGTH)}`}
      >
        <Textarea
          rows={5}
          maxLength={FEEDBACK_MAX_LENGTH}
          placeholder={PLACEHOLDERS[kind]}
          {...register('message')}
        />
      </FormField>
      <DialogFooter>
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={send.isPending}>
          {send.isPending ? 'Sending…' : 'Send feedback'}
        </Button>
      </DialogFooter>
    </form>
  );
}

/** Feedback for the team, from anywhere in the app. */
export function FeedbackDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send feedback</DialogTitle>
          <DialogDescription>
            Formyx is in beta. Ideas and problems go straight to the people building it.
          </DialogDescription>
        </DialogHeader>
        {/* A fresh form each time the dialog opens. */}
        {open && (
          <FeedbackForm
            onDone={() => {
              onOpenChange(false);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
