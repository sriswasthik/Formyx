import {
  answerableFields,
  formatAnswer,
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

/** Responses listed in a digest; the rest are a click away. */
export const DIGEST_RESPONSE_LIMIT = 10;
/** Answers shown for each listed response. */
const DIGEST_ANSWERS_PER_RESPONSE = 3;
const ANSWER_MAX_LENGTH = 140;

export interface DigestEmailInput {
  formTitle: string;
  schema: FormSchema | null;
  /** The day's responses, newest first. */
  submissions: SubmissionRecord[];
  total: number;
  responsesUrl: string;
  /** Where the digest can be switched back to an email per response. */
  settingsUrl: string;
}

function shorten(text: string): string {
  return text.length > ANSWER_MAX_LENGTH
    ? `${text.slice(0, ANSWER_MAX_LENGTH - 1).trimEnd()}…`
    : text;
}

/** One email a day listing a form's new responses, instead of one per response. */
export function renderDigestEmail(input: DigestEmailInput): RenderedEmail {
  const title = singleLine(input.formTitle) || 'your form';
  const count = `${input.total} new ${input.total === 1 ? 'response' : 'responses'}`;
  const subject = `${count} to ${title}`;
  const fields = input.schema ? answerableFields(input.schema) : [];

  const summaries = input.submissions.slice(0, DIGEST_RESPONSE_LIMIT).map((submission) => {
    const answers = fields
      .map((field) => ({ field, value: submission.answers[field.id] }))
      .filter(({ value }) => value !== undefined)
      .slice(0, DIGEST_ANSWERS_PER_RESPONSE)
      .map(({ field, value }) => ({
        label: singleLine(field.label) || 'Untitled question',
        value: shorten(formatAnswer(field, value)),
      }));
    return { at: submission.createdAt, answers };
  });
  const more = input.total - summaries.length;

  const text = [
    subject,
    '',
    ...summaries.flatMap(({ at, answers }) => [
      at,
      ...answers.map(({ label, value }) => `  ${label}: ${value}`),
      '',
    ]),
    ...(more > 0 ? [`And ${more} more.`, ''] : []),
    `See them all: ${input.responsesUrl}`,
  ].join('\n');

  const rows = summaries
    .map(
      ({ at, answers }) =>
        `<tr><td style="padding:12px 0;border-top:1px solid ${COLOR.border};">
          ${p(`font-size:12px;line-height:18px;color:${COLOR.muted};`, escapeHtml(at.replace('T', ' ').slice(0, 16)))}
          ${answers
            .map(({ label, value }) =>
              p(
                `font-size:14px;line-height:21px;color:${COLOR.text};margin-top:4px;`,
                `<span style="color:${COLOR.muted};">${escapeHtml(label)}:</span> ${escapeHtml(value)}`,
              ),
            )
            .join('')}
        </td></tr>`,
    )
    .join('');

  const html = emailPage({
    subject,
    preheader: count,
    card: `${heading(title)}
        ${p(`font-size:14px;line-height:21px;color:${COLOR.muted};margin-top:4px;`, escapeHtml(`${count} in the last day.`))}
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px;">${rows}</table>
        ${more > 0 ? p(`font-size:13px;line-height:20px;color:${COLOR.muted};margin-top:8px;`, escapeHtml(`And ${more} more.`)) : ''}
        ${button('See all responses', input.responsesUrl)}`,
    footer: `This form sends a daily digest. <a href="${escapeHtml(input.settingsUrl)}" style="color:${COLOR.link};">Change its notifications</a>.`,
  });

  return { subject, html, text };
}
