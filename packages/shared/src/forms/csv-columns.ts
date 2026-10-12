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
import type { StoredOutcome } from './responses.js';

/** A spreadsheet cell: text, a number or empty. */
export type CsvCell = string | number | null;

export interface CsvColumn {
  /**
   * Stays the same when the question is renamed (`<field id>`, or `<field id>:<row or part>`),
   * so a Google Sheet keeps each answer in its column.
   */
  key: string;
  /** Which kind of value it holds, for spreadsheets that format columns. */
  kind: 'text' | 'number' | 'date';
  header: string;
  /** This column's cell for one response's answers. */
  cell: (answers: Readonly<Record<string, unknown>>) => CsvCell;
}

/** Questions whose answers are numbers. */
const NUMBER_TYPES = new Set<Field['type']>(['number', 'rating', 'nps', 'opinion_scale']);

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
        key: `${field.id}:${row.id}`,
        kind: 'text',
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
        key: `${field.id}:${part}`,
        kind: 'text',
        header: `${label} (${ADDRESS_PART_LABELS[part]})`,
        cell: (answers) => {
          const answer = value(answers);
          return isAddressAnswer(answer) ? (answer[part] ?? null) : null;
        },
      }));
    case 'date_range':
      return (['start', 'end'] as const).map((part) => ({
        key: `${field.id}:${part}`,
        kind: 'date',
        header: `${label} (${part})`,
        cell: (answers) => {
          const answer = value(answers);
          return isDateRangeAnswer(answer) ? answer[part] : null;
        },
      }));
    case 'currency':
      return [
        {
          key: field.id,
          kind: 'number',
          header: `${label} (${field.currency})`,
          cell: (answers) => csvCell(field, value(answers)),
        },
      ];
    case 'slider':
      return [
        {
          key: field.id,
          kind: 'number',
          header: field.unit.trim() ? `${label} (${field.unit.trim()})` : label,
          cell: (answers) => csvCell(field, value(answers)),
        },
      ];
    default:
      return [
        {
          key: field.id,
          kind: NUMBER_TYPES.has(field.type) ? 'number' : field.type === 'date' ? 'date' : 'text',
          header: label,
          cell: (answers) => csvCell(field, value(answers)),
        },
      ];
  }
}

/** Every answer column of `schema`'s export, in form order. */
export function csvAnswerColumns(schema: FormSchema): CsvColumn[] {
  return answerableFields(schema).flatMap(csvColumnsFor);
}

export interface CsvOutcomeColumn {
  /** Stays the same when a variable or end screen is renamed. */
  key: string;
  kind: 'text' | 'number';
  header: string;
  /** This column's cell for one response's outcome (`null` before Sprint 13). */
  cell: (outcome: StoredOutcome | null) => CsvCell;
}

/** The name of an end screen as people know it. */
export function endScreenLabel(schema: Pick<FormSchema, 'logic'>, id: string): string {
  const index = schema.logic.endScreens.findIndex((screen) => screen.id === id);
  const screen = schema.logic.endScreens[index];
  if (!screen) return 'Removed end screen';
  return (
    screen.name.trim() ||
    screen.title.trim() ||
    (index === 0 ? 'Default end screen' : `End screen ${index + 1}`)
  );
}

/**
 * The columns a response's outcome takes in an export: the quiz score, each variable, and
 * the end screen when there is more than one. All as the server worked them out.
 */
export function csvOutcomeColumns(schema: Pick<FormSchema, 'logic'>): CsvOutcomeColumn[] {
  const { logic } = schema;
  const columns: CsvOutcomeColumn[] = [];
  if (logic.quiz?.enabled) {
    columns.push(
      {
        key: 'quiz:score',
        kind: 'number',
        header: 'Quiz score',
        cell: (outcome) => outcome?.quiz?.score ?? null,
      },
      {
        key: 'quiz:max',
        kind: 'number',
        header: 'Quiz points possible',
        cell: (outcome) => outcome?.quiz?.max ?? null,
      },
      {
        key: 'quiz:percent',
        kind: 'number',
        header: 'Quiz score (%)',
        cell: (outcome) => outcome?.quiz?.percent ?? null,
      },
    );
    if (logic.quiz.passPercent !== undefined) {
      columns.push({
        key: 'quiz:passed',
        kind: 'text',
        header: 'Passed',
        cell: (outcome) => {
          const passed = outcome?.quiz?.passed;
          return passed === undefined || passed === null ? null : passed ? 'Yes' : 'No';
        },
      });
    }
  }
  logic.variables.forEach((variable, index) => {
    columns.push({
      key: `var:${variable.id}`,
      kind: 'number',
      header: variable.name.trim() || `Variable ${index + 1}`,
      cell: (outcome) => outcome?.values[variable.id] ?? null,
    });
  });
  if (logic.endScreens.length > 1) {
    columns.push({
      key: 'end-screen',
      kind: 'text',
      header: 'End screen',
      cell: (outcome) => (outcome ? endScreenLabel(schema, outcome.endScreenId) : null),
    });
  }
  return columns;
}
