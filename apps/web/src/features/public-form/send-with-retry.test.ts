import { SUBMISSION_KEY_PATTERN } from '@formyx/shared';
import { describe, expect, it, vi } from 'vitest';
import { ApiRequestError } from '@/lib/api';
import { newSubmissionKey, sendWithRetry } from './send-with-retry';

const offline = () => new ApiRequestError(0, 'NETWORK_ERROR', 'Could not reach the server');
const asleep = () => new ApiRequestError(503, 'INTERNAL_ERROR', 'Unavailable');
const invalid = () => new ApiRequestError(400, 'VALIDATION_ERROR', 'Some answers…');

describe('sendWithRetry', () => {
  it('tries again while the server cannot be reached, then succeeds', async () => {
    const send = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(offline())
      .mockRejectedValueOnce(asleep())
      .mockResolvedValue('sent');
    const sleep = vi.fn(() => Promise.resolve());
    const onRetry = vi.fn();

    await expect(sendWithRetry(send, { sleep, onRetry, delays: [10, 20, 30] })).resolves.toBe(
      'sent',
    );

    expect(send).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls).toEqual([[10], [20]]);
    expect(onRetry.mock.calls).toEqual([[1], [2]]);
  });

  it('gives up after the last delay', async () => {
    const send = vi.fn<() => Promise<string>>().mockRejectedValue(offline());

    await expect(
      sendWithRetry(send, { sleep: () => Promise.resolve(), delays: [1, 1] }),
    ).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
    expect(send).toHaveBeenCalledTimes(3);
  });

  it('never retries problems trying again cannot fix', async () => {
    const send = vi.fn<() => Promise<string>>().mockRejectedValue(invalid());

    await expect(sendWithRetry(send, { sleep: () => Promise.resolve() })).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    expect(send).toHaveBeenCalledTimes(1);
  });
});

describe('newSubmissionKey', () => {
  it('makes keys the server accepts, a new one each time', () => {
    const key = newSubmissionKey();
    expect(key).toMatch(SUBMISSION_KEY_PATTERN);
    expect(newSubmissionKey()).not.toBe(key);
  });
});
