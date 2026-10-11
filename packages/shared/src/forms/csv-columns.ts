import { formatAnswer, matrixCell, answerableFields } from './answer-format.js';
import {
  ADDRESS_PARTS,
  ADDRESS_PART_LABELS,
  isAddressAnswer,
  isDateRangeAnswer,
  isMatrixAnswer,
} from './answer-values.js';
import type { Field } from './fields.js';
import { isFileAnswer } from './files.js';
import type { FormSchema } from './form-schema.js';

/** A spreadsheet cell: text, a number or empty. */
export type CsvCell = string | number | null;

export interface CsvColumn {
  header: string;
  /** This column's cell for one response's answers. */
  cell: (answers: Readonly<Record<string, unknown>>) => CsvCell;
}

function questionLabel(field: Field): string {
  return field.label.trim() || 'Untitled question';
}

/**
 * One answer as a single cell. Numbers stay numeric, so spreadsheets can sum and chart them;
 * files export as a link to download them; everything else as text.
 */
export function csvCell(field: Field, value: unknown): CsvCell {
  if (value === undefined || value === null) return null;
  if (typeof value === 'number') return value;
  if (isFileAnswer(value)) return value.url;
  return formatAnswer(field, value);
}

/**
 * The columns a question takes in an export. Most take one; a matrix takes one per row, an
 * address one per part and a date range two, so each can be sorted and filtered on its own.
 */
export function csvColumnsFor(field: Field): CsvColumn[] {
  const label = questionLabel(field);
  const value = (answers: Readonly<Record<string, unknown>>) => answers[field.id];

  switch (field.type) {
    case 'matrix':
      return field.rows.map((row) => ({
        header: `${label}: ${row.label.trim() || 'Untitled row'}`,
        cell: (answers) => {
          const answer = value(answers);
          if (!isMatrixAnswer(answer)) return null;
          const text = matrixCell(field, answer[row.id]);
          return text === '' ? null : text;
        },
      }));
    case 'address':
      return ADDRESS_PARTS.map((part) => ({
        header: `${label} (${ADDRESS_PART_LABELS[part]})`,
        cell: (answers) => {
          const answer = value(answers);
          return isAddressAnswer(answer) ? (answer[part] ?? null) : null;
        },
      }));
    case 'date_range':
      return (['start', 'end'] as const).map((part) => ({
        header: `${label} (${part})`,
        cell: (answers) => {
          const answer = value(answers);
          return isDateRangeAnswer(answer) ? answer[part] : null;
        },
      }));
    case 'currency':
      return [
        {
          header: `${label} (${field.currency})`,
          cell: (answers) => csvCell(field, value(answers)),
        },
      ];
    case 'slider':
      return [
        {
          header: field.unit.trim() ? `${label} (${field.unit.trim()})` : label,
          cell: (answers) => csvCell(field, value(answers)),
        },
      ];
    default:
      return [{ header: label, cell: (answers) => csvCell(field, value(answers)) }];
  }
}

/** Every answer column of `schema`'s export, in form order. */
export function csvAnswerColumns(schema: FormSchema): CsvColumn[] {
  return answerableFields(schema).flatMap(csvColumnsFor);
}
