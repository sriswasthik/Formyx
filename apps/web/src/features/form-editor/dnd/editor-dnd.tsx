import type { FieldType } from '@formyx/shared';
import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
  type DragMoveEvent,
  type DragStartEvent,
  type DropAnimation,
  type UniqueIdentifier,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { useReducedMotion } from 'motion/react';
import { useState } from 'react';
import type * as React from 'react';
import { useEditorStoreApi } from '../editor-store-context';
import { fieldTypeLabel } from '../field-type-meta';
import { DragChip } from './drag-chip';
import { DropIndexContext } from './drop-index-context';
import { CANVAS_DROP_ID, getInsertionIndex, type DragData } from './insertion';

type ActiveDrag = { kind: 'palette'; type: FieldType } | { kind: 'field'; id: string };

const DROP_ANIMATION: DropAnimation = {
  duration: 200,
  easing: 'cubic-bezier(0.2, 0, 0, 1)',
};

function dragData(value: unknown): DragData | undefined {
  return typeof value === 'object' && value !== null && 'kind' in value
    ? (value as DragData)
    : undefined;
}

/**
 * Palette drags look for the nearest question once the pointer is over the form (so gaps
 * between questions still count), and nothing outside it. Reordering always snaps to the
 * nearest question.
 */
const collisionDetection: CollisionDetection = (args) => {
  const questions = args.droppableContainers.filter(
    (container) => dragData(container.data.current)?.kind === 'field',
  );

  if (dragData(args.active.data.current)?.kind === 'palette') {
    if (pointerWithin(args).length === 0) return [];
    if (questions.length === 0) {
      return pointerWithin(args).filter((collision) => collision.id === CANVAS_DROP_ID);
    }
  }
  return closestCenter({ ...args, droppableContainers: questions });
};

const instructions = {
  draggable:
    'To move a question, press Space or Enter to pick it up, use the arrow keys to move it, ' +
    'then press Space or Enter to drop it, or Escape to cancel.',
};

/** Drag and drop for the whole editor: palette to canvas, and reordering the canvas. */
export function EditorDnd({ children }: { children: React.ReactNode }) {
  const store = useEditorStoreApi();
  const reduceMotion = useReducedMotion() ?? false;
  const [active, setActive] = useState<ActiveDrag | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  const sensors = useSensors(
    // A few pixels of movement before dragging starts, so clicks still select.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const fieldIds = () => store.getState().schema.fields.map((field) => field.id);

  const describe = (id: UniqueIdentifier) => {
    const paletteType = String(id).startsWith('palette:') ? String(id).slice(8) : null;
    if (paletteType) return `New ${paletteType.replace('_', ' ')} question`;
    const fields = store.getState().schema.fields;
    const index = fields.findIndex((field) => field.id === id);
    const field = fields[index];
    if (!field) return 'Question';
    const label = field.label || `Untitled ${fieldTypeLabel(field.type).toLowerCase()} question`;
    return `Question ${index + 1}, ${label}`;
  };

  const position = (id: UniqueIdentifier | undefined) => {
    const ids = fieldIds();
    return id === undefined ? null : `position ${ids.indexOf(String(id)) + 1} of ${ids.length}`;
  };

  const announcements: Announcements = {
    onDragStart: ({ active: dragged }) => `Picked up ${describe(dragged.id)}.`,
    onDragOver: ({ active: dragged, over }) =>
      over ? `${describe(dragged.id)} is over ${position(over.id) ?? 'the form'}.` : undefined,
    onDragEnd: ({ active: dragged, over }) =>
      over
        ? `${describe(dragged.id)} was dropped at ${position(over.id) ?? 'the end'}.`
        : `${describe(dragged.id)} was dropped.`,
    onDragCancel: ({ active: dragged }) =>
      `Moving was cancelled. ${describe(dragged.id)} was dropped.`,
  };

  const updateDropIndex = ({ active: dragged, over }: DragMoveEvent) => {
    if (dragData(dragged.data.current)?.kind !== 'palette') return;
    const rect = dragged.rect.current.translated;
    const pointerY = rect ? rect.top + rect.height / 2 : null;
    const next = getInsertionIndex(
      fieldIds(),
      over ? { id: String(over.id), rect: over.rect } : null,
      pointerY,
    );
    setDropIndex((current) => (current === next ? current : next));
  };

  const reset = () => {
    setActive(null);
    setDropIndex(null);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      accessibility={{ announcements, screenReaderInstructions: instructions }}
      onDragStart={({ active: dragged }: DragStartEvent) => {
        const data = dragData(dragged.data.current);
        if (data?.kind === 'palette') setActive({ kind: 'palette', type: data.type });
        else setActive({ kind: 'field', id: String(dragged.id) });
      }}
      onDragMove={updateDropIndex}
      onDragOver={updateDropIndex}
      onDragEnd={({ active: dragged, over }) => {
        const data = dragData(dragged.data.current);
        const state = store.getState();
        if (data?.kind === 'palette') {
          if (dropIndex !== null) state.addField(data.type, dropIndex);
        } else if (over && over.id !== dragged.id) {
          const toIndex = fieldIds().indexOf(String(over.id));
          if (toIndex >= 0) state.moveField(String(dragged.id), toIndex);
        }
        reset();
      }}
      onDragCancel={reset}
    >
      <DropIndexContext.Provider value={dropIndex}>{children}</DropIndexContext.Provider>
      {/* A palette item lands where it is dropped, so it should not animate back. */}
      <DragOverlay
        dropAnimation={reduceMotion || active?.kind === 'palette' ? null : DROP_ANIMATION}
      >
        {active?.kind === 'palette' && <DragChip type={active.type} />}
        {active?.kind === 'field' && <FieldDragChip id={active.id} />}
      </DragOverlay>
    </DndContext>
  );
}

function FieldDragChip({ id }: { id: string }) {
  const store = useEditorStoreApi();
  const field = store.getState().schema.fields.find((candidate) => candidate.id === id);
  return field ? <DragChip type={field.type} label={field.label} /> : null;
}
