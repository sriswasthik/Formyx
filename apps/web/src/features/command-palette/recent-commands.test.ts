import { describe, expect, it } from 'vitest';
import {
  RECENT_COMMANDS,
  RECENT_COMMANDS_KEY,
  readRecentCommands,
  rememberCommand,
} from './recent-commands';

describe('recent commands', () => {
  it('puts the latest first, once, and keeps only a few', () => {
    for (const id of ['a', 'b', 'c', 'd', 'e', 'f']) rememberCommand(id);
    expect(readRecentCommands()).toEqual(['f', 'e', 'd', 'c', 'b']);
    expect(rememberCommand('d')).toEqual(['d', 'f', 'e', 'c', 'b']);
    expect(readRecentCommands()).toHaveLength(RECENT_COMMANDS);
  });

  it('ignores what it cannot read', () => {
    localStorage.setItem(RECENT_COMMANDS_KEY, '{not json');
    expect(readRecentCommands()).toEqual([]);
    localStorage.setItem(RECENT_COMMANDS_KEY, JSON.stringify(['go:forms', 3, null]));
    expect(readRecentCommands()).toEqual(['go:forms']);
  });
});
