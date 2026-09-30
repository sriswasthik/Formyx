import { describe, expect, it } from 'vitest';
import { hasRole, ROLES, type Role } from './roles.js';

describe('hasRole', () => {
  const cases: [Role, Role, boolean][] = [
    ['OWNER', 'OWNER', true],
    ['OWNER', 'EDITOR', true],
    ['OWNER', 'VIEWER', true],
    ['EDITOR', 'OWNER', false],
    ['EDITOR', 'EDITOR', true],
    ['EDITOR', 'VIEWER', true],
    ['VIEWER', 'OWNER', false],
    ['VIEWER', 'EDITOR', false],
    ['VIEWER', 'VIEWER', true],
  ];

  it.each(cases)('%s meets %s: %s', (role, minRole, expected) => {
    expect(hasRole(role, minRole)).toBe(expected);
  });

  it('covers every role', () => {
    expect(new Set(cases.map(([role]) => role))).toEqual(new Set(ROLES));
  });
});
