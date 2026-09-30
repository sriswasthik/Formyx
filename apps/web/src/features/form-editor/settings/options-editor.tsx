import { createOption, type ChoiceField, type FieldOption } from '@formyx/shared';
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type Modifier,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Plus, X } from 'lucide-react';
import { useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import type * as React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/** Options only move up and down. */
const verticalOnly: Modifier = ({ transform }) => ({ ...transform, x: 0 });

interface OptionRowProps {
  option: FieldOption;
  index: number;
  canRemove: boolean;
  error: string | undefined;
  inputRef: (node: HTMLInputElement | null) => void;
  onLabelChange: (label: string) => void;
  onEnter: () => void;
  onRemove: (viaKeyboard: boolean) => void;
}

function OptionRow({
  option,
  index,
  canRemove,
  error,
  inputRef,
  onLabelChange,
  onEnter,
  onRemove,
}: OptionRowProps) {
  const reduceMotion = useReducedMotion() ?? false;
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: option.id,
    transition: reduceMotion ? null : { duration: 200, easing: 'cubic-bezier(0.2, 0, 0, 1)' },
  });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn('flex flex-col gap-1', isDragging && 'relative z-10 opacity-80')}
    >
      <div className="flex items-center gap-1">
        <button
          ref={setActivatorNodeRef}
          type="button"
          {...attributes}
          {...(listeners as React.DOMAttributes<HTMLButtonElement>)}
          aria-label={`Move option ${index + 1}`}
          className="flex h-9 w-5 shrink-0 cursor-grab touch-none items-center justify-center rounded text-muted-foreground hover:text-foreground active:cursor-grabbing"
        >
          <GripVertical aria-hidden />
        </button>
        <Input
          ref={inputRef}
          aria-label={`Option ${index + 1}`}
          aria-invalid={error ? true : undefined}
          value={option.label}
          placeholder={`Option ${index + 1}`}
          onChange={(event) => {
            onLabelChange(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              onEnter();
            } else if (event.key === 'Backspace' && option.label === '' && canRemove) {
              event.preventDefault();
              onRemove(true);
            }
          }}
        />
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Remove option ${index + 1}`}
          disabled={!canRemove}
          className="shrink-0 text-muted-foreground hover:not-disabled:text-foreground"
          onClick={() => {
            onRemove(false);
          }}
        >
          <X aria-hidden />
        </Button>
      </div>
      {error && <p className="pl-6 text-13 text-danger-text">{error}</p>}
    </li>
  );
}

interface OptionsEditorProps {
  field: ChoiceField;
  /** Problems keyed by path within the field, e.g. `options.2.label`. */
  issues: Record<string, string>;
  onChange: (options: FieldOption[], mergeKey?: string) => void;
}

/**
 * Edit, add, remove and reorder options. Enter adds an option below; Backspace in an empty
 * option removes it; the handles drag with a pointer or with the keyboard.
 */
export function OptionsEditor({ field, issues, onChange }: OptionsEditorProps) {
  const inputs = useRef(new Map<string, HTMLInputElement>());
  const [focusRequest, setFocusRequest] = useState<{ id: string; select: boolean } | null>(null);
  const { options } = field;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => {
    if (!focusRequest) return;
    const input = inputs.current.get(focusRequest.id);
    if (!input) return;
    input.focus();
    if (focusRequest.select) input.select();
    setFocusRequest(null);
  }, [focusRequest, options]);

  const insertAfter = (index: number) => {
    const option = createOption(`Option ${options.length + 1}`);
    onChange([...options.slice(0, index + 1), option, ...options.slice(index + 1)]);
    setFocusRequest({ id: option.id, select: true });
  };

  const remove = (index: number, focusPrevious: boolean) => {
    const neighbour = options[index - 1] ?? options[index + 1];
    onChange(options.filter((_, i) => i !== index));
    if (focusPrevious && neighbour) setFocusRequest({ id: neighbour.id, select: false });
  };

  return (
    <div className="flex flex-col gap-2">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[verticalOnly]}
        accessibility={{
          screenReaderInstructions: {
            draggable:
              'To reorder an option, press Space or Enter, use the arrow keys, then Space or Enter to drop it.',
          },
        }}
        onDragEnd={({ active, over }) => {
          if (!over || active.id === over.id) return;
          const from = options.findIndex((option) => option.id === active.id);
          const to = options.findIndex((option) => option.id === over.id);
          if (from >= 0 && to >= 0) onChange(arrayMove(options, from, to));
        }}
      >
        <SortableContext
          items={options.map((option) => option.id)}
          strategy={verticalListSortingStrategy}
        >
          <ul aria-label="Options" className="-ml-1 flex flex-col gap-1.5">
            {options.map((option, index) => (
              <OptionRow
                key={option.id}
                option={option}
                index={index}
                canRemove={options.length > 1}
                error={issues[`options.${index}.label`] ?? issues[`options.${index}.id`]}
                inputRef={(node) => {
                  if (node) inputs.current.set(option.id, node);
                  else inputs.current.delete(option.id);
                }}
                onLabelChange={(label) => {
                  onChange(
                    options.map((candidate) =>
                      candidate.id === option.id ? { ...candidate, label } : candidate,
                    ),
                    `option:${option.id}`,
                  );
                }}
                onEnter={() => {
                  insertAfter(index);
                }}
                onRemove={(viaKeyboard) => {
                  remove(index, viaKeyboard);
                }}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
      {issues.options && <p className="text-13 text-danger-text">{issues.options}</p>}
      <Button
        variant="ghost"
        size="sm"
        className="self-start text-muted-foreground hover:not-disabled:text-foreground"
        onClick={() => {
          insertAfter(options.length - 1);
        }}
      >
        <Plus aria-hidden />
        Add option
      </Button>
    </div>
  );
}
