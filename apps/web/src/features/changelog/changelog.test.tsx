import { render, screen } from '@testing-library/react';
import { renderHook, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { CHANGELOG } from './changelog-entries';
import { ChangelogPage } from './changelog-page';
import { LATEST_CHANGELOG_ID, markChangelogSeen, useHasUnseenChanges } from './latest';

beforeEach(() => {
  localStorage.clear();
});

describe('the changelog', () => {
  it('names its newest entry in latest.ts, with unique ids, newest first', () => {
    expect(CHANGELOG[0]?.id).toBe(LATEST_CHANGELOG_ID);
    expect(new Set(CHANGELOG.map(({ id }) => id)).size).toBe(CHANGELOG.length);
    const dates = CHANGELOG.map(({ date }) => date);
    expect(dates).toEqual([...dates].sort().reverse());
  });

  it('lists every entry under one heading, and marks them seen', () => {
    render(
      <MemoryRouter>
        <ChangelogPage />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Changelog' })).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(CHANGELOG.length);
    expect(localStorage.getItem('formyx-changelog-seen')).toBe(LATEST_CHANGELOG_ID);
  });
});

describe('useHasUnseenChanges', () => {
  it('is true until the newest entry is seen', () => {
    const { result } = renderHook(() => useHasUnseenChanges());
    expect(result.current).toBe(true);
    act(() => {
      markChangelogSeen();
    });
    expect(result.current).toBe(false);
  });
});
