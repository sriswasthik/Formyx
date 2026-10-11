import { isShownQuestionType, type Field, type FormTheme } from '@formyx/shared';

type Numbering = FormTheme['typography']['questionNumbering'];

/** 1 → A, 26 → Z, 27 → AA, as spreadsheet columns count. */
function letters(position: number): string {
  let rest = position;
  let label = '';
  while (rest > 0) {
    const index = (rest - 1) % 26;
    label = String.fromCharCode(65 + index) + label;
    rest = Math.floor((rest - 1) / 26);
  }
  return label;
}

/**
 * The number shown before each question, by field id. Questions are counted in the order
 * given (pass the ones respondents can see); statements are not questions and get none.
 */
export function questionNumbers(
  fields: readonly Pick<Field, 'id' | 'type'>[],
  numbering: Numbering,
): Map<string, string> {
  const numbers = new Map<string, string>();
  if (numbering === 'none') return numbers;
  let position = 0;
  for (const field of fields) {
    if (!isShownQuestionType(field.type)) continue;
    position += 1;
    numbers.set(field.id, numbering === 'letter' ? letters(position) : String(position));
  }
  return numbers;
}
