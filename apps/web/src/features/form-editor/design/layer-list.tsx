import { type BackgroundLayer, type BackgroundLayerType } from '@formyx/shared';
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
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Blend,
  CircleDot,
  Copy,
  Eye,
  EyeOff,
  GripVertical,
  Grid3x3,
  Image,
  MoreHorizontal,
  PaintBucket,
  Palette,
  Shapes,
  Trash2,
  type LucideIcon,
} from 'lucide-react';
import { useReducedMotion } from 'motion/react';
import type * as React from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { layerTitle } from './layer-edits';

export const LAYER_ICONS: Record<BackgroundLayerType, LucideIcon> = {
  solid: PaintBucket,
  linear: Blend,
  radial: CircleDot,
  mesh: Palette,
  texture: Grid3x3,
  shapes: Shapes,
  image: Image,
};

/** Layers only move up and down. */
const verticalOnly: Modifier = ({ transform }) => ({ ...transform, x: 0 });

interface LayerRowProps {
  layer: BackgroundLayer;
  selected: boolean;
  canRemove: boolean;
  canDuplicate: boolean;
  onSelect: () => void;
  onToggleHidden: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
}

function LayerRow({
  layer,
  selected,
  canRemove,
  canDuplicate,
  onSelect,
  onToggleHidden,
  onDuplicate,
  onRemove,
}: LayerRowProps) {
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
    id: layer.id,
    transition: reduceMotion ? null : { duration: 200, easing: 'cubic-bezier(0.2, 0, 0, 1)' },
  });
  const Icon = LAYER_ICONS[layer.type];
  const title = layerTitle(layer);

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      data-layer-row={layer.id}
      className={cn(
        'flex h-10 items-center gap-1 rounded-lg border bg-background pr-1 pl-0.5',
        'transition-colors duration-150 ease-standard',
        selected ? 'border-accent bg-accent-subtle' : 'border-transparent hover:bg-hover',
        isDragging && 'relative z-10 border-border-strong shadow-popover',
      )}
    >
      <button
        ref={setActivatorNodeRef}
        type="button"
        {...attributes}
        {...(listeners as React.DOMAttributes<HTMLButtonElement>)}
        aria-label={`Move ${title}`}
        className="flex h-8 w-5 shrink-0 cursor-grab touch-none items-center justify-center rounded text-muted-foreground hover:text-foreground active:cursor-grabbing"
      >
        <GripVertical aria-hidden />
      </button>
      <button
        type="button"
        aria-pressed={selected}
        onClick={onSelect}
        className={cn(
          'flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 text-left text-13',
          layer.hidden && 'text-muted-foreground',
        )}
      >
        <Icon aria-hidden className="shrink-0 text-muted-foreground" />
        <span className="truncate">{title}</span>
      </button>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={layer.hidden ? `Show ${title}` : `Hide ${title}`}
        onClick={onToggleHidden}
      >
        {layer.hidden ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`More for ${title}`}>
            <MoreHorizontal aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem disabled={!canDuplicate} onSelect={onDuplicate}>
            <Copy aria-hidden />
            Duplicate
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!canRemove} onSelect={onRemove}>
            <Trash2 aria-hidden />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}

interface LayerListProps {
  /** Bottom first, as stored. */
  layers: readonly BackgroundLayer[];
  selectedId: string | null;
  canDuplicate: boolean;
  onSelect: (id: string) => void;
  /** `toIndex` counts bottom first. */
  onMove: (id: string, toIndex: number) => void;
  onToggleHidden: (id: string) => void;
  onDuplicate: (id: string) => void;
  onRemove: (id: string) => void;
}

/** The background's layers, top first like a stack of paper: drag to reorder. */
export function LayerList({
  layers,
  selectedId,
  canDuplicate,
  onSelect,
  onMove,
  onToggleHidden,
  onDuplicate,
  onRemove,
}: LayerListProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const topFirst = [...layers].reverse();

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[verticalOnly]}
      accessibility={{
        screenReaderInstructions: {
          draggable:
            'To move a layer, press space or enter, use the up and down arrow keys, then press space or enter again.',
        },
      }}
      onDragEnd={({ active, over }) => {
        if (!over || active.id === over.id) return;
        const shown = topFirst.findIndex((layer) => layer.id === over.id);
        if (shown === -1) return;
        onMove(String(active.id), layers.length - 1 - shown);
      }}
    >
      <SortableContext
        items={topFirst.map((layer) => layer.id)}
        strategy={verticalListSortingStrategy}
      >
        <ul aria-label="Background layers, top first" className="flex flex-col gap-0.5">
          {topFirst.map((layer) => (
            <LayerRow
              key={layer.id}
              layer={layer}
              selected={layer.id === selectedId}
              canRemove={layers.length > 1}
              canDuplicate={canDuplicate}
              onSelect={() => {
                onSelect(layer.id);
              }}
              onToggleHidden={() => {
                onToggleHidden(layer.id);
              }}
              onDuplicate={() => {
                onDuplicate(layer.id);
              }}
              onRemove={() => {
                onRemove(layer.id);
              }}
            />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}
