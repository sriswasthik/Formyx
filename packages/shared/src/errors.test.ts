import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { apiErrorSchema, createApiError, isApiError, toValidationIssues } from './errors.js';

describe('createApiError', () => {
  it('builds the standard error shape', () => {
    expect(createApiError('NOT_FOUND', 'Form not found')).toEqual({
      error: { code: 'NOT_FOUND', message: 'Form not found' },
    });
  });

  it('includes details only when provided', () => {
    const body = createApiError('VALIDATION_ERROR', 'Invalid input', [{ path: 'a', message: 'b' }]);
    expect(body.error.details).toEqual([{ path: 'a', message: 'b' }]);
    expect('details' in createApiError('CONFLICT', 'Taken').error).toBe(false);
  });

  it('produces bodies that satisfy the schema', () => {
    expect(apiErrorSchema.safeParse(createApiError('INTERNAL_ERROR', 'Oops')).success).toBe(true);
  });
});

describe('isApiError', () => {
  it('accepts well-formed error bodies', () => {
    expect(isApiError({ error: { code: 'UNAUTHORIZED', message: 'Sign in' } })).toBe(true);
  });

  it.each([
    null,
    'error',
    { error: 'nope' },
    { error: { code: 'NOT_A_CODE', message: 'x' } },
    { error: { code: 'NOT_FOUND' } },
  ])('rejects %j', (value) => {
    expect(isApiError(value)).toBe(false);
  });
});

describe('toValidationIssues', () => {
  it('flattens nested paths using dot notation', () => {
    const schema = z.object({
      title: z.string().min(1, 'Title is required'),
      fields: z.array(z.object({ label: z.string().min(1, 'Label is required') })),
    });
    const result = schema.safeParse({ title: '', fields: [{ label: 'ok' }, { label: '' }] });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(toValidationIssues(result.error)).toEqual([
      { path: 'title', message: 'Title is required' },
      { path: 'fields.1.label', message: 'Label is required' },
    ]);
  });

  it('uses an empty path for root-level issues', () => {
    const result = z.string().safeParse(42);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(toValidationIssues(result.error)[0]?.path).toBe('');
  });
});
