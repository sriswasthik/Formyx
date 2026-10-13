import { describe, expect, it } from 'vitest';
import { THEME_PRESETS } from '../assets/presets.js';
import { formSchema } from './form-schema.js';
import { findPublishIssues } from './publish.js';
import { FORM_TEMPLATE_IDS } from './template-ids.js';
import {
  FORM_TEMPLATES,
  galleryTemplates,
  getFormTemplate,
  TEMPLATE_CATEGORIES,
  templateBySlug,
} from './templates.js';

describe('form templates', () => {
  it('has a template for every id', () => {
    expect(FORM_TEMPLATES.map((template) => template.id)).toEqual([...FORM_TEMPLATE_IDS]);
  });

  it('offers more than 30 in the gallery, in every category', () => {
    expect(galleryTemplates().length).toBeGreaterThan(30);
    for (const category of TEMPLATE_CATEGORIES) {
      expect(galleryTemplates(category).length, category).toBeGreaterThan(1);
    }
  });

  it('gives each one its own page and a look that exists', () => {
    const slugs = FORM_TEMPLATES.map((template) => template.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const template of FORM_TEMPLATES) {
      expect(template.slug, template.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      if (template.presetId) {
        expect(THEME_PRESETS.some((preset) => preset.id === template.presetId)).toBe(true);
      }
    }
    expect(templateBySlug('wedding-rsvp')?.id).toBe('wedding_rsvp');
    expect(templateBySlug('blank')).toBeUndefined();
  });

  it('writes search descriptions of a useful length', () => {
    for (const template of galleryTemplates()) {
      expect(template.seoDescription.length, template.id).toBeGreaterThan(80);
      expect(template.seoDescription.length, template.id).toBeLessThanOrEqual(170);
    }
  });

  it.each(FORM_TEMPLATE_IDS)('%s builds a valid schema that can be published as it is', (id) => {
    const schema = getFormTemplate(id).build();
    expect(formSchema.safeParse(schema).error?.issues).toBeUndefined();
    if (id !== 'blank') expect(findPublishIssues(schema)).toEqual([]);
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

  it('marks quizzes with a right answer for every question', () => {
    const { fields, logic } = getFormTemplate('general_knowledge_quiz').build();
    const questions = fields.filter((field) => field.type === 'single_choice');
    expect(logic.quiz?.enabled).toBe(true);
    expect(Object.keys(logic.quiz?.answers ?? {}).sort()).toEqual(
      questions.map((question) => question.id).sort(),
    );
    const mars = questions[0];
    const answer = logic.quiz?.answers[mars?.id ?? ''];
    expect(
      mars && 'options' in mars ? mars.options.find((o) => o.id === answer?.correct[0])?.label : '',
    ).toBe('Mars');
  });

  it('starts blank forms empty', () => {
    expect(getFormTemplate('blank').build().fields).toEqual([]);
  });
});
