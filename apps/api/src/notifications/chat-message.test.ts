import {
  createEmptyForm,
  createField,
  createOption,
  type FormSchema,
  type SubmissionRecord,
} from '@formyx/shared';
import { describe, expect, it } from 'vitest';
import { CHAT_ANSWER_LIMIT, chatMessageBody } from './chat-message.js';

const yes = createOption('Yes');
const name = { ...createField('short_text'), id: 'fld_name', label: 'Name' };
const coming = {
  ...createField('single_choice'),
  id: 'fld_coming',
  label: 'Coming?',
  options: [yes],
};
const story = { ...createField('long_text'), id: 'fld_story', label: 'Tell us more' };
const SCHEMA: FormSchema = { ...createEmptyForm(), fields: [name, coming, story] };

const submission: SubmissionRecord = {
  id: 'sub_1',
  createdAt: '2026-10-12T09:30:00.000Z',
  completionTimeMs: 30_000,
  answers: {
    fld_name: '<@U123> & friends',
    fld_coming: yes.id,
    fld_story:
      'A long answer that goes on for well over sixty characters, so it takes the full width.',
  },
  metadata: { userAgent: null, referrer: null },
  outcome: {
    endScreenId: 'end',
    values: {},
    quiz: { score: 8, max: 10, percent: 80, passed: true },
  },
  respondentEmail: 'ada@example.com',
};

const input = {
  formTitle: 'Party <RSVP>',
  schema: SCHEMA,
  submission,
  responseUrl: 'https://formyx.app/app/forms/form_1/responses?response=sub_1',
  accentColor: '#c2410c',
};

interface SlackBody {
  text: string;
  blocks: {
    type: string;
    text?: { text: string };
    fields?: { text: string }[];
    elements?: { text?: string; url?: string }[];
  }[];
}

describe('Slack messages', () => {
  const body = JSON.parse(chatMessageBody('slack', input)) as SlackBody;

  it('heads the message with the form and links the response with a button', () => {
    expect(body.blocks[0]).toEqual({
      type: 'header',
      text: { type: 'plain_text', text: 'New response: Party <RSVP>', emoji: false },
    });
    expect(body.blocks.at(-1)?.elements?.[0]?.url).toBe(input.responseUrl);
    expect(body.text).toContain(input.responseUrl);
  });

  it('puts short answers side by side, long ones on their own, escaped', () => {
    const [, pairs, long] = body.blocks;
    expect(pairs?.fields?.map((field) => field.text)).toEqual([
      '*Name*\n&lt;@U123&gt; &amp; friends',
      '*Coming?*\nYes',
    ]);
    expect(long?.text?.text).toMatch(/^\*Tell us more\*\nA long answer/);
  });

  it('says who and when, with the quiz score', () => {
    const context = body.blocks.find((block) => block.type === 'context');
    expect(context?.elements?.[0]?.text).toBe(
      '<!date^1791797400^{date_short_pretty} at {time}|2026-10-12T09:30:00.000Z>  ·  ada@example.com  ·  Score 8/10 (80%, passed)',
    );
  });

  it('says how many answers it left out', () => {
    const many = {
      ...SCHEMA,
      fields: Array.from({ length: CHAT_ANSWER_LIMIT + 2 }, (_, index) => ({
        ...createField('short_text'),
        id: `fld_${index}`,
        label: `Q${index}`,
      })),
    };
    const answers = Object.fromEntries(many.fields.map((field) => [field.id, 'x']));
    const crowded = JSON.parse(
      chatMessageBody('slack', { ...input, schema: many, submission: { ...submission, answers } }),
    ) as SlackBody;
    const context = crowded.blocks.find((block) => block.type === 'context');
    expect(context?.elements?.[0]?.text).toContain('and 2 more answers');
  });

  it('calls a changed response a change', () => {
    const changed = JSON.parse(
      chatMessageBody('slack', { ...input, change: 'updated' }),
    ) as SlackBody;
    expect(changed.blocks[0]?.text?.text).toBe('Response changed: Party <RSVP>');
  });
});

describe('Discord messages', () => {
  const body = JSON.parse(chatMessageBody('discord', input)) as {
    allowed_mentions: { parse: string[] };
    embeds: {
      title: string;
      url: string;
      color: number;
      fields: { name: string; value: string; inline: boolean }[];
      footer: { text: string };
    }[];
  };
  const [embed] = body.embeds;

  it('never mentions anyone, whatever the answers say', () => {
    expect(body.allowed_mentions).toEqual({ parse: [] });
  });

  it('shows the answers as fields, short ones inline, in the form’s colour', () => {
    expect(embed?.title).toBe('New response: Party <RSVP>');
    expect(embed?.url).toBe(input.responseUrl);
    expect(embed?.color).toBe(0xc2410c);
    expect(embed?.fields.map(({ name: label, inline }) => [label, inline])).toEqual([
      ['Name', true],
      ['Coming?', true],
      ['Tell us more', false],
    ]);
    expect(embed?.footer.text).toBe('ada@example.com · Score 8/10 (80%, passed)');
  });
});
