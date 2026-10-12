import type { ValidationIssue } from '../errors.js';
import { isSameJson } from '../json.js';
import { operatorNeedsValue } from './conditions.js';
import { parseVideoUrl } from './answer-values.js';
import { isAnswerableFieldType, type FieldType } from './field-types.js';
import { MIN_RANKING_OPTIONS, URL_PARAM_PATTERN } from './fields.js';
import type { FormSchema } from './form-schema.js';
import { findLogicPublishIssues } from './logic-publish.js';

/** What to say when a field's `label` is empty, or `null` where it may be. */
function missingLabelMessage(type: FieldType): string | null {
  switch (type) {
    case 'statement':
      return 'Write the text';
    case 'consent':
      return 'Write what respondents agree to';
    case 'hidden':
      return 'Name this field, for your responses';
    // An image has its alt text, a video its link; dividers and page breaks need nothing.
    case 'image':
    case 'video':
    case 'divider':
    case 'page_break':
      return null;
    default:
      return 'Write the question';
  }
}

/**
 * What stands between a draft and publishing it. Drafts may be unfinished; a published form
 * needs a label on every question and option, options on choice questions, and a value on
 * every condition. Paths match the draft's, so editors can point at the right input.
 */
export function findPublishIssues(schema: FormSchema): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!schema.fields.some((field) => isAnswerableFieldType(field.type))) {
    issues.push({ path: 'fields', message: 'Add at least one question that takes an answer' });
  }

  const paramNames = new Set<string>();
  schema.fields.forEach((field, index) => {
    const at = `fields.${index}`;
    const issue = (key: string, message: string) => {
      issues.push({ path: `${at}.${key}`, message });
    };
    const label = missingLabelMessage(field.type);
    if (label && field.label.trim() === '') issue('label', label);

    if ('options' in field) {
      const minimum = field.type === 'ranking' ? MIN_RANKING_OPTIONS : 1;
      if (field.options.length < minimum) {
        issue(
          'options',
          minimum === 1 ? 'Add at least one option' : `Add at least ${minimum} options`,
        );
      }
      field.options.forEach((option, optionIndex) => {
        if (option.label.trim() === '') issue(`options.${optionIndex}.label`, 'Name this option');
        if (field.type === 'picture_choice' && !('imageUrl' in option && option.imageUrl)) {
          issue(`options.${optionIndex}.imageUrl`, 'Add a picture');
        }
      });
    }

    switch (field.type) {
      case 'matrix':
        for (const key of ['rows', 'columns'] as const) {
          if (field[key].length === 0) issue(key, `Add at least one ${key.slice(0, -1)}`);
          field[key].forEach((item, itemIndex) => {
            if (item.label.trim() === '') issue(`${key}.${itemIndex}.label`, 'Name this one');
          });
        }
        break;
      case 'image':
        if (!field.imageUrl) issue('imageUrl', 'Add an image');
        if (field.alt.trim() === '')
          issue('alt', 'Describe the image for people who cannot see it');
        break;
      case 'video':
        if (!parseVideoUrl(field.videoUrl)) issue('videoUrl', 'Use a YouTube or Vimeo link');
        break;
      case 'hidden':
        if (!URL_PARAM_PATTERN.test(field.paramName)) {
          issue('paramName', 'Use letters, digits, - and _ for the link parameter');
        } else if (paramNames.has(field.paramName)) {
          issue('paramName', 'Another hidden field already uses this parameter');
        }
        paramNames.add(field.paramName);
        break;
      default:
        break;
    }

    field.conditions?.forEach((condition, conditionIndex) => {
      const { operator, value } = condition;
      const missing = value === undefined || (typeof value === 'string' && value.trim() === '');
      if (operatorNeedsValue(operator) && missing) {
        issues.push({
          path: `${at}.conditions.${conditionIndex}.value`,
          message: 'Choose a value for this condition',
        });
      }
    });
  });

  issues.push(...findLogicPublishIssues(schema));
  return issues;
}

/**
 * Whether two schemas say the same thing. Postgres `jsonb` reorders object keys, so a stored
 * snapshot and an in-memory draft can differ in key order alone.
 */
export function isSameFormSchema(a: FormSchema | null, b: FormSchema | null): boolean {
  if (a === null || b === null) return a === b;
  return isSameJson(a, b);
}

/** Every picture a form shows: picture-choice options, image blocks and end screens. */
export function schemaImageUrls(schema: Pick<FormSchema, 'fields' | 'logic'>): string[] {
  const urls = [
    ...schema.fields.flatMap((field) => {
      if (field.type === 'picture_choice') return field.options.map((option) => option.imageUrl);
      if (field.type === 'image') return [field.imageUrl];
      return [];
    }),
    ...schema.logic.endScreens.map((screen) => screen.imageUrl),
  ];
  return [...new Set(urls.filter((url): url is string => url !== undefined))];
}
