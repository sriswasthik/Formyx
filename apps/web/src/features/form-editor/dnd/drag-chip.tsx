import type { FieldType } from '@formyx/shared';
import { FIELD_TYPE_ICONS, fieldTypeLabel } from '../field-type-meta';

/** What follows the pointer while dragging: the question type, and its label if it has one. */
export function DragChip({ type, label }: { type: FieldType; label?: string }) {
  const Icon = FIELD_TYPE_ICONS[type];
  return (
    <div className="flex max-w-72 cursor-grabbing items-center gap-2.5 rounded-lg border bg-popover px-2.5 py-2 text-14 text-popover-foreground shadow-popover">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-md border bg-background text-muted-foreground">
        <Icon aria-hidden />
      </span>
      <span className="min-w-0">
        <span className="block truncate font-medium">{label || fieldTypeLabel(type)}</span>
        {label && (
          <span className="block text-12 text-muted-foreground">{fieldTypeLabel(type)}</span>
        )}
      </span>
    </div>
  );
}
