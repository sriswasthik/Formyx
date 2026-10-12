import {
  answerableFields,
  formatAnswer,
  type ChatService,
  type FormSchema,
  type SubmissionRecord,
} from '@formyx/shared';

/*
 * Responses as chat messages: Slack Block Kit and Discord embeds. Each shows the form's
 * title, the answers (short ones side by side, long ones on their own line), who and when,
 * and a button or link to the response. What respondents typed is escaped for Slack's markup,
 * and Discord is told never to turn it into mentions, so an answer of "@everyone" pings nobody.
 */

/** Answers shown in the message; the rest are a click away. */
export const CHAT_ANSWER_LIMIT = 10;
const ANSWER_MAX_LENGTH = 300;
/** Longer answers, or ones with line breaks, take the full width. */
const SHORT_ANSWER_LENGTH = 60;
const DISCORD_ACCENT = 0x2e5aac;

export interface ChatMessageInput {
  formTitle: string;
  schema: FormSchema | null;
  submission: SubmissionRecord;
  /** Opens this response in the dashboard. */
  responseUrl: string;
  /** A new response, or one its respondent changed. */
  change?: 'created' | 'updated';
  /** The form's main colour (`#2e5aac`), for Discord's stripe. */
  accentColor?: string | null;
}

interface ShownAnswer {
  label: string;
  value: string;
  short: boolean;
}

function shorten(text: string, max = ANSWER_MAX_LENGTH): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

function shownAnswers({ schema, submission }: ChatMessageInput): {
  shown: ShownAnswer[];
  hidden: number;
} {
  const answered = (schema ? answerableFields(schema) : [])
    .map((field) => ({ field, value: submission.answers[field.id] }))
    .filter(({ value }) => value !== undefined)
    .map(({ field, value }) => {
      const text = shorten(formatAnswer(field, value));
      return {
        label: shorten(field.label.trim() || 'Untitled question', 200),
        value: text,
        short: text.length <= SHORT_ANSWER_LENGTH && !text.includes('\n'),
      };
    });
  return {
    shown: answered.slice(0, CHAT_ANSWER_LIMIT),
    hidden: Math.max(0, answered.length - CHAT_ANSWER_LIMIT),
  };
}

/** Slack's markup characters, escaped as its docs ask. */
function slackEscape(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Discord markdown, made literal. */
function discordEscape(text: string): string {
  return text.replace(/[\\*_~`|>[\]()#-]/g, '\\$&');
}

function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** The quiz mark, when the form is a quiz. */
function quizText(submission: SubmissionRecord): string | null {
  const quiz = submission.outcome?.quiz;
  if (!quiz) return null;
  const passed = quiz.passed === null ? '' : quiz.passed ? ', passed' : ', not passed';
  return `Score ${quiz.score}/${quiz.max} (${quiz.percent}%${passed})`;
}

function hexColor(color: string | null | undefined): number {
  const match = /^#?([0-9a-f]{6})$/i.exec(color ?? '');
  return match?.[1] ? Number.parseInt(match[1], 16) : DISCORD_ACCENT;
}

function slackBody(input: ChatMessageInput): string {
  const title = oneLine(input.formTitle) || 'your form';
  const { shown, hidden } = shownAnswers(input);
  const heading =
    input.change === 'updated' ? `Response changed: ${title}` : `New response: ${title}`;
  const field = (answer: ShownAnswer) => ({
    type: 'mrkdwn',
    text: `*${slackEscape(oneLine(answer.label))}*\n${slackEscape(answer.value) || '—'}`,
  });

  // Short answers two to a row (ten per section at most); long ones each on their own.
  const blocks: object[] = [
    { type: 'header', text: { type: 'plain_text', text: shorten(heading, 150), emoji: false } },
  ];
  let pairs: ShownAnswer[] = [];
  const flush = () => {
    for (let index = 0; index < pairs.length; index += 10) {
      blocks.push({ type: 'section', fields: pairs.slice(index, index + 10).map(field) });
    }
    pairs = [];
  };
  for (const answer of shown) {
    if (answer.short) {
      pairs.push(answer);
    } else {
      flush();
      blocks.push({ type: 'section', text: field(answer) });
    }
  }
  flush();

  const seconds = Math.floor(Date.parse(input.submission.createdAt) / 1000);
  const context = [
    `<!date^${seconds}^{date_short_pretty} at {time}|${input.submission.createdAt}>`,
    ...(input.submission.respondentEmail ? [slackEscape(input.submission.respondentEmail)] : []),
    ...(quizText(input.submission) ? [quizText(input.submission) ?? ''] : []),
    ...(hidden > 0 ? [`and ${hidden} more ${hidden === 1 ? 'answer' : 'answers'}`] : []),
  ];
  blocks.push(
    { type: 'context', elements: [{ type: 'mrkdwn', text: context.join('  ·  ') }] },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'View response' },
          url: input.responseUrl,
          style: 'primary',
        },
      ],
    },
  );

  return JSON.stringify({
    // Shown in notifications, and where blocks can't be.
    text: `${heading}: ${input.responseUrl}`,
    blocks,
    unfurl_links: false,
    unfurl_media: false,
  });
}

function discordBody(input: ChatMessageInput): string {
  const title = oneLine(input.formTitle) || 'your form';
  const { shown, hidden } = shownAnswers(input);
  const footer = [
    ...(input.submission.respondentEmail ? [input.submission.respondentEmail] : []),
    ...(quizText(input.submission) ? [quizText(input.submission) ?? ''] : []),
    ...(hidden > 0 ? [`and ${hidden} more ${hidden === 1 ? 'answer' : 'answers'}`] : []),
  ].join(' · ');

  return JSON.stringify({
    // Nothing in an answer may mention a person, a role or everyone.
    allowed_mentions: { parse: [] },
    embeds: [
      {
        title: shorten(
          input.change === 'updated' ? `Response changed: ${title}` : `New response: ${title}`,
          256,
        ),
        url: input.responseUrl,
        color: hexColor(input.accentColor),
        fields: shown.map((answer) => ({
          name: shorten(oneLine(answer.label), 256),
          value: shorten(discordEscape(answer.value) || '—', 1024),
          inline: answer.short,
        })),
        ...(footer && { footer: { text: shorten(footer, 2048) } }),
        timestamp: input.submission.editedAt ?? input.submission.createdAt,
      },
    ],
  });
}

/** The JSON body to post to `service`'s incoming webhook. */
export function chatMessageBody(service: ChatService, input: ChatMessageInput): string {
  return service === 'slack' ? slackBody(input) : discordBody(input);
}

/** A short message for the "Send test" button. */
export function chatTestBody(service: ChatService, formTitle: string): string {
  const title = oneLine(formTitle) || 'your form';
  return service === 'slack'
    ? JSON.stringify({ text: `Formyx will post new responses to *${slackEscape(title)}* here.` })
    : JSON.stringify({
        allowed_mentions: { parse: [] },
        content: `Formyx will post new responses to **${discordEscape(title)}** here.`,
      });
}
