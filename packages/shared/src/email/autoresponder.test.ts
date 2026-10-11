import { describe, expect, it } from 'vitest';
import { createEmptyForm, createField } from '../forms/factories.js';
import type { FormSchema } from '../forms/form-schema.js';
import { ENGLISH_LOCALE, formLocale } from '../i18n/locale.js';
import { hi } from '../i18n/hi.js';
import { createDefaultLiveSettings } from '../settings/live-settings.js';
import { createDefaultTheme } from '../theme/migrate.js';
import { renderAutoresponder, richTextToEmailHtml } from './autoresponder.js';

const form: FormSchema = {
  ...createEmptyForm(),
  fields: [
    { ...createField('short_text'), id: 'name', label: 'Your name' },
    { ...createField('email'), id: 'email', label: 'Email' },
    { ...createField('hidden'), id: 'source', label: 'Source', paramName: 'source' },
  ],
};
const settings = {
  ...createDefaultLiveSettings().autoresponder,
  enabled: true,
  subject: 'Thanks, {{field:name}}',
  body: 'Hi **{{field:name}}**,\n\nSee [our site](https://formyx.app).',
};

function render(overrides: Partial<Parameters<typeof renderAutoresponder>[0]> = {}) {
  return renderAutoresponder({
    formTitle: 'Workshop sign-up',
    schema: form,
    theme: createDefaultTheme(),
    settings,
    answers: { name: 'Ada <script>', email: 'ada@example.com', source: 'ad' },
    outcome: null,
    editUrl: 'https://formyx.app/f/workshop#edit=abc',
    locale: ENGLISH_LOCALE,
    ...overrides,
  });
}

describe('renderAutoresponder', () => {
  it('pipes answers into the subject and body, escaping what people typed', () => {
    const email = render();
    expect(email.subject).toBe('Thanks, Ada <script>');
    expect(email.html).toContain('<strong>Ada &lt;script&gt;</strong>');
    expect(email.html).not.toContain('<script>');
    expect(email.html).toContain('href="https://formyx.app"');
    expect(email.text).toContain('Hi Ada <script>,');
  });

  it('copies the answers, but not hidden fields', () => {
    const email = render();
    expect(email.html).toContain('Your answers');
    expect(email.html).toContain('ada@example.com');
    expect(email.text).not.toContain('Source');
  });

  it('adds the score and the edit link only when asked', () => {
    const outcome = { values: {}, quiz: { score: 8, max: 10, percent: 80, passed: true } };
    const withAll = render({ outcome });
    expect(withAll.text).toContain('8 out of 10 (80%)\nYou passed.');
    expect(withAll.html).toContain('Change your response later');

    const without = render({
      outcome,
      settings: { ...settings, includeScore: false, includeEditLink: false, includeAnswers: false },
    });
    expect(without.text).not.toContain('8 out of 10');
    expect(without.html).not.toContain('Change your response later');
    expect(without.html).not.toContain('Your answers');
  });

  it('speaks the form language', () => {
    const email = render({ locale: formLocale(createEmptyForm().settings, hi) });
    expect(email.html).toContain('आपके उत्तर');
    expect(email.text).toContain('“Workshop sign-up”');
    expect(email.html).toContain('<html lang="en">');
  });

  it('falls back to the form title for an empty subject', () => {
    expect(render({ settings: { ...settings, subject: '  ' } }).subject).toBe('Workshop sign-up');
  });
});

describe('richTextToEmailHtml', () => {
  it('turns lists into HTML and never makes unsafe links', () => {
    const html = richTextToEmailHtml('- one\n- two\n\n[bad](javascript:alert(1))');
    expect(html).toContain('<ul');
    expect(html).toContain('<li');
    expect(html).not.toContain('href="javascript');
  });
});
