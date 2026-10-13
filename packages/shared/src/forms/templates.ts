import { createEmptyForm } from './factories.js';
import type { FormTemplateId } from './template-ids.js';
import { BUSINESS_TEMPLATES } from './templates/business.js';
import type { FormTemplate, TemplateCategory } from './templates/builders.js';
import { COMMUNITY_TEMPLATES } from './templates/community.js';
import { EDUCATION_TEMPLATES } from './templates/education.js';
import { EVENT_TEMPLATES } from './templates/events.js';
import { FEEDBACK_TEMPLATES } from './templates/feedback.js';
import { HR_TEMPLATES } from './templates/hr.js';
import { QUIZ_TEMPLATES } from './templates/quizzes.js';

export {
  TEMPLATE_CATEGORIES,
  TEMPLATE_CATEGORY_LABELS,
  type FormTemplate,
  type TemplateCategory,
} from './templates/builders.js';

const BLANK: FormTemplate = {
  id: 'blank',
  slug: 'blank',
  name: 'Blank form',
  description: 'Start from scratch and add your own questions.',
  seoDescription: 'Start from a blank form and build exactly what you need.',
  category: null,
  presetId: null,
  defaultTitle: 'Untitled form',
  build: createEmptyForm,
};

/** Every template: blank first, then the gallery's, by category. */
export const FORM_TEMPLATES: readonly FormTemplate[] = [
  BLANK,
  ...EVENT_TEMPLATES,
  ...FEEDBACK_TEMPLATES,
  ...HR_TEMPLATES,
  ...EDUCATION_TEMPLATES,
  ...BUSINESS_TEMPLATES,
  ...QUIZ_TEMPLATES,
  ...COMMUNITY_TEMPLATES,
];

export function getFormTemplate(id: FormTemplateId): FormTemplate {
  const template = FORM_TEMPLATES.find((candidate) => candidate.id === id);
  if (!template) throw new Error(`Unknown form template "${id}"`);
  return template;
}

/** The template at /templates/<slug>, if there is one. */
export function templateBySlug(slug: string): FormTemplate | undefined {
  return FORM_TEMPLATES.find((template) => template.slug === slug && template.category !== null);
}

/** The gallery's templates (blank isn't one), optionally of one category. */
export function galleryTemplates(category?: TemplateCategory): FormTemplate[] {
  return FORM_TEMPLATES.filter(
    (template) => template.category !== null && (!category || template.category === category),
  );
}
