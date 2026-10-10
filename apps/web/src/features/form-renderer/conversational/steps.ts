import type { Field, FieldType } from '@formyx/shared';

/*
 * The one-question-at-a-time flow, as plain functions. Steps are the questions respondents
 * can see, in order; the current one is tracked by field id, so a question appearing or
 * going away (conditional logic) never makes the flow jump to a different one.
 */

/** The questions shown one at a time: those respondents can see, statements included. */
export function conversationSteps<T extends Pick<Field, 'id'>>(
  fields: readonly T[],
  visibleIds: ReadonlySet<string>,
): T[] {
  return fields.filter((field) => visibleIds.has(field.id));
}

/**
 * The step to show for `currentId`: itself while visible, otherwise the next visible question
 * after where it was (or the last one before it, at the end). The first step to begin with.
 */
export function resolveStep(
  fields: readonly Pick<Field, 'id'>[],
  visibleIds: ReadonlySet<string>,
  currentId: string | null,
): string | null {
  if (currentId !== null && visibleIds.has(currentId)) return currentId;
  const steps = conversationSteps(fields, visibleIds);
  if (currentId === null) return steps[0]?.id ?? null;
  const position = fields.findIndex((field) => field.id === currentId);
  if (position === -1) return steps[0]?.id ?? null;
  const after = fields.slice(position + 1).find((field) => visibleIds.has(field.id));
  if (after) return after.id;
  const before = fields
    .slice(0, position)
    .reverse()
    .find((field) => visibleIds.has(field.id));
  return before?.id ?? null;
}

/** The step after `id`, or `null` on the last one. */
export function nextStep(steps: readonly Pick<Field, 'id'>[], id: string): string | null {
  const index = steps.findIndex((step) => step.id === id);
  return index === -1 ? null : (steps[index + 1]?.id ?? null);
}

/** The step before `id`, or `null` on the first one. */
export function previousStep(steps: readonly Pick<Field, 'id'>[], id: string): string | null {
  const index = steps.findIndex((step) => step.id === id);
  return index <= 0 ? null : (steps[index - 1]?.id ?? null);
}

/**
 * How the last answer was given. Arrow keys move between radio buttons and change a
 * dropdown's value on the way, so an answer given with them is not a decision yet.
 */
export type AnswerIntent = 'pointer' | 'key' | 'arrow';

const AUTO_ADVANCE_TYPES: readonly FieldType[] = ['single_choice', 'rating', 'dropdown'];

/**
 * Whether answering moves on by itself: for questions with one answer, picked with a click,
 * a tap or Enter/Space (a dropdown only by pointer, since its keyboard picks go through
 * arrows), never on the last step, which sends the form.
 */
export function shouldAutoAdvance({
  type,
  intent,
  enabled,
  isLast,
  answered,
}: {
  type: FieldType;
  intent: AnswerIntent | null;
  enabled: boolean;
  isLast: boolean;
  answered: boolean;
}): boolean {
  if (!enabled || isLast || !answered || !AUTO_ADVANCE_TYPES.includes(type)) return false;
  if (type === 'dropdown') return intent === 'pointer';
  return intent === 'pointer' || intent === 'key';
}

/**
 * What a key press does in the flow. Enter continues (Ctrl or ⌘ + Enter in a text area,
 * where Enter adds a line); arrow keys and Page Up/Down move between questions, except where
 * the focused control uses arrows itself, where Alt + arrow does.
 */
export type StepKey = 'next' | 'previous' | null;

const ARROW_CONTROLS = new Set(['text', 'email', 'tel', 'number', 'date', 'radio', 'search']);

export function stepKey(
  event: Pick<KeyboardEvent, 'key' | 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey'>,
  target: { tagName: string; type?: string; isContentEditable?: boolean },
): StepKey {
  const tag = target.tagName.toLowerCase();
  const textArea = tag === 'textarea';
  const usesArrows =
    textArea ||
    tag === 'select' ||
    Boolean(target.isContentEditable) ||
    (tag === 'input' && ARROW_CONTROLS.has(target.type ?? 'text'));

  if (event.key === 'Enter') {
    if (event.shiftKey || event.altKey) return null;
    if (tag === 'button' || tag === 'a') return null;
    if (textArea) return event.ctrlKey || event.metaKey ? 'next' : null;
    return 'next';
  }
  if (event.key === 'PageDown') return 'next';
  if (event.key === 'PageUp') return 'previous';
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    if (usesArrows && !event.altKey) return null;
    return event.key === 'ArrowDown' ? 'next' : 'previous';
  }
  return null;
}
