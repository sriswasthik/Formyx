import {
  answerableFields,
  formatAnswer,
  type Field,
  type FormSchema,
  type SubmissionRecord,
} from '@formyx/shared';
import {
  button,
  COLOR,
  emailPage,
  escapeHtml,
  heading,
  paragraph as p,
  singleLine,
  type RenderedEmail,
} from './email-layout.js';

export { escapeHtml } from './email-layout.js';

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
  const title = singleLine(input.formTitle) || 'Untitled form';
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

  const html = emailPage({
    subject,
    preheader: `Submitted ${when}`,
    card: `${p(`font-size:13px;line-height:20px;color:${COLOR.muted};`, 'New response')}
        ${heading(title)}
        ${p(`font-size:13px;line-height:20px;color:${COLOR.muted};`, `Submitted ${escapeHtml(when)}`)}
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:20px;">${answerRows}${hiddenRow}
        </table>
        ${button('View response', input.responseUrl)}`,
    footer: `You're getting this because you turned on emails about new responses to this form. <a href="${escapeHtml(input.settingsUrl)}" style="color:${COLOR.link};">Turn them off</a>`,
  });

  return { subject, html, text };
}
