import { contrastRatio, readableTextColor } from '../color.js';
import type { Answers } from '../forms/answers.js';
import { isAnswerableFieldType } from '../forms/field-types.js';
import type { FormSchema } from '../forms/form-schema.js';
import { parseRichText, type RichBlock, type RichInline } from '../forms/rich-text.js';
import type { FormLocale } from '../i18n/locale.js';
import { pipedAnswer, resolvePiping } from '../logic/piping.js';
import type { AutoresponderSettings } from '../settings/live-settings.js';
import type { FormTheme } from '../theme/schema.js';

/*
 * The email respondents get after sending a form: the creator's words with answers piped in,
 * then a copy of the answers, the quiz score and the link to change the response, each as
 * the form says. One renderer for the email and the preview in the settings, so what the
 * creator sees is what is sent. Plain, table-based HTML that email clients agree on, with
 * the form's colour as an accent where it stays readable; everything people typed escaped.
 */

export interface RenderedAutoresponder {
  subject: string;
  html: string;
  text: string;
}

export interface AutoresponderInput {
  formTitle: string;
  schema: Pick<FormSchema, 'fields' | 'logic' | 'settings'>;
  theme: Pick<FormTheme, 'colors' | 'branding'>;
  settings: AutoresponderSettings;
  answers: Answers;
  /** The values and quiz mark the server worked out; `null` in a preview without them. */
  outcome: {
    values: Readonly<Record<string, number>>;
    quiz: { score: number; max: number; percent: number; passed: boolean | null } | null;
  } | null;
  /** The private link to change the response, when the form gives one. */
  editUrl: string | null;
  locale: FormLocale;
}

const FONT = `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Noto Sans', Helvetica, Arial, sans-serif`;
const PAGE = '#fafafa';
const CARD = '#ffffff';
const BORDER = '#e4e4e7';
const TEXT = '#18181b';
const MUTED = '#52525b';
const FALLBACK_ACCENT = '#2e5aac';
/** Answers shown in full before the rest are shortened. */
const ANSWER_MAX_LENGTH = 500;

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (character) => HTML_ESCAPES[character] ?? character);
}

function singleLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function shorten(text: string): string {
  return text.length > ANSWER_MAX_LENGTH
    ? `${text.slice(0, ANSWER_MAX_LENGTH - 1).trimEnd()}…`
    : text;
}

/** The form's colour if it reads on white (links, the button), the app's blue otherwise. */
function accentColor(primary: string): string {
  return contrastRatio(primary, CARD) >= 4.5 ? primary : FALLBACK_ACCENT;
}

function inlineHtml(nodes: readonly RichInline[], accent: string): string {
  return nodes
    .map((node) => {
      switch (node.type) {
        case 'text':
          return escapeHtml(node.text);
        case 'strong':
          return `<strong>${inlineHtml(node.children, accent)}</strong>`;
        case 'em':
          return `<em>${inlineHtml(node.children, accent)}</em>`;
        case 'link':
          return `<a href="${escapeHtml(node.href)}" style="color:${accent};">${inlineHtml(node.children, accent)}</a>`;
        case 'break':
          return '<br>';
      }
    })
    .join('');
}

function inlineText(nodes: readonly RichInline[]): string {
  return nodes
    .map((node) => {
      switch (node.type) {
        case 'text':
          return node.text;
        case 'break':
          return '\n';
        case 'link':
          return `${inlineText(node.children)} (${node.href})`;
        default:
          return inlineText(node.children);
      }
    })
    .join('');
}

const BODY_STYLE = `margin:0 0 12px;font-family:${FONT};font-size:15px;line-height:23px;color:${TEXT};`;

/** Rich text as email HTML; parsed first, so nothing anyone typed becomes markup. */
export function richTextToEmailHtml(source: string, accent = FALLBACK_ACCENT): string {
  return parseRichText(source)
    .map((block: RichBlock) =>
      block.type === 'paragraph'
        ? `<p style="${BODY_STYLE}">${inlineHtml(block.children, accent)}</p>`
        : `<ul style="margin:0 0 12px;padding-left:20px;">${block.items
            .map(
              (item) =>
                `<li style="font-family:${FONT};font-size:15px;line-height:23px;color:${TEXT};">${inlineHtml(item, accent)}</li>`,
            )
            .join('')}</ul>`,
    )
    .join('\n');
}

function richTextToEmailText(source: string): string {
  return parseRichText(source)
    .map((block) =>
      block.type === 'paragraph'
        ? inlineText(block.children)
        : block.items.map((item) => `- ${inlineText(item)}`).join('\n'),
    )
    .join('\n\n');
}

interface ShownAnswer {
  label: string;
  value: string;
}

function shownAnswers(input: AutoresponderInput): ShownAnswer[] {
  const fieldById = new Map(input.schema.fields.map((field) => [field.id, field]));
  const piping = {
    fieldById,
    answers: input.answers,
    values: input.outcome?.values ?? {},
    variables: input.schema.logic.variables,
    locale: input.locale,
  };
  return input.schema.fields
    .filter((field) => isAnswerableFieldType(field.type) && field.type !== 'hidden')
    .flatMap((field) => {
      const value = pipedAnswer(field, input.answers[field.id], input.locale);
      if (!value) return [];
      const label = resolvePiping(field.label, piping).trim();
      return [{ label: label || '…', value: shorten(value) }];
    });
}

