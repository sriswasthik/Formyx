import type { FieldType } from '@formyx/shared';
import { useDraggable } from '@dnd-kit/core';
import type * as React from 'react';
import { cn } from '@/lib/utils';
import type { DragData } from '../dnd/insertion';
import { Search } from 'lucide-react';
import { useId, useState } from 'react';
import { Input } from '@/components/ui/input';
import {
  FIELD_TYPE_DESCRIPTIONS,
  FIELD_TYPE_ICONS,
  fieldTypeLabel,
  searchFieldTypes,
} from '../field-type-meta';

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
  const descriptionId = useId();
  const label = fieldTypeLabel(type);
  // Pointer drags only: Enter and Space should click (append), not start a keyboard drag.
  const onPointerDown = listeners?.onPointerDown as React.PointerEventHandler | undefined;

  return (
    <button
      ref={setNodeRef}
      type="button"
      aria-label={`Add ${label.toLowerCase()}`}
      aria-describedby={descriptionId}
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
      <span className="flex min-w-0 flex-col">
        <span className="truncate">{label}</span>
        <span id={descriptionId} className="truncate text-12 text-muted-foreground">
          {FIELD_TYPE_DESCRIPTIONS[type]}
        </span>
      </span>
    </button>
  );
}

interface FieldPaletteProps {
  onAdd: (type: FieldType) => void;
  /** Off in the mobile sheet, where tapping is the way to add. */
  draggable?: boolean;
  className?: string;
}

/**
 * Question types in categories, with a search across their names and descriptions. Drag one
 * into the form, or click to add it at the end.
 */
export function FieldPalette({ onAdd, draggable = true, className }: FieldPaletteProps) {
  const [query, setQuery] = useState('');
  const groups = searchFieldTypes(query);
  const searchId = useId();

  return (
    <nav aria-label="Question types" className={cn('flex flex-col gap-4', className)}>
      <div className="relative px-1">
        <label htmlFor={searchId} className="sr-only">
          Search question types
        </label>
        <Search
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          id={searchId}
          type="search"
          value={query}
          placeholder="Search question types"
          autoComplete="off"
          className="pl-8"
          onChange={(event) => {
            setQuery(event.target.value);
          }}
        />
      </div>
      {groups.length === 0 ? (
        <p className="px-2 py-6 text-center text-13 text-muted-foreground" role="status">
          No question types match “{query.trim()}”.
        </p>
      ) : (
        groups.map((group) => {
          const headingId = `${searchId}-${group.label.replace(/\W+/g, '-')}`;
          return (
            <section key={group.label} aria-labelledby={headingId}>
              <h2 id={headingId} className="px-2 pb-1.5 text-12 font-medium text-muted-foreground">
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
          );
        })
      )}
    </nav>
  );
}
