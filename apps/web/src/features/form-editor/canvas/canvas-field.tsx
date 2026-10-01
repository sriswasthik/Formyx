import {
  defaultAnimateLayoutChanges,
  useSortable,
  type AnimateLayoutChanges,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { describeConditions } from '@formyx/shared';
import { GripVertical, Split } from 'lucide-react';
import { useReducedMotion } from 'motion/react';
import { memo, useEffect, useRef } from 'react';
import type * as React from 'react';
import { FieldRenderer } from '@/features/form-renderer/field-renderer';
import { cn } from '@/lib/utils';
import type { DragData } from '../dnd/insertion';
import { useEditorStore } from '../editor-store-context';
import { fieldTypeLabel } from '../field-type-meta';
import { DropIndicator } from './drop-indicator';
import { FieldToolbar } from './field-toolbar';

// Animate every reorder, not just drags: moving with the toolbar or keyboard slides too.
const animateLayoutChanges: AnimateLayoutChanges = (args) =>
  defaultAnimateLayoutChanges({ ...args, wasDragging: true });

const SORT_TRANSITION = { duration: 200, easing: 'cubic-bezier(0.2, 0, 0, 1)' };

interface CanvasFieldProps {
  id: string;
  index: number;
  total: number;
  /** A palette item is being dragged to just above this question. */
  showDropIndicator: boolean;
  onOpenSettings?: () => void;
}

/** One question on the canvas: selectable, draggable and with its toolbar when selected. */
export const CanvasField = memo(function CanvasField({
  id,
  index,
  total,
  showDropIndicator,
  onOpenSettings,
}: CanvasFieldProps) {
  const field = useEditorStore((state) => state.schema.fields.find((item) => item.id === id));
  const selected = useEditorStore((state) => state.selectedFieldId === id);
  // A string, so the question only re-renders when the summary itself changes.
  const logic = useEditorStore((state) => {
    const current = state.schema.fields.find((item) => item.id === id);
    if (!current?.conditions?.length) return null;
    return describeConditions(current, state.schema.fields) ?? 'Its condition is not finished yet';
  });
  const selectField = useEditorStore((state) => state.selectField);
  const reduceMotion = useReducedMotion() ?? false;
  const nodeRef = useRef<HTMLDivElement | null>(null);

  const data: DragData = { kind: 'field' };
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id,
    data,
    animateLayoutChanges,
    transition: reduceMotion ? null : SORT_TRANSITION,
  });

  // Bring a newly selected question (e.g. one just added) into view.
  useEffect(() => {
    if (selected) {
      nodeRef.current?.scrollIntoView({
        block: 'nearest',
        behavior: reduceMotion ? 'auto' : 'smooth',
      });
    }
  }, [selected, reduceMotion]);

  if (!field) return null;

  const label = field.label || 'Untitled question';
  const onPointerDown = listeners?.onPointerDown as React.PointerEventHandler | undefined;
  const onKeyDown = listeners?.onKeyDown as React.KeyboardEventHandler | undefined;

  return (
    <div
      ref={(node) => {
        setNodeRef(node);
        nodeRef.current = node;
      }}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      data-canvas-field
      className={cn('group relative -mx-3 sm:-mx-4', isDragging && 'z-10')}
    >
      {showDropIndicator && <DropIndicator className="-top-[7px]" />}

      <div
        className={cn(
          'relative rounded-lg outline-1 outline-transparent transition-[outline-color,opacity] duration-150 ease-standard',
          !selected && 'group-hover:outline-border-strong',
          selected && 'outline-2 outline-accent',
          isDragging && 'opacity-40',
        )}
      >
        {/* Covers the question: click (or Enter) selects it, and pointer drags start here. */}
        <button
          type="button"
          data-question-id={id}
          aria-label={`Question ${index + 1}: ${label}, ${fieldTypeLabel(field.type)}`}
          aria-current={selected || undefined}
          aria-describedby={logic ? `logic-${id}` : undefined}
          className="absolute inset-0 cursor-pointer rounded-lg"
          onPointerDown={(event) => {
            // On touch screens a swipe over a question scrolls; dragging starts at the handle.
            if (event.pointerType !== 'touch') onPointerDown?.(event);
          }}
          onClick={() => {
            selectField(id);
          }}
        />
        <div className="pointer-events-none relative px-3 py-4 sm:px-4">
          {logic && (
            <p
              id={`logic-${id}`}
              className="mb-2 flex min-w-0 items-center gap-2 text-12 text-(--form-muted)"
            >
              <span className="inline-flex h-5 shrink-0 items-center gap-1 rounded-md bg-(--form-accent-subtle) px-1.5 font-medium text-(--form-fg) [&_svg]:size-3 [&_svg]:text-(--form-accent)">
                <Split aria-hidden />
                Logic<span className="sr-only">:</span>
              </span>{' '}
              <span className="truncate">{logic}</span>
            </p>
          )}
          <FieldRenderer field={field} mode="editor" idPrefix="canvas" />
        </div>
      </div>

      <button
        ref={setActivatorNodeRef}
        type="button"
        {...attributes}
        aria-label={`Move question ${index + 1}`}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        className={cn(
          'absolute top-4 -left-6 flex h-7 w-5 cursor-grab touch-none items-center justify-center rounded text-muted-foreground active:cursor-grabbing sm:-left-7',
          'opacity-0 transition-opacity duration-150 group-hover:opacity-100 hover:text-foreground focus-visible:opacity-100',
          selected && 'opacity-100',
        )}
      >
        <GripVertical aria-hidden />
      </button>

      {selected && !isDragging && (
        <FieldToolbar id={id} index={index} total={total} onOpenSettings={onOpenSettings} />
      )}
    </div>
  );
});