/** The subject, HTML and plain text of the autoresponder email for one response. */
export function renderAutoresponder(input: AutoresponderInput): RenderedAutoresponder {
  const { settings, locale } = input;
  const messages = locale.messages;
  const accent = accentColor(input.theme.colors.primary);
  const buttonText = readableTextColor(accent);
  const piping = {
    fieldById: new Map(input.schema.fields.map((field) => [field.id, field])),
    answers: input.answers,
    values: input.outcome?.values ?? {},
    variables: input.schema.logic.variables,
    locale,
  };

  const subject =
    singleLine(resolvePiping(settings.subject, piping)) || singleLine(input.formTitle);
  const body = resolvePiping(settings.body, piping, { richText: true });
  const answers = settings.includeAnswers ? shownAnswers(input) : [];
  const quiz = settings.includeScore ? input.outcome?.quiz : null;
  const editUrl = settings.includeEditLink ? input.editUrl : null;
  const why = messages.email.why(singleLine(input.formTitle));
  const logo = input.theme.branding.logoUrl;

  const parts: string[] = [];
  if (logo) {
    parts.push(
      `<img src="${escapeHtml(logo)}" alt="" height="40" style="display:block;height:40px;width:auto;margin:0 0 20px;border:0;">`,
    );
  }
  parts.push(richTextToEmailHtml(body, accent));
  if (quiz) {
    const passed =
      quiz.passed === null ? '' : quiz.passed ? messages.end.passed : messages.end.notPassed;
    parts.push(
      `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 16px;border:1px solid ${BORDER};border-radius:8px;"><tr><td style="padding:12px 16px;font-family:${FONT};">
        <p style="margin:0;font-size:18px;line-height:26px;font-weight:600;color:${TEXT};">${escapeHtml(messages.end.score(quiz.score, quiz.max))} <span style="font-weight:400;color:${MUTED};">(${quiz.percent}%)</span></p>
        ${passed ? `<p style="margin:2px 0 0;font-size:14px;line-height:20px;color:${MUTED};">${escapeHtml(passed)}</p>` : ''}
      </td></tr></table>`,
    );
  }
  if (answers.length > 0) {
    parts.push(
      `<p style="margin:16px 0 8px;font-family:${FONT};font-size:13px;line-height:18px;font-weight:600;letter-spacing:0.2px;color:${MUTED};">${escapeHtml(messages.end.yourAnswers)}</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${BORDER};">${answers
        .map(
          (answer) =>
            `<tr><td style="padding:10px 0;border-bottom:1px solid ${BORDER};font-family:${FONT};">
              <p style="margin:0;font-size:13px;line-height:18px;color:${MUTED};">${escapeHtml(answer.label)}</p>
              <p style="margin:2px 0 0;font-size:15px;line-height:22px;color:${TEXT};white-space:pre-wrap;">${escapeHtml(answer.value)}</p>
            </td></tr>`,
        )
        .join('')}</table>`,
    );
  }
  if (editUrl) {
    parts.push(
      `<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:20px;"><tr><td style="border-radius:8px;background:${accent};">
        <a href="${escapeHtml(editUrl)}" style="display:inline-block;padding:10px 16px;font-family:${FONT};font-size:14px;line-height:20px;font-weight:500;color:${buttonText};text-decoration:none;border-radius:8px;">${escapeHtml(messages.end.editLink)}</a>
      </td></tr></table>
      <p style="margin:8px 0 0;font-family:${FONT};font-size:13px;line-height:18px;color:${MUTED};">${escapeHtml(messages.end.editLinkHelp)}</p>`,
    );
  }

  const html = `<!doctype html>
<html lang="${locale.format.language}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:${PAGE};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAGE};">
  <tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
      <tr><td style="background:${CARD};border:1px solid ${BORDER};border-top:4px solid ${accent};border-radius:12px;padding:24px;">
        ${parts.join('\n')}
      </td></tr>
      <tr><td style="padding:16px 4px 0;">
        <p style="margin:0;font-family:${FONT};font-size:12px;line-height:18px;color:${MUTED};">${escapeHtml(why)}</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>
`;

  const textParts = [richTextToEmailText(body)];
  if (quiz) {
    textParts.push(
      `${messages.end.score(quiz.score, quiz.max)} (${quiz.percent}%)${
        quiz.passed === null
          ? ''
          : `\n${quiz.passed ? messages.end.passed : messages.end.notPassed}`
      }`,
    );
  }
  if (answers.length > 0) {
    textParts.push(
      [
        messages.end.yourAnswers,
        ...answers.map((answer) => `${answer.label}\n${answer.value}`),
      ].join('\n\n'),
    );
  }
  if (editUrl) textParts.push(`${messages.end.editLink}: ${editUrl}`);
  textParts.push(`--\n${why}`);

  return { subject, html, text: `${textParts.join('\n\n')}\n` };
}
