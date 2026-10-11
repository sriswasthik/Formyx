import type { Field } from '../forms/fields.js';
import type { FormSchema } from '../forms/form-schema.js';
import { formPages } from '../forms/page-layout.js';
import type { Redirect } from '../forms/logic-schema.js';
import type { Answers } from '../forms/answers.js';
import { pipedAnswer, resolvePiping, type PipingContext } from './piping.js';
import { seededShuffle, shuffleOptions } from './shuffle.js';

/*
 * How a form looks to one respondent: answers piped into its text, and questions and
 * options in their own shuffled order.
 */

/**
 * The fields in the order this respondent sees them: page by page, each page's questions
 * shuffled when the page asks for it. Page breaks stay where they are.
 */
export function displayOrder<T extends Field>(
  schema: Pick<FormSchema, 'logic'> & { fields: readonly T[] },
  seed: string,
): T[] {
  return formPages(schema.fields).flatMap((page) => {
    const shuffle = schema.logic.pages[page.key]?.shuffleQuestions === true;
    const fields = shuffle ? seededShuffle(page.fields, seed, page.key) : page.fields;
    return page.pageBreak ? [page.pageBreak, ...fields] : fields;
  });
}

/**
 * A field as this respondent sees it: earlier answers piped into its label and description,
 * its options in their shuffled order. The same object when neither applies, so memoised
 * rendering keeps working.
 */
export function presentField<T extends Field>(
  field: T,
  context: { piping: PipingContext; seed: string },
): T {
  let presented: T = field;
  const richLabel = field.type === 'statement';
  if (field.label.includes('{{')) {
    presented = {
      ...presented,
      label: resolvePiping(field.label, context.piping, { richText: richLabel }),
    };
  }
  if (field.description?.includes('{{')) {
    presented = { ...presented, description: resolvePiping(field.description, context.piping) };
  }
  if ('options' in field && field.shuffleOptions) {
    presented = {
      ...presented,
      options: shuffleOptions(field.options, context.seed, field.id, field.keepLastOption),
    };
  }
  return presented;
}

/**
 * Where an end screen sends the respondent: its URL with the chosen answers and values
 * added as query parameters (keeping any the URL already has). `null` unless it is https.
 */
export function buildRedirectUrl(
  redirect: Pick<Redirect, 'url' | 'params'>,
  context: {
    fieldById: ReadonlyMap<string, Field>;
    answers: Answers;
    values: Readonly<Record<string, number>>;
  },
): string | null {
  let url: URL;
  try {
    url = new URL(redirect.url.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  for (const param of redirect.params) {
    if (param.name.trim() === '') continue;
    let value = '';
    if (param.source.kind === 'answer') {
      const field = context.fieldById.get(param.source.fieldId);
      value = field ? pipedAnswer(field, context.answers[field.id]) : '';
    } else {
      // Plain numbers, so the page receiving them can read them.
      const raw = context.values[param.source.variableId];
      value = raw === undefined ? '' : String(raw);
    }
    url.searchParams.set(param.name, value);
  }
  return url.toString();
}
