/*
 * The frame every Formyx email shares: plain, table-based HTML (the layout email clients render
 * reliably) in the app's neutral palette.
 */

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export const FONT = `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif`;
export const COLOR = {
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

/** Text that came from people (a title, a name), made safe for one line such as a subject. */
export function singleLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** A paragraph; `content` must already be HTML-safe. */
export function paragraph(style: string, content: string): string {
  return `<p style="margin:0;font-family:${FONT};${style}">${content}</p>`;
}

export function heading(text: string): string {
  return `<h1 style="margin:4px 0;font-family:${FONT};font-size:20px;line-height:28px;font-weight:600;letter-spacing:-0.2px;color:${COLOR.text};">${escapeHtml(text)}</h1>`;
}

/** The email's one call to action. */
export function button(label: string, href: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:20px;">
          <tr><td style="border-radius:8px;background:${COLOR.button};">
            <a href="${escapeHtml(href)}" style="display:inline-block;padding:10px 16px;font-family:${FONT};font-size:14px;line-height:20px;font-weight:500;color:${COLOR.buttonText};text-decoration:none;border-radius:8px;">${escapeHtml(label)}</a>
          </td></tr>
        </table>`;
}

/**
 * The logo: the icon as an image (email clients do not show SVG), hosted on the site, and the
 * wordmark as text, so it reads even with images blocked. The image is decorative beside it.
 */
function logo(appUrl: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding-right:8px;vertical-align:middle;"><img src="${escapeHtml(appUrl)}/email-logo.png" width="24" height="24" alt="" style="display:block;border:0;outline:none;"></td>
            <td style="vertical-align:middle;">${paragraph(`font-size:16px;line-height:24px;font-weight:600;letter-spacing:-0.3px;color:${COLOR.text};`, 'Formyx')}</td>
          </tr>
        </table>`;
}

/**
 * A whole email page: the Formyx logo, a card holding `card`, and small print below it.
 * `card` and `footer` must already be HTML-safe; `preheader` is the inbox preview line.
 */
export function emailPage({
  appUrl,
  subject,
  preheader,
  card,
  footer,
}: {
  /** The site's address, where the logo image is. */
  appUrl: string;
  subject: string;
  preheader: string;
  card: string;
  footer: string;
}): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:${COLOR.page};">
<div style="display:none;max-height:0;overflow:hidden;">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLOR.page};">
  <tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
      <tr><td style="padding:0 4px 16px;">
        ${logo(appUrl)}
      </td></tr>
      <tr><td style="background:${COLOR.card};border:1px solid ${COLOR.border};border-radius:12px;padding:24px;">
        ${card}
      </td></tr>
      <tr><td style="padding:16px 4px 0;">
        ${paragraph(`font-size:12px;line-height:18px;color:${COLOR.muted};`, footer)}
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>
`;
}
