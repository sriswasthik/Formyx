import { z } from 'zod';
import type { Field } from '../forms/fields.js';
import type { FormSchema } from '../forms/form-schema.js';
import type { SubmissionRecord } from '../forms/responses.js';
import {
  planSheetColumns,
  RESPONSE_ID_KEY,
  type SheetCell,
  type SheetColumn,
  type SheetSources,
} from './sheet-columns.js';

/*
 * How a form's responses fill a Notion database: a property per column of the Google Sheet
 * export (the same keys, so renames and new questions behave the same), typed for Notion:
 * choices as selects, emails as emails, dates as dates. Each response is a page, titled with
 * when it arrived.
 */

export const NOTION_PROPERTY_TYPES = [
  'title',
  'rich_text',
  'number',
  'select',
  'multi_select',
  'date',
  'email',
  'phone_number',
  'url',
  'checkbox',
] as const;
export type NotionPropertyType = (typeof NOTION_PROPERTY_TYPES)[number];

export const notionPropertySchema = z.object({
  key: z.string().min(1).max(200),
  /** The property's name in Notion; unique in the database. */
  name: z.string().min(1).max(200),
  type: z.enum(NOTION_PROPERTY_TYPES),
});
export type NotionProperty = z.infer<typeof notionPropertySchema>;

export const notionConfigSchema = z.object({
  /** The page people shared, where the database lives. */
  parentPageId: z.string().optional(),
  parentTitle: z.string().optional(),
  databaseId: z.string().optional(),
  databaseUrl: z.url().optional(),
  properties: z.array(notionPropertySchema).default([]),
});
export type NotionConfig = z.infer<typeof notionConfigSchema>;

/** The title property: each page is named for when the response arrived. */
export const NOTION_TITLE_KEY = 'meta:title';
const TITLE_NAME = 'Response';
/** Notion's limits. */
const TEXT_LIMIT = 2000;
const OPTION_LIMIT = 100;

const FIELD_TYPES: Partial<Record<Field['type'], NotionPropertyType>> = {
  email: 'email',
  phone: 'phone_number',
  url: 'url',
  single_choice: 'select',
  dropdown: 'select',
  yes_no: 'select',
  multi_choice: 'multi_select',
  consent: 'checkbox',
  number: 'number',
  rating: 'number',
  nps: 'number',
  opinion_scale: 'number',
  currency: 'number',
  slider: 'number',
  date: 'date',
};

function propertyType(column: SheetColumn, fields: Map<string, Field>): NotionPropertyType {
  if (column.key === 'meta:email') return 'email';
  if (column.kind === 'date' || column.kind === 'datetime') return 'date';
  const [, fieldId, part] = column.key.split(':');
  if (column.key.startsWith('field:') && fieldId) {
    const field = fields.get(fieldId);
    // A question with parts (an address, a matrix row) has text in each part.
    if (field && part === undefined) return FIELD_TYPES[field.type] ?? 'rich_text';
    return 'rich_text';
  }
  if (column.key === 'outcome:quiz:passed' || column.key === 'outcome:end-screen') return 'select';
  return column.kind === 'number' ? 'number' : 'rich_text';
}

/** Names made unique, as Notion needs: a second "Name" becomes "Name (2)". */
function uniqueName(wanted: string, taken: Set<string>): string {
  const base = wanted.trim().slice(0, 190) || 'Untitled';
  let name = base;
  for (let count = 2; taken.has(name.toLowerCase()); count += 1) name = `${base} (${count})`;
  taken.add(name.toLowerCase());
  return name;
}

export interface NotionPlan {
  properties: NotionProperty[];
  /** New properties to add to the database. */
  added: NotionProperty[];
  /** Properties whose name changed: rename `from` to `to`. */
  renamed: { from: string; to: string }[];
  /** A response's property values, as Notion's API takes them. */
  values: (submission: SubmissionRecord) => Record<string, unknown>;
}

const textValue = (text: string) => [
  { type: 'text', text: { content: text.slice(0, TEXT_LIMIT) } },
];
/** Select option names: no commas, and short. */
const optionName = (text: string) => text.replace(/,/g, ' ').trim().slice(0, OPTION_LIMIT);

function cellText(cell: SheetCell): string | null {
  if (cell === null) return null;
  if (typeof cell === 'string') return cell;
  if (typeof cell === 'number') return String(cell);
  return 'date' in cell ? cell.date : cell.datetime;
}

