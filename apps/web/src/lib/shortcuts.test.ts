import { describe, expect, it } from 'vitest';
import { formatShortcut, isTypingTarget, matchesShortcut } from './shortcuts';

const press = (
  key: string,
  modifiers: Partial<Record<'meta' | 'ctrl' | 'shift' | 'alt', boolean>> = {},
) => ({
  key,
  metaKey: modifiers.meta ?? false,
  ctrlKey: modifiers.ctrl ?? false,
  shiftKey: modifiers.shift ?? false,
  altKey: modifiers.alt ?? false,
});

describe('formatShortcut', () => {
  it('uses symbols on Apple platforms and names elsewhere', () => {
    expect(formatShortcut({ key: 'z', mod: true }, true)).toBe('⌘Z');
    expect(formatShortcut({ key: 'z', mod: true, shift: true }, true)).toBe('⌘⇧Z');
    expect(formatShortcut({ key: 'z', mod: true, shift: true }, false)).toBe('Ctrl+Shift+Z');
    expect(formatShortcut({ key: 'Escape' }, false)).toBe('Esc');
    expect(formatShortcut({ key: 'Backspace' }, true)).toBe('⌫');
  });
});

describe('matchesShortcut', () => {
  const undo = { key: 'z', mod: true };

  it('uses ⌘ on Apple platforms and Ctrl elsewhere', () => {
    expect(matchesShortcut(press('z', { meta: true }), undo, true)).toBe(true);
    expect(matchesShortcut(press('z', { ctrl: true }), undo, true)).toBe(false);
    expect(matchesShortcut(press('z', { ctrl: true }), undo, false)).toBe(true);
    expect(matchesShortcut(press('z', { meta: true }), undo, false)).toBe(false);
  });

  it('requires exactly the modifiers of the shortcut', () => {
    expect(matchesShortcut(press('Z', { ctrl: true, shift: true }), undo, false)).toBe(false);
    expect(
      matchesShortcut(
        press('Z', { ctrl: true, shift: true }),
        { key: 'z', mod: true, shift: true },
        false,
      ),
    ).toBe(true);
    expect(matchesShortcut(press('z', { ctrl: true, alt: true }), undo, false)).toBe(false);
    expect(matchesShortcut(press('Delete'), { key: 'Delete' }, false)).toBe(true);
  });
});

describe('isTypingTarget', () => {
  it('treats text fields as typing and buttons or checkboxes as not', () => {
    const make = (html: string) => {
      document.body.innerHTML = html;
      return document.body.firstElementChild;
    };
    expect(isTypingTarget(make('<input type="text">'))).toBe(true);
    expect(isTypingTarget(make('<input type="number">'))).toBe(true);
    expect(isTypingTarget(make('<textarea></textarea>'))).toBe(true);
    expect(isTypingTarget(make('<select></select>'))).toBe(true);
    expect(isTypingTarget(make('<input type="checkbox">'))).toBe(false);
    expect(isTypingTarget(make('<button>Go</button>'))).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});
