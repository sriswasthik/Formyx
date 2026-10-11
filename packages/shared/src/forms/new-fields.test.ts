import { describe, expect, it } from 'vitest';
import {
  addSubmissionToSummaries,
  averageRanks,
  createQuestionSummaries,
  npsBreakdown,
  type MatrixSummary,
  type NpsSummary,
  type QuestionSummary,
  type RankingSummary,
  type ValuesSummary,
} from './analytics.js';
import { formatAnswer, formatCurrency } from './answer-format.js';
import { normalizeHexColor, normalizeWebsiteUrl, parseVideoUrl } from './answer-values.js';
import { csvAnswerColumns } from './csv-columns.js';
import { createEmptyForm, createField, createOption } from './factories.js';
import type { Field, FieldOfType } from './fields.js';
import type { FileAnswer } from './files.js';
import type { FormSchema } from './form-schema.js';
import { migrateFormSchema } from './migrate-form-schema.js';
import { formatPhone, phoneNumberProblem, splitPhone, toE164, getPhoneCountry } from './phone.js';
import { findPublishIssues } from './publish.js';
import { escapeRichText, parseRichText, richTextToPlain } from './rich-text.js';
import { buildSubmissionValidator, validateAnswer } from './submission.js';

function form(...fields: Field[]): FormSchema {
  return { ...createEmptyForm(), fields };
}

const required = <T extends Field>(field: T): T => ({ ...field, required: true });

function upload(name: string, size: number, type: string): FileAnswer {
  return {
    url: `https://res.cloudinary.com/demo/raw/upload/v1/formyx/forms/f/${name}`,
    publicId: `formyx/forms/f/${name}`,
    name,
    size,
    type,
  };
}

const pictures: FieldOfType<'picture_choice'> = {
  ...createField('picture_choice'),
  options: [
    { id: 'cat', label: 'Cat', imageUrl: 'https://res.cloudinary.com/demo/cat.png' },
    { id: 'dog', label: 'Dog', imageUrl: 'https://res.cloudinary.com/demo/dog.png' },
  ],
};
const ranking: FieldOfType<'ranking'> = {
  ...createField('ranking'),
  options: [
    { id: 'a', label: 'Price' },
    { id: 'b', label: 'Speed' },
    { id: 'c', label: 'Support' },
  ],
};
const matrix: FieldOfType<'matrix'> = {
  ...createField('matrix'),
  label: 'Rate us',
  rows: [
    { id: 'r1', label: 'Food' },
    { id: 'r2', label: 'Service' },
  ],
  columns: [
    { id: 'c1', label: 'Poor' },
    { id: 'c2', label: 'Good' },
  ],
};
const slider: FieldOfType<'slider'> = {
  ...createField('slider'),
  min: 0,
  max: 10,
  step: 0.5,
  unit: 'kg',
};
const address = { line1: '12 MG Road', pin: '560001', city: 'Bengaluru', state: 'Karnataka' };

