/** The commands chosen most recently, newest first, remembered per browser. */
export const RECENT_COMMANDS_KEY = 'formyx-palette-recent';
export const RECENT_COMMANDS = 5;

export function readRecentCommands(): string[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(RECENT_COMMANDS_KEY) ?? '[]');
    return Array.isArray(stored)
      ? stored.filter((id): id is string => typeof id === 'string').slice(0, RECENT_COMMANDS)
      : [];
  } catch {
    return [];
  }
}

/** Puts `id` first, keeping the list to `RECENT_COMMANDS`. */
export function rememberCommand(id: string): string[] {
  const next = [id, ...readRecentCommands().filter((other) => other !== id)].slice(
    0,
    RECENT_COMMANDS,
  );
  try {
    localStorage.setItem(RECENT_COMMANDS_KEY, JSON.stringify(next));
  } catch {
    // Not remembering it is fine.
  }
  return next;
}
