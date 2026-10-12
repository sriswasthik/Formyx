import {
  answerableFields,
  formatAnswer,
  type ChatService,
  type FormSchema,
  type SubmissionRecord,
} from '@formyx/shared';

/*
 * New responses as chat messages: the form's title, the first few answers and a link to the
 * response. What respondents typed is escaped for Slack's markup, and Discord is told never
 * to turn it into mentions, so an answer of "@everyone" pings nobody.
 */

/** Answers shown in the message; the rest are a click away. */
export const CHAT_ANSWER_LIMIT = 10;
const ANSWER_MAX_LENGTH = 300;
const DISCORD_ACCENT = 0x2e5aac;

export interface ChatMessageInput {
  formTitle: string;
  schema: FormSchema | null;
  submission: SubmissionRecord;
  /** Opens this response in the dashboard. */
  responseUrl: string;
}

interface ShownAnswer {
  label: string;
  value: string;
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
    .map(({ field, value }) => ({
      label: shorten(field.label.trim() || 'Untitled question', 200),
      value: shorten(formatAnswer(field, value)),
    }));
  return {
    shown: answered.slice(0, CHAT_ANSWER_LIMIT),
    hidden: Math.max(0, answered.length - CHAT_ANSWER_LIMIT),
  };
}

/** Slack's markup characters, escaped as its docs ask. */
function slackEscape(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** The JSON body to post to `service`'s incoming webhook. */
export function chatMessageBody(service: ChatService, input: ChatMessageInput): string {
  const title = oneLine(input.formTitle) || 'your form';
  const { shown, hidden } = shownAnswers(input);
  const more = hidden > 0 ? `and ${hidden} more ${hidden === 1 ? 'answer' : 'answers'}` : '';

  if (service === 'slack') {
    const lines = shown.map(
      (answer) => `*${slackEscape(oneLine(answer.label))}*\n${slackEscape(answer.value)}`,
    );
    const text = [
      `New response to *${slackEscape(title)}*`,
      ...lines,
      ...(more ? [`_${more}_`] : []),
      `<${input.responseUrl}|View the response>`,
    ].join('\n\n');
    return JSON.stringify({ text, unfurl_links: false, unfurl_media: false });
  }

  return JSON.stringify({
    // Nothing in an answer may mention a person, a role or everyone.
    allowed_mentions: { parse: [] },
    embeds: [
      {
        title: shorten(`New response to ${title}`, 256),
        url: input.responseUrl,
        color: DISCORD_ACCENT,
        fields: shown.map((answer) => ({
          name: shorten(oneLine(answer.label), 256),
          value: shorten(answer.value || '—', 1024),
        })),
        ...(more && { footer: { text: more } }),
        timestamp: input.submission.createdAt,
      },
    ],
  });
}

/** A short message for the "Send test" button. */
export function chatTestBody(service: ChatService, formTitle: string): string {
  const title = oneLine(formTitle) || 'your form';
  return service === 'slack'
    ? JSON.stringify({ text: `Formyx will post new responses to *${slackEscape(title)}* here.` })
    : JSON.stringify({
        allowed_mentions: { parse: [] },
        content: `Formyx will post new responses to **${title.replace(/[*_~`|>]/g, '\\$&')}** here.`,
      });
}
