/*
 * Rich text for statements and consent terms: a small markdown subset that is parsed into a
 * tree and drawn as elements, never as HTML, so creators cannot inject markup.
 *
 *   **bold**   *italic* or _italic_   [a link](https://example.com)
 *   - list items, one per line
 *   A blank line starts a new paragraph; a single line break stays a line break.
 *   A backslash before any of * _ [ ] ( ) \ - shows it as is.
 */

export type RichInline =
  | { type: 'text'; text: string }
  | { type: 'strong'; children: RichInline[] }
  | { type: 'em'; children: RichInline[] }
  | { type: 'link'; href: string; children: RichInline[] }
  | { type: 'break' };

export type RichBlock =
  { type: 'paragraph'; children: RichInline[] } | { type: 'list'; items: RichInline[][] };

const ESCAPABLE = new Set(['*', '_', '[', ']', '(', ')', '\\', '-']);
const SAFE_LINK = /^(https?:\/\/|mailto:)[^\s<>"]+$/i;

/** Links may only go to web pages or email addresses. */
export function isSafeLink(href: string): boolean {
  return SAFE_LINK.test(href);
}

/** Finds the closing `marker` after `from`, skipping escaped characters; -1 if none. */
function findClosing(source: string, marker: string, from: number): number {
  for (let index = from; index < source.length; index += 1) {
    if (source[index] === '\\') {
      index += 1;
      continue;
    }
    if (source.startsWith(marker, index)) return index;
  }
  return -1;
}

function pushText(nodes: RichInline[], text: string) {
  if (text === '') return;
  const last = nodes.at(-1);
  if (last?.type === 'text') last.text += text;
  else nodes.push({ type: 'text', text });
}

/** Inline marks within one block. Unmatched markers stay as text. */
export function parseInline(source: string): RichInline[] {
  const nodes: RichInline[] = [];
  let index = 0;
  while (index < source.length) {
    const char = source[index] ?? '';
    const next = source[index + 1] ?? '';
    if (char === '\\' && ESCAPABLE.has(next)) {
      pushText(nodes, next);
      index += 2;
      continue;
    }
    if (char === '\n') {
      nodes.push({ type: 'break' });
      index += 1;
      continue;
    }
    if (char === '*' && next === '*') {
      const end = findClosing(source, '**', index + 2);
      if (end > index + 2) {
        nodes.push({ type: 'strong', children: parseInline(source.slice(index + 2, end)) });
        index = end + 2;
        continue;
      }
    }
    if ((char === '*' || char === '_') && next !== char && next !== ' ' && next !== '') {
      const end = findClosing(source, char, index + 1);
      if (end > index + 1) {
        nodes.push({ type: 'em', children: parseInline(source.slice(index + 1, end)) });
        index = end + 1;
        continue;
      }
    }
    if (char === '[') {
      const close = findClosing(source, ']', index + 1);
      if (close > index && source[close + 1] === '(') {
        const end = findClosing(source, ')', close + 2);
        const href = end === -1 ? '' : source.slice(close + 2, end).trim();
        if (end !== -1 && isSafeLink(href)) {
          nodes.push({ type: 'link', href, children: parseInline(source.slice(index + 1, close)) });
          index = end + 1;
          continue;
        }
      }
    }
    pushText(nodes, char);
    index += 1;
  }
  return nodes;
}

const LIST_ITEM = /^\s*[-*]\s+/;

/** Paragraphs and lists. Blank lines separate blocks; list lines start with "- " or "* ". */
export function parseRichText(source: string): RichBlock[] {
  const blocks: RichBlock[] = [];
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  let paragraph: string[] = [];
  let list: string[] = [];

  const flushParagraph = () => {
    const text = paragraph.join('\n').trim();
    if (text !== '') blocks.push({ type: 'paragraph', children: parseInline(text) });
    paragraph = [];
  };
  const flushList = () => {
    if (list.length > 0) blocks.push({ type: 'list', items: list.map(parseInline) });
    list = [];
  };

  for (const line of lines) {
    if (line.trim() === '') {
      flushParagraph();
      flushList();
    } else if (LIST_ITEM.test(line)) {
      flushParagraph();
      list.push(line.replace(LIST_ITEM, '').trim());
    } else {
      flushList();
      paragraph.push(line);
    }
  }
  flushParagraph();
  flushList();
  return blocks;
}

function inlineText(nodes: readonly RichInline[]): string {
  return nodes
    .map((node) => {
      switch (node.type) {
        case 'text':
          return node.text;
        case 'break':
          return '\n';
        case 'link':
          return inlineText(node.children);
        default:
          return inlineText(node.children);
      }
    })
    .join('');
}

/** The text without its marks, for previews, CSV headers and screen-reader names. */
export function richTextToPlain(source: string): string {
  return parseRichText(source)
    .map((block) =>
      block.type === 'paragraph'
        ? inlineText(block.children)
        : block.items.map((item) => `• ${inlineText(item)}`).join('\n'),
    )
    .join('\n\n');
}

/** Plain text written as rich text that shows exactly the same: marks escaped. */
export function escapeRichText(text: string): string {
  return text
    .split('\n')
    .map((line) =>
      line
        .replace(/[\\*_[\]()]/g, (char) => `\\${char}`)
        // A line that starts like a list item would become one.
        .replace(/^(\s*)([-])(\s)/, '$1\\$2$3'),
    )
    .join('\n');
}