describe('validateAnswer for the new question types', () => {
  it.each<[string, Field, unknown, string | null]>([
    ['single picture', pictures, 'cat', null],
    ['unknown picture', pictures, 'cow', 'Choose a picture'],
    ['several pictures', { ...pictures, multiple: true }, ['cat', 'dog'], null],
    [
      'several pictures with a stranger',
      { ...pictures, multiple: true },
      ['cat', 'x'],
      'Choose from the pictures',
    ],
    ['yes', createField('yes_no'), 'yes', null],
    ['maybe', createField('yes_no'), 'maybe', 'Choose yes or no'],
    ['NPS 0', createField('nps'), 0, null],
    ['NPS 11', createField('nps'), 11, 'Pick a score from 0 to 10'],
    ['NPS 7.5', createField('nps'), 7.5, 'Pick a score from 0 to 10'],
    ['opinion in range', createField('opinion_scale'), 5, null],
    ['opinion below the start', createField('opinion_scale'), 0, 'Pick a value from 1 to 5'],
    ['slider on a step', slider, 7.5, null],
    ['slider between steps', slider, 7.3, 'Pick a value in steps of 0.5'],
    ['slider past the end', slider, 11, 'Pick a value from 0 to 10'],
    ['full ranking', ranking, ['c', 'a', 'b'], null],
    ['partial ranking', ranking, ['c', 'a'], 'Put every option in order'],
    ['ranking with a repeat', ranking, ['c', 'c', 'a'], 'Put every option in order'],
    ['matrix', matrix, { r1: 'c1', r2: 'c2' }, null],
    ['matrix with an unknown column', matrix, { r1: 'c9' }, 'Choose from the columns'],
    [
      'matrix with several in a single row',
      matrix,
      { r1: ['c1', 'c2'] },
      'Choose from the columns',
    ],
    ['multi matrix', { ...matrix, multiple: true }, { r1: ['c1', 'c2'] }, null],
    ['required matrix missing a row', required(matrix), { r1: 'c1' }, 'Answer every row'],
    ['address', createField('address'), address, null],
    [
      'address with a bad PIN',
      createField('address'),
      { ...address, pin: '012345' },
      'Enter a 6-digit PIN code',
    ],
    ['address without a city', createField('address'), { ...address, city: ' ' }, 'Enter the city'],
    ['time', createField('time'), '23:59', null],
    ['time past midnight', createField('time'), '24:00', 'Enter a valid time'],
    ['date range', createField('date_range'), { start: '2026-10-01', end: '2026-10-03' }, null],
    [
      'backwards date range',
      createField('date_range'),
      { start: '2026-10-03', end: '2026-10-01' },
      'End on or after the start date',
    ],
    [
      'impossible date in a range',
      createField('date_range'),
      { start: '2026-02-30', end: '2026-03-01' },
      'Enter a valid start date',
    ],
    ['website without a scheme', createField('url'), 'example.com/about', null],
    [
      'not a website',
      createField('url'),
      'not a url',
      'Enter a website address, such as example.com',
    ],
    [
      'ftp is not a website',
      createField('url'),
      'ftp://example.com',
      'Enter a website address, such as example.com',
    ],
    ['amount', createField('currency'), 1250.5, null],
    ['amount typed with commas', createField('currency'), '1,25,000.50', null],
    [
      'amount with three decimals',
      createField('currency'),
      10.555,
      'Use at most two decimal places',
    ],
    ['amount as words', createField('currency'), 'ten', 'Enter an amount'],
    [
      'amount below the minimum',
      { ...createField('currency'), validation: { min: 100 } },
      50,
      'Enter at least 100',
    ],
    ['signature', createField('signature'), upload('sig.png', 20_000, 'image/png'), null],
    [
      'signature as a JPEG',
      createField('signature'),
      upload('sig.jpg', 20_000, 'image/jpeg'),
      'This type of file isn’t accepted here',
    ],
    ['voice note', createField('voice_note'), upload('note.webm', 200_000, 'audio/webm'), null],
    [
      'voice note too big',
      createField('voice_note'),
      upload('note.webm', 11 * 1024 * 1024, 'audio/webm'),
      'This file is too big. The limit is 10 MB',
    ],
    ['colour', createField('color'), '#3a7', null],
    ['not a colour', createField('color'), 'blue', 'Pick a colour'],
    ['consent given', createField('consent'), true, null],
    ['consent refused', createField('consent'), false, 'This question is required'],
    ['hidden value', createField('hidden'), 'instagram', null],
    [
      'hidden value too long',
      createField('hidden'),
      'x'.repeat(501),
      'Use 500 characters or fewer',
    ],
    ['Indian mobile', createField('phone'), '+91 98765 43210', null],
    [
      'Indian number too short',
      createField('phone'),
      '+91 98765',
      'Enter a 10-digit Indian number',
    ],
    [
      'Indian number starting 5',
      createField('phone'),
      '+915876543210',
      'Enter a 10-digit Indian number',
    ],
    ['UK number', createField('phone'), '+44 20 7946 0958', null],
    [
      'number without a country code',
      createField('phone'),
      '9876543210',
      'Enter a valid phone number with its country code',
    ],
  ])('%s', (_case, field, value, expected) => {
    expect(validateAnswer(field, value as never)).toBe(expected);
  });

  it('normalises answers as it validates them', () => {
    const url = createField('url');
    const color = createField('color');
    const amount = createField('currency');
    const phone = createField('phone');
    const multi = { ...matrix, multiple: true };
    const parsed = buildSubmissionValidator(form(url, color, amount, phone, multi), {}).parse({
      [url.id]: 'Example.com',
      [color.id]: '3a7',
      [amount.id]: '1,25,000.50',
      [phone.id]: '+91 98765-43210',
      [multi.id]: { r1: ['c1', 'c1'], r2: [] },
    });
    expect(parsed).toEqual({
      [url.id]: 'https://example.com/',
      [color.id]: '#33AA77',
      [amount.id]: 125000.5,
      [phone.id]: '+919876543210',
      [multi.id]: { r1: ['c1'] },
    });
  });

  it('treats blank addresses, date ranges, matrices and unticked boxes as unanswered', () => {
    for (const [field, value] of [
      [createField('address'), { line1: '', pin: '', city: '', state: '' }],
      [createField('date_range'), { start: '', end: '' }],
      [matrix, {}],
      [createField('consent'), false],
    ] as const) {
      expect(validateAnswer({ ...field, required: false }, value as never)).toBeNull();
      expect(validateAnswer({ ...field, required: true }, value as never)).toBe(
        'This question is required',
      );
    }
  });

  it('collects nothing from content blocks', () => {
    for (const type of ['statement', 'image', 'video', 'divider', 'page_break'] as const) {
      const block = createField(type);
      expect(buildSubmissionValidator(form(block), {}).parse({ [block.id]: 'x' })).toEqual({});
    }
  });
});

