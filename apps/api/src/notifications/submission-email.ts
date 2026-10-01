import {
  answerableFields,
  formatAnswer,
  type Field,
  type FormSchema,
  type SubmissionRecord,
} from '@formyx/shared';

/** Answers shown in the email; the rest are a click away. */
export const EMAIL_ANSWER_LIMIT = 10;
const ANSWER_MAX_LENGTH = 500;

export interface SubmissionEmailInput {
  formTitle: string;
  /** The published form, for question labels. */
  schema: FormSchema | null;
  submission: SubmissionRecord;
  /** Opens this response in the dashboard. */
  responseUrl: string;
  /** Where the notification setting can be turned off. */
  settingsUrl: string;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

const FONT = `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif`;
const COLOR = {
  page: '#fafafa',
  card: '#ffffff',
  border: '#e4e4e7',
  text: '#09090b',
  muted: '#71717a',
  button: '#18181b',
  buttonText: '#fafafa',
  link: '#2e5aac',
} as const;

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Text safe to put in HTML content and attributes. */
export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (character) => HTML_ESCAPES[character] ?? character);
}

function shorten(text: string): string {
  return text.length > ANSWER_MAX_LENGTH
    ? `${text.slice(0, ANSWER_MAX_LENGTH - 1).trimEnd()}…`
    : text;
}

function answerText(field: Field, value: unknown): string {
  if (field.type === 'rating' && typeof value === 'number')
    return `${value} / ${field.ratingScale}`;
  return shorten(formatAnswer(field, value));
}

interface ShownAnswer {
  label: string;
  value: string;
}

function shownAnswers(input: SubmissionEmailInput): { shown: ShownAnswer[]; hidden: number } {
  const answered = (input.schema ? answerableFields(input.schema) : [])
    .map((field) => ({ field, value: input.submission.answers[field.id] }))
    .filter(({ value }) => value !== undefined)
    .map(({ field, value }) => ({
      label: field.label.trim() || 'Untitled question',
      value: answerText(field, value),
    }))
    .filter(({ value }) => value !== '');
  return {
    shown: answered.slice(0, EMAIL_ANSWER_LIMIT),
    hidden: Math.max(0, answered.length - EMAIL_ANSWER_LIMIT),
  };
}

function submittedAt(iso: string): string {
  const formatted = new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(new Date(iso));
  return `${formatted} UTC`;
}

function moreAnswers(hidden: number): string {
  return `and ${hidden} more ${hidden === 1 ? 'answer' : 'answers'}`;
}

/** A plain, table-based email (the layout email clients render reliably), plus a text part. */
export function renderSubmissionEmail(input: SubmissionEmailInput): RenderedEmail {
  // A title is a single line; never let one reach the subject header with a line break.
  const title = input.formTitle.replace(/\s+/g, ' ').trim() || 'Untitled form';
  const subject = `New response to ${title}`;
  const when = submittedAt(input.submission.createdAt);
  const { shown, hidden } = shownAnswers(input);

  const text = [
    `New response to ${title}`,
    `Submitted ${when}`,
    '',
    ...shown.flatMap(({ label, value }) => [label, value, '']),
    ...(hidden > 0 ? [`…${moreAnswers(hidden)}.`, ''] : []),
    `View the response: ${input.responseUrl}`,
    '',
    `You're getting this because you turned on emails about new responses to this form. Turn them off: ${input.settingsUrl}`,
  ].join('\n');

  const p = (style: string, content: string) =>
    `<p style="margin:0;font-family:${FONT};${style}">${content}</p>`;

  const answerRows = shown
    .map(
      ({ label, value }) => `
          <tr><td style="padding:12px 0;border-top:1px solid ${COLOR.border};">
            ${p(`font-size:13px;line-height:20px;font-weight:500;color:${COLOR.muted};`, escapeHtml(label))}
            ${p(
              `font-size:14px;line-height:21px;color:${COLOR.text};white-space:pre-wrap;word-break:break-word;`,
              escapeHtml(value),
            )}
          </td></tr>`,
    )
    .join('');
  const hiddenRow =
    hidden > 0
      ? `<tr><td style="padding:12px 0;border-top:1px solid ${COLOR.border};">${p(
          `font-size:13px;line-height:20px;color:${COLOR.muted};`,
          `…${moreAnswers(hidden)}`,
        )}</td></tr>`
      : '';

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:${COLOR.page};">
<div style="display:none;max-height:0;overflow:hidden;">${escapeHtml(`Submitted ${when}`)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLOR.page};">
  <tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
      <tr><td style="padding:0 4px 16px;">
        ${p(`font-size:14px;line-height:21px;font-weight:600;color:${COLOR.text};`, 'Formyx')}
      </td></tr>
      <tr><td style="background:${COLOR.card};border:1px solid ${COLOR.border};border-radius:12px;padding:24px;">
        ${p(`font-size:13px;line-height:20px;color:${COLOR.muted};`, 'New response')}
        <h1 style="margin:4px 0;font-family:${FONT};font-size:20px;line-height:28px;font-weight:600;letter-spacing:-0.2px;color:${COLOR.text};">${escapeHtml(title)}</h1>
        ${p(`font-size:13px;line-height:20px;color:${COLOR.muted};`, `Submitted ${escapeHtml(when)}`)}
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:20px;">${answerRows}${hiddenRow}
        </table>
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:20px;">
          <tr><td style="border-radius:8px;background:${COLOR.button};">
            <a href="${escapeHtml(input.responseUrl)}" style="display:inline-block;padding:10px 16px;font-family:${FONT};font-size:14px;line-height:20px;font-weight:500;color:${COLOR.buttonText};text-decoration:none;border-radius:8px;">View response</a>
          </td></tr>
        </table>
      </td></tr>
      <tr><td style="padding:16px 4px 0;">
        ${p(
          `font-size:12px;line-height:18px;color:${COLOR.muted};`,
          `You're getting this because you turned on emails about new responses to this form. <a href="${escapeHtml(input.settingsUrl)}" style="color:${COLOR.link};">Turn them off</a>`,
        )}
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>
`;

  return { subject, html, text };
}
