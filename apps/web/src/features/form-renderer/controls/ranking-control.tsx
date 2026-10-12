import type { FieldOfType } from '@formyx/shared';
import {
  closestCenter,
  DndContext,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ChevronDown, ChevronUp, GripVertical } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { controlSurface, secondaryButton } from '../styles';
import type { ControlProps } from '../types';
import { useFormMessages } from '../i18n/form-locale';

interface RankRowProps {
  id: string;
  label: string;
  rank: number;
  total: number;
  ranked: boolean;
  onMove: (to: number) => void;
}

const iconButton = cn(
  'inline-flex size-9 items-center justify-center rounded-(--form-radius) text-(--form-muted)',
  'transition-colors duration-150 ease-standard hover:not-disabled:bg-(--form-hover) hover:not-disabled:text-(--form-fg)',
  'disabled:opacity-40',
);

function RankRow({ id, label, rank, total, ranked, onMove }: RankRowProps) {
  const messages = useFormMessages();
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id,
  });
  const name = label || 'Untitled option';
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        controlSurface,
        'flex items-center gap-2 py-1.5 pr-1.5 pl-1 form-text',
        isDragging && 'relative z-10 shadow-lg',
      )}
    >
      <span
        {...attributes}
        {...listeners}
        // Dragging is for pointers; keyboards use the buttons, which say where things go.
        tabIndex={-1}
        aria-hidden
        className="flex size-9 shrink-0 cursor-grab touch-none items-center justify-center text-(--form-muted) active:cursor-grabbing"
      >
        <GripVertical className="size-4" />
      </span>
      <span
        aria-hidden
        className={cn(
          'flex size-6 shrink-0 items-center justify-center rounded-full form-text-sm font-medium tabular-nums',
          ranked
            ? 'bg-(--form-accent) text-(--form-accent-fg)'
            : 'border border-(--form-border-strong) text-(--form-muted)',
        )}
      >
        {rank}
      </span>
      <span className="min-w-0 flex-1 break-words">{name}</span>
      <button
        type="button"
        className={iconButton}
        aria-label={messages.controls.moveUp(name)}
        disabled={rank === 1}
        onClick={() => {
          onMove(rank - 2);
        }}
      >
        <ChevronUp aria-hidden className="size-4" />
      </button>
      <button
        type="button"
        className={iconButton}
        aria-label={messages.controls.moveDown(name)}
        disabled={rank === total}
        onClick={() => {
          onMove(rank);
        }}
      >
        <ChevronDown aria-hidden className="size-4" />
      </button>
    </li>
  );
}

/**
 * Put the options in order: drag them, or move them with the buttons. The order counts as an
 * answer once it has been touched, or confirmed as it is.
 */
function RankingControl({
  field,
  controlId,
  describedBy,
  value,
  onChange,
}: ControlProps<FieldOfType<'ranking'>>) {
  const messages = useFormMessages();
  const ids = field.options.map((option) => option.id);
  const answered =
    Array.isArray(value) && value.length === ids.length && value.every((id) => ids.includes(id));
  const order = answered ? value : ids;
  const [announcement, setAnnouncement] = useState('');
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
  );
  const labelOf = (id: string) =>
    field.options.find((option) => option.id === id)?.label || 'Untitled option';

  const move = (from: number, to: number) => {
    if (to < 0 || to >= order.length) return;
    const next = arrayMove(order, from, to);
    onChange(next);
    const id = order[from];
    if (id) setAnnouncement(`${labelOf(id)} is now number ${to + 1} of ${order.length}`);
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over) return;
    const from = order.indexOf(String(active.id));
    const to = order.indexOf(String(over.id));
    if (from !== to) move(from, to);
  };

  return (
    <div className="flex flex-col gap-2" id={controlId} aria-describedby={describedBy}>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={order} strategy={verticalListSortingStrategy}>
          <ol className="flex flex-col gap-2" aria-label={messages.controls.rankingHelp}>
            {order.map((id, index) => (
              <RankRow
                key={id}
                id={id}
                label={labelOf(id)}
                rank={index + 1}
                total={order.length}
                ranked={answered}
                onMove={(to) => {
                  move(index, to);
                }}
              />
            ))}
          </ol>
        </SortableContext>
      </DndContext>
      {!answered && order.length > 0 && (
        <button
          type="button"
          className={cn(secondaryButton, 'self-start')}
          onClick={() => {
            onChange([...order]);
            setAnnouncement(messages.controls.orderKept);
          }}
        >
          {messages.controls.keepOrder}
        </button>
      )}
      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}

export function Control(props: ControlProps) {
  return props.field.type === 'ranking' ? <RankingControl {...props} field={props.field} /> : null;
}
