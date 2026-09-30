import { z } from 'zod';
import { createDefaultSettings, createEmptyForm, createField, createOption } from './factories.js';
import type { ChoiceFieldType, FieldType } from './field-types.js';
import type { FieldOfType } from './fields.js';
import { FORM_SCHEMA_VERSION, type FormSchema } from './form-schema.js';

export const FORM_TEMPLATE_IDS = ['blank', 'event_registration', 'feedback_survey'] as const;
export const formTemplateIdSchema = z.enum(FORM_TEMPLATE_IDS);
export type FormTemplateId = z.infer<typeof formTemplateIdSchema>;

export interface FormTemplate {
  id: FormTemplateId;
  name: string;
  description: string;
  /** Title of a form created from the template. */
  defaultTitle: string;
  /** A fresh schema with new ids on every call. */
  build: () => FormSchema;
}

type FieldProps<T extends FieldType> = Partial<Omit<FieldOfType<T>, 'id' | 'type'>>;

function field<T extends FieldType>(type: T, props: FieldProps<T>): FieldOfType<T> {
  return { ...createField(type), ...props };
}

function choice<T extends ChoiceFieldType>(
  type: T,
  labels: string[],
  props: FieldProps<T>,
): FieldOfType<T> {
  return { ...createField(type), options: labels.map(createOption), ...props };
}

/** Id of the option labelled `label`; templates use it to point conditions at options. */
function optionId(target: { options: { id: string; label: string }[] }, label: string): string {
  const option = target.options.find((candidate) => candidate.label === label);
  if (!option) throw new Error(`Template option "${label}" does not exist`);
  return option.id;
}

function buildEventRegistration(): FormSchema {
  const diet = choice('dropdown', ['None', 'Vegetarian', 'Vegan', 'Gluten-free', 'Other'], {
    label: 'Dietary requirements',
    placeholder: 'Select one',
  });

  return {
    version: FORM_SCHEMA_VERSION,
    fields: [
      field('short_text', { label: 'Full name', required: true, placeholder: 'Ada Lovelace' }),
      field('email', {
        label: 'Email',
        description: 'We will send your ticket here.',
        required: true,
        placeholder: 'you@example.com',
      }),
      field('phone', {
        label: 'Phone number',
        description: 'Only used if we need to reach you on the day.',
      }),
      choice(
        'multi_choice',
        [
          'Opening keynote',
          'Design systems workshop',
          'Building for accessibility',
          'Evening networking',
        ],
        { label: 'Which sessions will you attend?', required: true },
      ),
      diet,
      field('long_text', {
        label: 'Tell us about your dietary needs',
        placeholder: 'Allergies, intolerances or preferences',
        conditions: [
          { sourceFieldId: diet.id, operator: 'equals', value: optionId(diet, 'Other') },
        ],
      }),
      field('number', {
        label: 'How many guests are you bringing?',
        description: 'Up to 5 per registration.',
        placeholder: '0',
        validation: { min: 0, max: 5 },
      }),
      choice('single_choice', ['Newsletter', 'Social media', 'A friend or colleague', 'Other'], {
        label: 'How did you hear about the event?',
      }),
      field('statement', {
        label:
          "That's everything. We'll email your ticket and the full schedule a week before the event.",
      }),
    ],
    settings: {
      ...createDefaultSettings(),
      submitButtonText: 'Register',
      successMessage: "You're registered! Check your inbox for a confirmation email.",
    },
  };
}

function buildFeedbackSurvey(): FormSchema {
  const satisfaction = field('rating', {
    label: 'Overall, how satisfied are you with our product?',
    required: true,
    ratingScale: 5,
  });
  const followUp = choice('single_choice', ['Yes', 'No'], {
    label: 'May we follow up with you about your feedback?',
    required: true,
  });

  return {
    version: FORM_SCHEMA_VERSION,
    fields: [
      satisfaction,
      field('rating', {
        label: 'How likely are you to recommend us to a friend or colleague?',
        description: '1 is not at all likely, 10 is extremely likely.',
        required: true,
        ratingScale: 10,
      }),
      field('long_text', { label: 'What do you like most?' }),
      field('long_text', {
        label: 'What could we do better?',
        description: 'The more specific, the better.',
        conditions: [{ sourceFieldId: satisfaction.id, operator: 'less_than', value: 4 }],
      }),
      choice('multi_choice', ['Form builder', 'Conditional logic', 'Analytics', 'Integrations'], {
        label: 'Which features do you use most?',
      }),
      followUp,
      field('email', {
        label: 'Your email',
        required: true,
        placeholder: 'you@example.com',
        conditions: [
          { sourceFieldId: followUp.id, operator: 'equals', value: optionId(followUp, 'Yes') },
        ],
      }),
    ],
    settings: {
      ...createDefaultSettings(),
      submitButtonText: 'Send feedback',
      successMessage: 'Thank you! Your feedback helps us build a better product.',
    },
  };
}

export const FORM_TEMPLATES: readonly FormTemplate[] = [
  {
    id: 'blank',
    name: 'Blank form',
    description: 'Start from scratch and add your own questions.',
    defaultTitle: 'Untitled form',
    build: createEmptyForm,
  },
  {
    id: 'event_registration',
    name: 'Event registration',
    description: 'Collect attendee details, session choices and dietary needs.',
    defaultTitle: 'Event registration',
    build: buildEventRegistration,
  },
  {
    id: 'feedback_survey',
    name: 'Feedback survey',
    description: 'Measure satisfaction and learn what to improve, with smart follow-ups.',
    defaultTitle: 'Feedback survey',
    build: buildFeedbackSurvey,
  },
];

export function getFormTemplate(id: FormTemplateId): FormTemplate {
  const template = FORM_TEMPLATES.find((candidate) => candidate.id === id);
  if (!template) throw new Error(`Unknown form template "${id}"`);
  return template;
}