describe('rich text', () => {
  it('parses bold, italic, links, lists and paragraphs', () => {
    expect(
      parseRichText('**Hello** _you_\nsee [terms](https://example.com/terms)\n\n- one\n- two'),
    ).toEqual([
      {
        type: 'paragraph',
        children: [
          { type: 'strong', children: [{ type: 'text', text: 'Hello' }] },
          { type: 'text', text: ' ' },
          { type: 'em', children: [{ type: 'text', text: 'you' }] },
          { type: 'break' },
          { type: 'text', text: 'see ' },
          {
            type: 'link',
            href: 'https://example.com/terms',
            children: [{ type: 'text', text: 'terms' }],
          },
        ],
      },
      { type: 'list', items: [[{ type: 'text', text: 'one' }], [{ type: 'text', text: 'two' }]] },
    ]);
  });

  it('never makes links out of scripts or other schemes, and never outputs markup', () => {
    const blocks = parseRichText('[click](javascript:alert(1)) <b>bold</b>');
    expect(JSON.stringify(blocks)).not.toContain('"type":"link"');
    expect(richTextToPlain('<script>x</script>')).toBe('<script>x</script>');
  });

  it('escapes plain text so it shows exactly as typed', () => {
    for (const text of ['2 * 3 = 6', 'snake_case and [brackets]', '- not a list', 'a\\b']) {
      expect(richTextToPlain(escapeRichText(text))).toBe(text);
    }
  });
});

describe('phone numbers', () => {
  it('builds, splits and formats E.164 numbers', () => {
    const india = getPhoneCountry('IN');
    if (!india) throw new Error('No India');
    expect(toE164(india, '098765 43210')).toBe('+919876543210');
    expect(splitPhone('+919876543210')).toMatchObject({
      country: { code: 'IN' },
      national: '9876543210',
    });
    expect(splitPhone('+12025550123', 'CA')?.country.code).toBe('CA');
    expect(formatPhone('+919876543210')).toBe('+91 98765 43210');
    expect(phoneNumberProblem('+1 202 555 0123')).toBeNull();
  });
});

describe('helpers', () => {
  it('finds YouTube and Vimeo players, privacy-friendly', () => {
    expect(parseVideoUrl('https://youtu.be/dQw4w9WgXcQ')?.embedUrl).toBe(
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
    );
    expect(parseVideoUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1')?.id).toBe(
      'dQw4w9WgXcQ',
    );
    expect(parseVideoUrl('https://vimeo.com/76979871')?.embedUrl).toBe(
      'https://player.vimeo.com/video/76979871?dnt=1',
    );
    expect(parseVideoUrl('https://example.com/video')).toBeNull();
  });

  it('normalises websites and colours', () => {
    expect(normalizeWebsiteUrl('example.com')).toBe('https://example.com/');
    expect(normalizeWebsiteUrl('localhost')).toBeNull();
    expect(normalizeHexColor('#abcdef')).toBe('#ABCDEF');
  });

  it('writes rupees the Indian way', () => {
    expect(formatCurrency(125000.5, 'INR')).toBe('₹1,25,000.50');
    expect(formatCurrency(10, 'USD')).toBe('$10.00');
  });
});

