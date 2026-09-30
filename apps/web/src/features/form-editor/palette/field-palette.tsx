import type { FieldType } from '@formyx/shared';
import { useDraggable } from '@dnd-kit/core';
import type * as React from 'react';
import { cn } from '@/lib/utils';
import type { DragData } from '../dnd/insertion';
import { FIELD_TYPE_ICONS, fieldTypeLabel, PALETTE_GROUPS } from '../field-type-meta';

interface PaletteItemProps {
  type: FieldType;
  onAdd: (type: FieldType) => void;
  draggable: boolean;
}

function PaletteItem({ type, onAdd, draggable }: PaletteItemProps) {
  const data: DragData = { kind: 'palette', type };
  const { setNodeRef, listeners, isDragging } = useDraggable({
    id: `palette:${type}`,
    data,
    disabled: !draggable,
  });
  const Icon = FIELD_TYPE_ICONS[type];
  const label = fieldTypeLabel(type);
  // Pointer drags only: Enter and Space should click (append), not start a keyboard drag.
  const onPointerDown = listeners?.onPointerDown as React.PointerEventHandler | undefined;

  return (
    <button
      ref={setNodeRef}
      type="button"
      aria-label={`Add ${label.toLowerCase()}`}
      onPointerDown={onPointerDown}
      onClick={() => {
        onAdd(type);
      }}
      className={cn(
        'group flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-14 select-none',
        'transition-colors duration-150 ease-standard hover:bg-hover active:bg-pressed',
        draggable && 'cursor-grab touch-none active:cursor-grabbing',
        isDragging && 'opacity-50',
      )}
    >
      <span className="flex size-7 shrink-0 items-center justify-center rounded-md border bg-background text-muted-foreground transition-colors duration-150 group-hover:text-foreground">
        <Icon aria-hidden />
      </span>
      {label}
    </button>
  );
}

interface FieldPaletteProps {
  onAdd: (type: FieldType) => void;
  /** Off in the mobile sheet, where tapping is the way to add. */
  draggable?: boolean;
  className?: string;
}

/** Question types, grouped. Drag one into the form, or click to add it at the end. */
export function FieldPalette({ onAdd, draggable = true, className }: FieldPaletteProps) {
  return (
    <nav aria-label="Question types" className={cn('flex flex-col gap-5', className)}>
      {PALETTE_GROUPS.map((group) => (
        <section key={group.label} aria-labelledby={`palette-${group.label}`}>
          <h2
            id={`palette-${group.label}`}
            className="px-2 pb-1.5 text-12 font-medium text-muted-foreground"
          >
            {group.label}
          </h2>
          <ul className="flex flex-col gap-0.5">
            {group.types.map((type) => (
              <li key={type}>
                <PaletteItem type={type} onAdd={onAdd} draggable={draggable} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </nav>
  );
}
