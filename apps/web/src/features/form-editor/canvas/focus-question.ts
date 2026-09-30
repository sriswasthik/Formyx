/**
 * Moves keyboard focus to a question on the canvas once React has rendered it, e.g. to the
 * copy after duplicating, or to a neighbour after deleting. With no id, focuses the canvas.
 */
export function focusQuestion(id: string | null): void {
  requestAnimationFrame(() => {
    const target = id
      ? document.querySelector<HTMLElement>(`[data-question-id="${CSS.escape(id)}"]`)
      : document.querySelector<HTMLElement>('[data-editor-canvas]');
    target?.focus();
  });
}

/** The question to focus after deleting the one at `index`: the next one, else the previous. */
export function neighbourAfterRemoving(ids: readonly string[], index: number): string | null {
  return ids[index + 1] ?? ids[index - 1] ?? null;
}