describe('formatAnswer for the new question types', () => {
  it.each<[Field, unknown, string]>([
    [pictures, 'dog', 'Dog'],
    [ranking, ['c', 'a', 'b'], '1. Support; 2. Price; 3. Speed'],
    [matrix, { r1: 'c2', r2: 'c1' }, 'Food: Good; Service: Poor'],
    [createField('yes_no'), 'no', 'No'],
    [createField('consent'), true, 'Agreed'],
    [slider, 7.5, '7.5 kg'],
    [createField('currency'), 1500, '₹1,500.00'],
    [
      createField('address'),
      { ...address, line2: 'Flat 4' },
      '12 MG Road, Flat 4, Bengaluru, Karnataka 560001',
    ],
    [
      createField('date_range'),
      { start: '2026-10-01', end: '2026-10-03' },
      '2026-10-01 to 2026-10-03',
    ],
    [createField('phone'), '+919876543210', '+91 98765 43210'],
    [createField('voice_note'), upload('note.webm', 10, 'audio/webm'), 'note.webm'],
  ])('%s', (field, value, expected) => {
    expect(formatAnswer(field, value)).toBe(expected);
  });
});

describe('CSV columns', () => {
  it('gives matrices a column per row, addresses per part and ranges per end', () => {
    const where = { ...createField('address'), label: 'Address' };
    const when = { ...createField('date_range'), label: 'Stay' };
    const amount = { ...createField('currency'), label: 'Budget' };
    const weight = { ...slider, label: 'Weight' };
    const columns = csvAnswerColumns(
      form(matrix, where, when, amount, weight, createField('divider')),
    );
    expect(columns.map((column) => column.header)).toEqual([
      'Rate us: Food',
      'Rate us: Service',
      'Address (Address line 1)',
      'Address (Address line 2)',
      'Address (PIN code)',
      'Address (City)',
      'Address (State)',
      'Stay (start)',
      'Stay (end)',
      'Budget (INR)',
      'Weight (kg)',
    ]);
    const answers = {
      [matrix.id]: { r2: 'c1' },
      [where.id]: address,
      [when.id]: { start: '2026-10-01', end: '2026-10-03' },
      [amount.id]: 1500.25,
      [weight.id]: 7.5,
    };
    expect(columns.map((column) => column.cell(answers))).toEqual([
      null,
      'Poor',
      '12 MG Road',
      null,
      '560001',
      'Bengaluru',
      'Karnataka',
      '2026-10-01',
      '2026-10-03',
      1500.25,
      7.5,
    ]);
  });

  it('exports uploads as links and the rest as text', () => {
    const voice = createField('voice_note');
    const consent = createField('consent');
    const [voiceColumn, consentColumn] = csvAnswerColumns(form(voice, consent));
    const note = upload('note.webm', 10, 'audio/webm');
    expect(voiceColumn?.cell({ [voice.id]: note })).toBe(note.url);
    expect(consentColumn?.cell({ [consent.id]: true })).toBe('Agreed');
  });
});

