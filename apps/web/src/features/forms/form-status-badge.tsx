import { FORM_STATUS_LABELS, type FormStatus } from '@formyx/shared';
import { Badge, type BadgeProps } from '@/components/ui/badge';

const VARIANTS: Record<FormStatus, BadgeProps['variant']> = {
  DRAFT: 'neutral',
  PUBLISHED: 'success',
  CLOSED: 'warning',
  UNDER_REVIEW: 'accent',
  SUSPENDED: 'danger',
};

export function FormStatusBadge({ status, className }: { status: FormStatus; className?: string }) {
  return (
    <Badge variant={VARIANTS[status]} className={className}>
      {FORM_STATUS_LABELS[status]}
    </Badge>
  );
}
