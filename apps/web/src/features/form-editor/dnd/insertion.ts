import type { FieldType } from '@formyx/shared';

/** Droppable id of the whole form on the canvas. */
export const CANVAS_DROP_ID = 'canvas';

export type DragData =
  { kind: 'palette'; type: FieldType } | { kind: 'field' } | { kind: 'canvas' };

interface OverTarget {
  id: string;
  rect: { top: number; height: number };
}

/**
 * Where a question dragged from the palette would land: before the question under it when
 * the pointer is in that question's top half, after it in the bottom half, and at the end
 * when the form is empty. `null` when it is not over the form at all.
 */
export function getInsertionIndex(
  fieldIds: readonly string[],
  over: OverTarget | null,
  pointerY: number | null,
): number | null {
  if (!over) return null;
  if (over.id === CANVAS_DROP_ID) return fieldIds.length;

  const index = fieldIds.indexOf(over.id);
  if (index < 0) return null;
  if (pointerY === null) return index;
  return pointerY > over.rect.top + over.rect.height / 2 ? index + 1 : index;
}
