import { FORM_STATUS_LABELS, type FormStatus } from '@formyx/shared';
import { cn } from '@/lib/utils';

const DOT: Record<FormStatus, string> = {
  PUBLISHED: 'bg-success',
  DRAFT: 'bg-control',
  CLOSED: 'bg-warning',
  UNDER_REVIEW: 'bg-accent',
  SUSPENDED: 'bg-danger',
};

/** A form's status as a small dot and its name. */
export function FormStatus({ status, className }: { status: FormStatus; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <span aria-hidden className={cn('size-1.5 shrink-0 rounded-full', DOT[status])} />
      {FORM_STATUS_LABELS[status]}
    </span>
  );
}
