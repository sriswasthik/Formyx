import { describe, expect, it } from 'vitest';
import { feedbackInputSchema } from './feedback.js';

describe('feedbackInputSchema', () => {
  it('trims the message and keeps only the page’s path', () => {
    expect(
      feedbackInputSchema.parse({
        kind: 'problem',
        message: '  The preview is blank  ',
        page: '/app/forms/abc/edit?tab=design#panel',
      }),
    ).toEqual({ kind: 'problem', message: 'The preview is blank', page: '/app/forms/abc/edit' });
  });

  it.each([
    [{ kind: 'idea', message: '   ' }, 'message'],
    [{ kind: 'idea', message: 'x'.repeat(2001) }, 'message'],
    [{ kind: 'praise', message: 'Nice' }, 'kind'],
    [{ kind: 'idea', message: 'Nice', page: 'https://evil.example.com/' }, 'page'],
  ])('refuses %j', (input, path) => {
    const result = feedbackInputSchema.safeParse(input);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual([path]);
  });
});
