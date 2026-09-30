import type { WorkspaceSummary } from '@formyx/shared';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ACTIVE_WORKSPACE_STORAGE_KEY,
  resolveActiveWorkspace,
  useWorkspaceStore,
} from './workspace-store';

const personal: WorkspaceSummary = { id: 'w1', name: 'Personal', slug: 'p', role: 'OWNER' };
const team: WorkspaceSummary = { id: 'w2', name: 'Team', slug: 't', role: 'VIEWER' };

afterEach(() => {
  useWorkspaceStore.setState({ activeWorkspaceId: null });
});

describe('resolveActiveWorkspace', () => {
  it('uses the stored workspace when the user belongs to it', () => {
    expect(resolveActiveWorkspace([personal, team], 'w2')).toBe(team);
  });

  it.each([null, 'someone-elses-workspace'])(
    'falls back to the first workspace for a stored id of %j',
    (storedId) => {
      expect(resolveActiveWorkspace([personal, team], storedId)).toBe(personal);
    },
  );

  it('returns null when the user has no workspaces', () => {
    expect(resolveActiveWorkspace([], 'w1')).toBeNull();
  });
});

describe('useWorkspaceStore', () => {
  it('persists the active workspace id', () => {
    useWorkspaceStore.getState().setActiveWorkspaceId('w2');

    expect(JSON.parse(localStorage.getItem(ACTIVE_WORKSPACE_STORAGE_KEY) ?? '{}')).toMatchObject({
      state: { activeWorkspaceId: 'w2' },
    });
  });
});