describe('analytics for the new question types', () => {
  function summarise(field: Field, values: unknown[]): QuestionSummary {
    const [summary] = createQuestionSummaries(form(field));
    if (!summary) throw new Error('No summary');
    values.forEach((value, index) => {
      addSubmissionToSummaries([summary], {
        id: `s${index}`,
        createdAt: '2026-10-11T10:00:00.000Z',
        completionTimeMs: null,
        answers: { [field.id]: value },
      });
    });
    return summary;
  }

  it('scores NPS: % promoters minus % detractors', () => {
    const summary = summarise(createField('nps'), [10, 9, 9, 8, 7, 6, 0, 3, 10, 12]) as NpsSummary;
    expect(summary.answered).toBe(9);
    expect(npsBreakdown(summary)).toEqual({ promoters: 4, passives: 2, detractors: 3, score: 11 });
    expect(npsBreakdown(summarise(createField('nps'), []) as NpsSummary).score).toBeNull();
  });

  it('averages each option’s place in rankings, best first', () => {
    const summary = summarise(ranking, [
      ['a', 'b', 'c'],
      ['b', 'a', 'c'],
      ['b', 'c', 'a'],
    ]) as RankingSummary;
    expect(averageRanks(summary)).toEqual([
      { id: 'b', label: 'Speed', average: 4 / 3 },
      { id: 'a', label: 'Price', average: 2 },
      { id: 'c', label: 'Support', average: 8 / 3 },
    ]);
  });

  it('counts each column per matrix row', () => {
    const summary = summarise({ ...matrix, multiple: true }, [
      { r1: ['c1'], r2: ['c1', 'c2'] },
      { r1: ['c2'] },
      {},
    ]) as MatrixSummary;
    expect(summary.answered).toBe(2);
    expect(summary.rows).toEqual([
      { id: 'r1', label: 'Food', answered: 2, counts: [1, 1] },
      { id: 'r2', label: 'Service', answered: 1, counts: [1, 1] },
    ]);
  });

  it('counts where hidden fields came from', () => {
    const summary = summarise(createField('hidden'), [
      'instagram',
      'email',
      'instagram',
      '',
    ]) as ValuesSummary;
    expect(summary.values).toEqual([
      { value: 'instagram', count: 2 },
      { value: 'email', count: 1 },
    ]);
  });

  it('summarises yes/no and consent as choices, and amounts as numbers', () => {
    expect(summarise(createField('yes_no'), ['yes', 'no', 'yes'])).toMatchObject({
      kind: 'choice',
      options: [
        { id: 'yes', count: 2 },
        { id: 'no', count: 1 },
      ],
    });
    expect(summarise(createField('consent'), [true, true])).toMatchObject({
      kind: 'choice',
      options: [{ id: 'agreed', count: 2 }],
    });
    expect(summarise(createField('currency'), [100, 300])).toMatchObject({
      kind: 'number',
      sum: 400,
      currency: 'INR',
    });
  });
});

describe('schema v2', () => {
  it('upgrades v1 forms: statements escaped, phones on India, ratings as numbers', () => {
    const v1 = {
      version: 1,
      fields: [
        { id: 's', type: 'statement', label: 'Price * 2 = cost', required: false },
        { id: 'p', type: 'phone', label: 'Phone', required: true },
        { id: 'r', type: 'rating', label: 'Rate', required: false, ratingScale: 5 },
      ],
      settings: createEmptyForm().settings,
    };
    const v2 = migrateFormSchema(v1);
    expect(v2.version).toBe(2);
    const [statement, phone, rating] = v2.fields;
    expect(statement?.label).toBe('Price \\* 2 = cost');
    expect(richTextToPlain(statement?.label ?? '')).toBe('Price * 2 = cost');
    expect(phone).toMatchObject({ defaultCountry: 'IN' });
    expect(rating).toMatchObject({ ratingStyle: 'numbers' });
  });

  it('checks slider and scale ranges', () => {
    expect(() => migrateFormSchema(form({ ...slider, min: 5, max: 5 }))).toThrow();
    expect(() =>
      migrateFormSchema(form({ ...createField('opinion_scale'), start: 1, end: 1 })),
    ).toThrow();
  });
});

describe('publishing the new question types', () => {
  const paths = (...fields: Field[]) =>
    findPublishIssues(form(...fields)).map((issue) => issue.path);
  const question = { ...createField('short_text'), label: 'Name' };

  it('needs pictures, alt text, a video link and valid hidden parameters', () => {
    const picture = { ...pictures, label: 'Pet', options: [{ ...createOption('Cat') }] };
    const image = createField('image');
    const video = { ...createField('video'), videoUrl: 'https://example.com/clip' };
    const hiddenA = createField('hidden');
    const hiddenB = { ...createField('hidden'), paramName: 'source' };
    const badHidden = { ...createField('hidden'), paramName: 'has space' };
    expect(paths(question, picture, image, video, hiddenA, hiddenB, badHidden)).toEqual([
      'fields.1.options.0.imageUrl',
      'fields.2.imageUrl',
      'fields.2.alt',
      'fields.3.videoUrl',
      'fields.5.paramName',
      'fields.6.paramName',
    ]);
  });

  it('needs enough ranking options, and named matrix rows and columns', () => {
    const shortRanking = { ...ranking, label: 'Order', options: [{ id: 'a', label: 'Only' }] };
    const emptyMatrix = { ...matrix, rows: [], columns: [{ id: 'c', label: '' }] };
    expect(paths(shortRanking, emptyMatrix)).toEqual([
      'fields.0.options',
      'fields.1.rows',
      'fields.1.columns.0.label',
    ]);
  });

  it('lets dividers, page breaks and blocks without labels through', () => {
    expect(paths(question, createField('divider'), createField('page_break'))).toEqual([]);
  });
});
