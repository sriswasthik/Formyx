import { describe, expect, it } from 'vitest';
import { personalWorkspaceName, personalWorkspaceSlug } from './auth-service.js';

describe('personalWorkspaceName', () => {
  it.each([
    ['Ada Lovelace', "Ada's workspace"],
    ['  Grace   Hopper ', "Grace's workspace"],
    ['Cher', "Cher's workspace"],
  ])('%j -> %j', (name, expected) => {
    expect(personalWorkspaceName(name)).toBe(expected);
  });
});

describe('personalWorkspaceSlug', () => {
  it('uses the first name and a random suffix', () => {
    expect(personalWorkspaceSlug('Zoë Adams')).toMatch(/^zoe-[a-z0-9]{6}$/);
  });

  it('falls back to "workspace" when the name has no URL-safe characters', () => {
    expect(personalWorkspaceSlug('李雷')).toMatch(/^workspace-[a-z0-9]{6}$/);
  });

  it('produces a different slug each time', () => {
    const slugs = new Set(Array.from({ length: 50 }, () => personalWorkspaceSlug('Ada')));
    expect(slugs.size).toBe(50);
  });
});
