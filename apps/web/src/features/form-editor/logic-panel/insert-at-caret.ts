import { useLayoutEffect, useRef, type RefObject } from 'react';

type TextBox = HTMLInputElement | HTMLTextAreaElement;

/**
 * Inserting text where the caret is in a controlled text box: `insert(text)` puts it in
 * through `onChange`, then puts the caret after it and focus back in the box.
 */
export function useInsertAtCaret<T extends TextBox>(
  value: string,
  onChange: (value: string) => void,
): { ref: RefObject<T>; insert: (text: string) => void } {
  const ref = useRef<T>(null);
  const caret = useRef<number | null>(null);

  useLayoutEffect(() => {
    const box = ref.current;
    if (caret.current === null || !box) return;
    box.focus();
    box.setSelectionRange(caret.current, caret.current);
    caret.current = null;
  });

  return {
    ref,
    insert: (text: string) => {
      const box = ref.current;
      const start = box?.selectionStart ?? value.length;
      const end = box?.selectionEnd ?? value.length;
      caret.current = start + text.length;
      onChange(value.slice(0, start) + text + value.slice(end));
    },
  };
}
