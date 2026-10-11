import { DRAFT_LIFETIME_DAYS } from '@formyx/shared';
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

export interface DraftEmailInput {
  formTitle: string;
  /** Opens the form with the saved answers; the secret token is in its fragment. */
  resumeUrl: string;
}

/** The link a respondent sends themselves to finish a form later. */
export function renderDraftEmail(input: DraftEmailInput): RenderedEmail {
  const title = singleLine(input.formTitle) || 'your form';
  const subject = `Finish ${title}`;
  const summary = 'Your answers are saved. Pick up where you left off whenever you are ready.';
  const expiry = `The link works for ${DRAFT_LIFETIME_DAYS} days. Anyone with it can see your answers, so keep it to yourself.`;

  const text = [subject, '', summary, '', `Carry on: ${input.resumeUrl}`, '', expiry].join('\n');

  const html = emailPage({
    subject,
    preheader: summary,
    card: `${heading(title)}
        ${p(`font-size:14px;line-height:21px;color:${COLOR.text};margin-top:8px;`, escapeHtml(summary))}
        ${button('Continue the form', input.resumeUrl)}
        ${p(`font-size:13px;line-height:20px;color:${COLOR.muted};margin-top:16px;`, escapeHtml(expiry))}`,
    footer: "You asked to save your answers to this form. If that wasn't you, ignore this email.",
  });

  return { subject, html, text };
}
