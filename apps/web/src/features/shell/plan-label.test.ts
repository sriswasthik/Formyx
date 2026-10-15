import { resolveEntitlements } from '@formyx/shared';
import { describe, expect, it } from 'vitest';
import { daysLeftLabel, workspacePlanLabel } from './plan-label';

const NOW = new Date('2026-10-15T12:00:00.000Z');

describe('daysLeftLabel', () => {
  it('counts the days, and says when it ends today', () => {
    expect(daysLeftLabel(21)).toBe('21 days left');
    expect(daysLeftLabel(1)).toBe('1 day left');
    expect(daysLeftLabel(0)).toBe('Ends today');
  });
});

describe('workspacePlanLabel', () => {
  it('names a trial and the days left in it', () => {
    const entitlements = resolveEntitlements(
      { plan: 'PRO', planStatus: 'TRIALING', trialEndsAt: new Date('2026-11-05T12:00:00.000Z') },
      'enforced',
      NOW,
    );
    expect(workspacePlanLabel(entitlements, 'OWNER', NOW)).toBe('Pro trial · 21 days left');
  });

  it('names the plan the workspace gets', () => {
    const entitlements = resolveEntitlements(
      { plan: 'FREE', planStatus: 'ACTIVE', trialEndsAt: null },
      'enforced',
      NOW,
    );
    expect(workspacePlanLabel(entitlements, 'EDITOR', NOW)).toBe('Free');
  });

  it('shows the role where plans are not enforced, or before they load', () => {
    const entitlements = resolveEntitlements(
      { plan: 'FREE', planStatus: 'ACTIVE', trialEndsAt: null },
      'all_unlocked',
      NOW,
    );
    expect(workspacePlanLabel(entitlements, 'VIEWER', NOW)).toBe('Viewer');
    expect(workspacePlanLabel(undefined, 'OWNER', NOW)).toBe('Owner');
  });
});
