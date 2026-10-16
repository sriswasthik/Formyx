import { describe, expect, it } from 'vitest';
import { createField } from './factories.js';
import { collectsPersonalData } from './personal-data.js';

describe('collectsPersonalData', () => {
  it.each(['email', 'phone', 'address', 'file', 'signature', 'voice_note'] as const)(
    'counts a %s question',
    (type) => {
      expect(collectsPersonalData({ fields: [createField(type)] })).toBe(true);
    },
  );

  it('counts asking for an email address before the questions', () => {
    expect(collectsPersonalData({ fields: [] }, true)).toBe(true);
  });

  it('leaves forms of opinions and choices alone', () => {
    const fields = [createField('rating'), createField('single_choice'), createField('nps')];
    expect(collectsPersonalData({ fields })).toBe(false);
  });
});
