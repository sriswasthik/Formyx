/** A keyboard shortcut; `mod` is ⌘ on Apple platforms and Ctrl elsewhere. */
export interface Shortcut {
  key: string;
  mod?: boolean;
  shift?: boolean;
}

export function isApplePlatform(): boolean {
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  const platform = nav.userAgentData?.platform ?? nav.platform;
  return /mac|iphone|ipad|ipod/i.test(platform);
}

const KEY_NAMES: Record<string, string> = {
  Escape: 'Esc',
  Backspace: '⌫',
  Delete: 'Del',
  ArrowUp: '↑',
  ArrowDown: '↓',
};

/** "⌘⇧Z" on a Mac, "Ctrl+Shift+Z" elsewhere. */
export function formatShortcut(shortcut: Shortcut, apple = isApplePlatform()): string {
  const key = KEY_NAMES[shortcut.key] ?? shortcut.key.toUpperCase();
  if (apple) return `${shortcut.mod ? '⌘' : ''}${shortcut.shift ? '⇧' : ''}${key}`;
  return [shortcut.mod && 'Ctrl', shortcut.shift && 'Shift', key].filter(Boolean).join('+');
}

/** Whether a key press is `shortcut`, with no other modifiers held. */
export function matchesShortcut(
  event: Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey'>,
  shortcut: Shortcut,
  apple = isApplePlatform(),
): boolean {
  const mod = apple ? event.metaKey : event.ctrlKey;
  const otherMod = apple ? event.ctrlKey : event.metaKey;
  return (
    event.key.toLowerCase() === shortcut.key.toLowerCase() &&
    mod === Boolean(shortcut.mod) &&
    !otherMod &&
    event.shiftKey === Boolean(shortcut.shift) &&
    !event.altKey
  );
}

/** Whether keys pressed in `target` belong to text entry, which shortcuts must not steal. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  if (!(target instanceof HTMLInputElement)) return false;
  return !['button', 'checkbox', 'radio', 'range', 'reset', 'submit', 'color', 'file'].includes(
    target.type,
  );
}
