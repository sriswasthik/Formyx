import { describe, expect, it } from 'vitest';
import {
  copyFormTitle,
  createFormInputSchema,
  FORM_TITLE_MAX_LENGTH,
  listFormsQuerySchema,
  updateFormInputSchema,
} from './api.js';
import { createEmptyForm } from './factories.js';

describe('createFormInputSchema', () => {
  it('defaults to a blank form', () => {
    expect(createFormInputSchema.parse({})).toEqual({ templateId: 'blank' });
  });

  it('trims titles and rejects unknown templates', () => {
    expect(createFormInputSchema.parse({ templateId: 'feedback_survey', title: ' NPS ' })).toEqual({
      templateId: 'feedback_survey',
      title: 'NPS',
    });
    expect(createFormInputSchema.safeParse({ templateId: 'quiz' }).success).toBe(false);
    expect(createFormInputSchema.safeParse({ title: '   ' }).success).toBe(false);
  });
});

describe('updateFormInputSchema', () => {
  it('needs a version and something to change', () => {
    expect(updateFormInputSchema.safeParse({ title: 'New' }).success).toBe(false);
    expect(updateFormInputSchema.safeParse({ version: 1 }).error?.issues[0]?.message).toBe(
      'Send a title or a draftSchema to update',
    );
    expect(updateFormInputSchema.safeParse({ version: 0, title: 'New' }).success).toBe(false);
  });

  it('accepts a title, a schema or both', () => {
    expect(updateFormInputSchema.safeParse({ version: 3, title: 'New' }).success).toBe(true);
    expect(
      updateFormInputSchema.safeParse({ version: 3, draftSchema: createEmptyForm() }).success,
    ).toBe(true);
  });
});

describe('copyFormTitle', () => {
  it('adds "(copy)"', () => {
    expect(copyFormTitle('Survey')).toBe('Survey (copy)');
    expect(copyFormTitle('Survey (copy)')).toBe('Survey (copy) (copy)');
  });

  it('shortens long titles so the copy is still a valid title', () => {
    const title = copyFormTitle(`${'a'.repeat(110)} ${'b'.repeat(20)}`);
    expect(title).toHaveLength(FORM_TITLE_MAX_LENGTH);
    expect(title.endsWith(' (copy)')).toBe(true);
  });
});

describe('listFormsQuerySchema', () => {
  it('accepts any casing of status and treats a blank search as none', () => {
    expect(listFormsQuerySchema.parse({ status: 'published', search: '  ' })).toEqual({
      status: 'PUBLISHED',
      search: undefined,
    });
    expect(listFormsQuerySchema.parse({})).toEqual({ search: undefined });
  });

  it('rejects unknown statuses', () => {
    expect(listFormsQuerySchema.safeParse({ status: 'archived' }).success).toBe(false);
  });
});
