import type { FormSchema } from '../forms/form-schema.js';

/**
 * The form as respondents receive it: the quiz's right answers left out, so they cannot be
 * read from the page. The server marks the quiz and picks the end screen after submitting.
 */
export function toPublicSchema(schema: FormSchema): FormSchema {
  const { quiz } = schema.logic;
  if (!quiz) return schema;
  return { ...schema, logic: { ...schema.logic, quiz: { ...quiz, answers: {} } } };
}
