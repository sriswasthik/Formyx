import { describe, expect, it } from 'vitest';
import { formSchema } from './form-schema.js';
import { FORM_TEMPLATE_IDS } from './template-ids.js';
import { FORM_TEMPLATES, getFormTemplate } from './templates.js';

describe('form templates', () => {
  it('has a template for every id', () => {
    expect(FORM_TEMPLATES.map((template) => template.id)).toEqual([...FORM_TEMPLATE_IDS]);
  });

  it.each(FORM_TEMPLATE_IDS)('%s builds a valid schema', (id) => {
    const schema = getFormTemplate(id).build();
    expect(formSchema.safeParse(schema).error?.issues).toBeUndefined();
  });

  it('builds fresh ids every time', () => {
    const template = getFormTemplate('event_registration');
    const first = template.build().fields.map((field) => field.id);
    const second = template.build().fields.map((field) => field.id);

    expect(first).toHaveLength(9);
    expect(first.some((id) => second.includes(id))).toBe(false);
  });

  it('shows the dietary follow-up only for "Other"', () => {
    const { fields } = getFormTemplate('event_registration').build();
    const diet = fields.find((field) => field.label === 'Dietary requirements');
    const followUp = fields.find((field) => field.label === 'Tell us about your dietary needs');
    const other = diet && 'options' in diet ? diet.options.find((o) => o.label === 'Other') : null;

    expect(followUp?.conditions).toEqual([
      { sourceFieldId: diet?.id, operator: 'equals', value: other?.id },
    ]);
  });

  it('asks what to improve only after a low satisfaction rating', () => {
    const { fields, settings } = getFormTemplate('feedback_survey').build();
    const improve = fields.find((field) => field.label === 'What could we do better?');

    expect(improve?.conditions).toEqual([
      { sourceFieldId: fields[0]?.id, operator: 'less_than', value: 4 },
    ]);
    expect(settings.submitButtonText).toBe('Send feedback');
  });

  it('starts blank forms empty', () => {
    expect(getFormTemplate('blank').build().fields).toEqual([]);
  });
});
