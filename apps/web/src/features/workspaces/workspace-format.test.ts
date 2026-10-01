import { describe, expect, it } from 'vitest';
import { initial, inviteExpiry, roleWithArticle } from './workspace-format';

const NOW = new Date('2026-10-01T12:00:00.000Z');
const later = (ms: number) => new Date(NOW.getTime() + ms).toISOString();
const HOUR = 3600_000;

describe('inviteExpiry', () => {
  it.each([
    [later(7 * 24 * HOUR), 'Expires in 7 days', false],
    [later(24 * HOUR + 1), 'Expires in 1 day', false],
    [later(23 * HOUR), 'Expires in 23 hours', false],
    [later(HOUR), 'Expires in 1 hour', false],
    [later(59 * 60_000), 'Expires in under an hour', false],
    [later(0), 'Expired', true],
    [later(-HOUR), 'Expired', true],
  ])('%s -> %s', (expiresAt, label, expired) => {
    expect(inviteExpiry(expiresAt, NOW)).toEqual({ label, expired });
  });
});

describe('roleWithArticle', () => {
  it('reads naturally', () => {
    expect(roleWithArticle('OWNER')).toBe('an owner');
    expect(roleWithArticle('EDITOR')).toBe('an editor');
    expect(roleWithArticle('VIEWER')).toBe('a viewer');
  });
});

describe('initial', () => {
  it('takes the first character, even outside the basic alphabet', () => {
    expect(initial(' ada lovelace')).toBe('A');
    expect(initial('Émile')).toBe('É');
    expect(initial('  ')).toBe('?');
  });
});
