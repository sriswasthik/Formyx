import { describe, expect, it } from 'vitest';
import { createEmptyForm, createField, createOption } from '../forms/factories.js';
import { FIELD_TYPES } from '../forms/field-types.js';
import { fieldSchema } from '../forms/fields.js';
import type { FormSchema } from '../forms/form-schema.js';
import type { EndScreen } from '../forms/logic-schema.js';
import { FORM_TEMPLATES } from '../forms/templates.js';
import { extractFormLinks, formRedirectUrls } from './links.js';
import {
  collectFormText,
  matchedRuleIds,
  matchedRuleLabels,
  moderateForm,
  moderateTexts,
  normalizeForModeration,
} from './moderation.js';
import { isNewAccount, NEW_ACCOUNT_LIMITS, newAccountEndsAt } from './new-accounts.js';

/** A form whose one question has `label` (and `description`). */
function formAsking(label: string, description?: string): FormSchema {
  const field = { ...createField('short_text'), label, ...(description && { description }) };
  return { ...createEmptyForm(), fields: [field] };
}

/** `form` with its first end screen changed by `patch`. */
function withEnding(form: FormSchema, patch: Partial<EndScreen>): FormSchema {
  const [first, ...rest] = form.logic.endScreens;
  if (!first) throw new Error('A form always has an end screen');
  return { ...form, logic: { ...form.logic, endScreens: [{ ...first, ...patch }, ...rest] } };
}

const flags = (text: string) => moderateTexts([{ path: 'x', text }]).flagged;

describe('moderateForm', () => {
  it.each([
    'Enter your net banking password',
    'Please share the OTP you received',
    'One-time password',
    'UPI PIN',
    'ATM pin',
    'Card CVV',
    'Debit card number',
    'Aadhaar number',
    'Aadhar card',
    'Verify your account to continue',
    'Your account has been suspended',
    'Update your KYC now',
    'Internet banking user ID',
  ])('holds a form that asks "%s"', (label) => {
    expect(moderateForm(formAsking(label), 'Survey').flagged).toBe(true);
  });

  it.each([
    'Your name',
    'PIN code',
    'Pincode of your area',
    'Which bank do you use?',
    'What do you think of our new opinion scale?',
    'Shipping address',
    'Your bank: SBI',
    'Company name',
  ])('lets "%s" through', (label) => {
    expect(moderateForm(formAsking(label), 'Survey').flagged).toBe(false);
  });

  it('holds two different weak signals together, but not one alone', () => {
    expect(flags('Your HDFC customer ID')).toBe(true);
    expect(flags('HDFC')).toBe(false);
    expect(flags('Account number')).toBe(false);
    expect(flags('Enter your SBI account number')).toBe(true);
  });

  it('reads the title, descriptions, options and end screens too', () => {
    expect(moderateForm(createEmptyForm(), 'Verify your account').flagged).toBe(true);

    expect(moderateForm(formAsking('Your name', 'and your OTP'), 'Survey').flagged).toBe(true);

    const choice = { ...createField('single_choice'), label: 'Pick one' };
    choice.options = [createOption('Send my CVV')];
    expect(moderateForm({ ...createEmptyForm(), fields: [choice] }, 'Survey').flagged).toBe(true);

    const ending = withEnding(createEmptyForm(), { message: 'Now reply with your OTP' });
    expect(moderateForm(ending, 'Survey').flagged).toBe(true);
  });

  it('sees through look-alike letters and invisible characters', () => {
    expect(normalizeForModeration('pаsswоrd')).toBe('password'); // Cyrillic а and о
    expect(flags('pаss\u200Bwоrd')).toBe(true);
    expect(flags('Ο\u00ADTP')).toBe(true); // Greek Ο
  });

  it('says where and what it found, once per rule for the creator', () => {
    const result = moderateForm(formAsking('Your password and OTP'), 'Password check');
    expect(result.matches).toContainEqual(
      expect.objectContaining({ ruleId: 'password', path: 'fields.0.label' }),
    );
    expect(result.matches).toContainEqual(
      expect.objectContaining({ ruleId: 'password', path: 'title' }),
    );
    expect(matchedRuleLabels(result.matches)).toEqual([
      'asks for a password',
      'asks for a one-time code',
    ]);
    expect(matchedRuleIds(result.matches)).toEqual(['otp', 'password']);
  });

  it('leaves ids and settings out of what it reads', () => {
    const paths = collectFormText(formAsking('Hello'), 'T').map((text) => text.path);
    expect(paths).toContain('fields.0.label');
    expect(paths.some((path) => /\.(id|type)$/.test(path))).toBe(false);
  });

  it('lets every built-in template through', () => {
    for (const template of FORM_TEMPLATES) {
      const result = moderateForm(template.build(), template.defaultTitle);
      expect({ id: template.id, matches: result.flagged ? result.matches : [] }).toEqual({
        id: template.id,
        matches: [],
      });
    }
  });
});

describe('extractFormLinks', () => {
  it('finds links in text, buttons and redirects, once each', () => {
    const form = withEnding(
      formAsking('See [our policy](https://example.com/policy). Or https://a.example/x, thanks'),
      {
        button: { label: 'Go', url: 'https://example.com/policy' },
        redirect: { url: 'https://next.example/', delaySeconds: 0, params: [] },
      },
    );
    expect(extractFormLinks(form).sort()).toEqual([
      'https://a.example/x',
      'https://example.com/policy',
      'https://next.example/',
    ]);
    expect(formRedirectUrls(form)).toEqual(['https://next.example/']);
  });

  it('ignores redirects left empty', () => {
    const form = withEnding(createEmptyForm(), {
      redirect: { url: '  ', delaySeconds: 0, params: [] },
    });
    expect(formRedirectUrls(form)).toEqual([]);
  });
});

describe('new accounts', () => {
  const made = new Date('2026-10-16T10:00:00Z');

  it(`are new for ${String(NEW_ACCOUNT_LIMITS.hours)} hours`, () => {
    expect(isNewAccount(made, new Date('2026-10-19T09:59:59Z'))).toBe(true);
    expect(isNewAccount(made, new Date('2026-10-19T10:00:00Z'))).toBe(false);
    expect(newAccountEndsAt(made.toISOString()).toISOString()).toBe('2026-10-19T10:00:00.000Z');
  });
});

describe('password questions', () => {
  // Respondents never type a password into a Formyx form: no question type can ask for one.
  it('do not exist, and a stored one is refused', () => {
    expect(FIELD_TYPES).not.toContain('password');
    expect(fieldSchema.safeParse({ ...createField('short_text'), type: 'password' }).success).toBe(
      false,
    );
  });
});
