import type { FormMessages } from '@formyx/shared';
import {
  COLOR,
  emailPage,
  escapeHtml,
  heading,
  paragraph as p,
  singleLine,
  type RenderedEmail,
} from './email-layout.js';

export interface CodeEmailInput {
  formTitle: string;
  code: string;
  /** The form's language: respondents read this email, not its creators. */
  messages: FormMessages;
}

/** The code that confirms a respondent's address, for one response per person. */
export function renderCodeEmail({ formTitle, code, messages }: CodeEmailInput): RenderedEmail {
  const title = singleLine(formTitle) || 'Formyx';
  const subject = messages.email.codeSubject(title);
  const intro = messages.email.codeText(title);
  const ignore = messages.email.codeIgnore;

  const html = emailPage({
    subject,
    preheader: code,
    card: `${heading(title)}
        ${p(`font-size:14px;line-height:21px;color:${COLOR.text};margin-top:8px;`, escapeHtml(intro))}
        ${p(`font-size:28px;line-height:36px;font-weight:600;letter-spacing:6px;color:${COLOR.text};margin-top:16px;font-variant-numeric:tabular-nums;`, escapeHtml(code))}
        ${p(`font-size:13px;line-height:20px;color:${COLOR.muted};margin-top:16px;`, escapeHtml(ignore))}`,
    footer: escapeHtml(messages.email.why(title)),
  });

  return { subject, html, text: [intro, '', code, '', ignore].join('\n') };
}
