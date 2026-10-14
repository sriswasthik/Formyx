import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCycle } from './use-cycle';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('useCycle', () => {
  it('steps through the items and loops', () => {
    const { result } = renderHook(() => useCycle({ count: 3, interval: 1000, paused: false }));
    expect(result.current).toBe(0);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current).toBe(1);
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current).toBe(0);
  });

  it('holds while paused, as with reduced motion', () => {
    const { result, rerender } = renderHook(
      ({ paused }) => useCycle({ count: 3, interval: 1000, paused }),
      { initialProps: { paused: true } },
    );
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(result.current).toBe(0);
    rerender({ paused: false });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current).toBe(1);
  });

  it('holds while the tab is hidden', () => {
    const { result } = renderHook(() => useCycle({ count: 3, interval: 1000, paused: false }));
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(result.current).toBe(0);
  });
});
