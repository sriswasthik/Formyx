/** The text after an edit, and what to select in it. */
export interface TextEdit {
  text: string;
  selectionStart: number;
  selectionEnd: number;
}

/** Wraps the selection in `before` and `after`, or inserts them around `fallback`. */
export function wrapSelection(
  text: string,
  start: number,
  end: number,
  before: string,
  after: string,
  fallback: string,
): TextEdit {
  const selected = text.slice(start, end) || fallback;
  return {
    text: text.slice(0, start) + before + selected + after + text.slice(end),
    selectionStart: start + before.length,
    selectionEnd: start + before.length + selected.length,
  };
}

/** Starts each selected line with "- ", or takes it off when every line has it already. */
export function toggleList(text: string, start: number, end: number): TextEdit {
  const lineStart = text.lastIndexOf('\n', start - 1) + 1;
  const nextBreak = text.indexOf('\n', end);
  const lineEnd = nextBreak === -1 ? text.length : nextBreak;
  const lines = text.slice(lineStart, lineEnd).split('\n');
  const listed = lines.every((line) => line.startsWith('- '));
  const changed = lines.map((line) => (listed ? line.slice(2) : `- ${line}`)).join('\n');
  return {
    text: text.slice(0, lineStart) + changed + text.slice(lineEnd),
    selectionStart: lineStart,
    selectionEnd: lineStart + changed.length,
  };
}

export type RichTextFormat = 'bold' | 'italic' | 'link' | 'list';

/** Applies a toolbar format to the selection from `start` to `end`. */
export function applyFormat(
  format: RichTextFormat,
  text: string,
  start: number,
  end: number,
): TextEdit {
  switch (format) {
    case 'bold':
      return wrapSelection(text, start, end, '**', '**', 'bold text');
    case 'italic':
      return wrapSelection(text, start, end, '*', '*', 'italic text');
    case 'link':
      return wrapSelection(text, start, end, '[', '](https://)', 'link text');
    case 'list':
      return toggleList(text, start, end);
  }
}
