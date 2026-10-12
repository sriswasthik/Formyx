import { afterEach, describe, expect, it, vi } from 'vitest';
import { recordFormView } from './public-form-api';
import { recordViewOnce } from './record-view';

vi.mock('./public-form-api', () => ({
  recordFormView: vi.fn(() => Promise.resolve('visit-token-0123456789ab')),
  reportProgress: vi.fn(() => Promise.resolve()),
}));

afterEach(() => {
  sessionStorage.clear();
});

describe('recordViewOnce', () => {
  it('counts one view when asked twice at once, and keeps it for the session', async () => {
    const [first, second] = await Promise.all([recordViewOnce('survey'), recordViewOnce('survey')]);
    expect(first).toBe('visit-token-0123456789ab');
    expect(second).toBe(first);
    expect(await recordViewOnce('survey')).toBe(first);
    expect(recordFormView).toHaveBeenCalledTimes(1);
  });
});