function propertyValue(
  type: NotionPropertyType,
  cell: SheetCell,
  answer: unknown,
  field: Field | undefined,
): unknown {
  const text = cellText(cell);
  switch (type) {
    case 'title':
    case 'rich_text':
      return { [type]: text ? textValue(text) : [] };
    case 'number': {
      const number = typeof cell === 'number' ? cell : Number(text);
      return { number: text === null || Number.isNaN(number) ? null : number };
    }
    case 'select':
      return { select: text ? { name: optionName(text) } : null };
    case 'multi_select': {
      const labels =
        field && 'options' in field && Array.isArray(answer)
          ? answer.map(
              (id) => field.options.find((option) => option.id === id)?.label ?? String(id),
            )
          : text
            ? [text]
            : [];
      return {
        multi_select: [...new Set(labels.map(optionName).filter(Boolean))].map((name) => ({
          name,
        })),
      };
    }
    case 'date':
      return { date: text ? { start: text } : null };
    case 'checkbox':
      return { checkbox: answer === true || text === 'Yes' };
    default:
      return { [type]: text || null };
  }
}

const shortTime = (iso: string) => `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;

/**
 * The database's properties for `schema`, starting from the ones it has (`previous`, or `null`
 * for a new database).
 */
export function planNotionProperties(
  previous: readonly NotionProperty[] | null,
  schema: FormSchema | null,
  sources: SheetSources,
): NotionPlan {
  const fields = new Map((schema?.fields ?? []).map((field) => [field.id, field]));
  const prior = previous ?? [];
  const sheetPrevious = prior
    .filter((property) => property.key !== NOTION_TITLE_KEY)
    .map((property) => ({ key: property.key, header: property.name, kind: 'text' as const }));
  const sheet = planSheetColumns(previous ? sheetPrevious : null, schema, sources);
  const byKey = new Map(prior.map((property) => [property.key, property]));

  const taken = new Set<string>();
  const properties: NotionProperty[] = [];
  const added: NotionProperty[] = [];
  const renamed: { from: string; to: string }[] = [];

  const title = byKey.get(NOTION_TITLE_KEY) ?? {
    key: NOTION_TITLE_KEY,
    name: uniqueName(TITLE_NAME, new Set()),
    type: 'title' as const,
  };
  taken.add(title.name.toLowerCase());
  properties.push(title);
  if (!byKey.has(NOTION_TITLE_KEY)) added.push(title);

  // Names already in the database stay theirs, so a rename never collides with them.
  for (const property of prior) {
    if (property.key !== NOTION_TITLE_KEY) taken.add(property.name.toLowerCase());
  }
  for (const column of sheet.columns) {
    const existing = byKey.get(column.key);
    if (existing) {
      let name = existing.name;
      if (column.header !== existing.name) {
        taken.delete(existing.name.toLowerCase());
        name = uniqueName(column.header, taken);
        if (name !== existing.name) renamed.push({ from: existing.name, to: name });
      }
      properties.push({ ...existing, name });
      continue;
    }
    const property = {
      key: column.key,
      name: uniqueName(column.header, taken),
      type: propertyType(column, fields),
    };
    properties.push(property);
    added.push(property);
  }

  const columnIndex = new Map(sheet.columns.map((column, index) => [column.key, index]));
  return {
    properties,
    added,
    renamed,
    values: (submission) => {
      const cells = sheet.row(submission);
      const values: Record<string, unknown> = {};
      for (const property of properties) {
        if (property.key === NOTION_TITLE_KEY) {
          values[property.name] = {
            title: textValue(`Response · ${shortTime(submission.createdAt)}`),
          };
          continue;
        }
        const index = columnIndex.get(property.key);
        const cell = index === undefined ? null : (cells[index] ?? null);
        const fieldId = property.key.startsWith('field:') ? property.key.split(':')[1] : undefined;
        const field = fieldId ? fields.get(fieldId) : undefined;
        values[property.name] = propertyValue(
          property.type,
          cell,
          fieldId ? submission.answers[fieldId] : undefined,
          field,
        );
      }
      return values;
    },
  };
}

/** The property that holds the response id, for finding a response's page. */
export function notionIdProperty(properties: readonly NotionProperty[]): string | null {
  return properties.find((property) => property.key === RESPONSE_ID_KEY)?.name ?? null;
}
