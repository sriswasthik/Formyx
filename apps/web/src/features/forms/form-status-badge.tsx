import { FORM_STATUS_LABELS, type FormStatus } from '@formyx/shared';
import { Badge, type BadgeProps } from '@/components/ui/badge';

const VARIANTS: Record<FormStatus, BadgeProps['variant']> = {
  DRAFT: 'neutral',
  PUBLISHED: 'success',
  CLOSED: 'warning',
};

export function FormStatusBadge({ status }: { status: FormStatus }) {
  return <Badge variant={VARIANTS[status]}>{FORM_STATUS_LABELS[status]}</Badge>;
}
