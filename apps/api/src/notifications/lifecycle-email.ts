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

/*
 * Lifecycle emails: a welcome, the first form published, the first response, and a nudge
 * after two weeks away. Short, one action each, and every one ends with a way to stop them.
 * They never carry respondents' answers.
 */

export interface LifecycleEmailContext {
  /** The person's name as they gave it; the email uses the first word. */
  name: string;
  appUrl: string;
  /** Turns these emails off in one click (the web page at /unsubscribe/:token). */
  unsubscribeUrl: string;
}

interface Content {
  subject: string;
  preheader: string;
  title: string;
  lines: string[];
  action: { label: string; url: string };
}

function firstName(name: string): string {
  return singleLine(name).split(' ')[0] ?? '';
}

/** The small print every lifecycle email ends with, as text and HTML. */
export function lifecycleFooter(
  unsubscribeUrl: string,
  reason = 'You get this email because you have a Formyx account.',
): { text: string; html: string } {
  return {
    text: `${reason} Stop tips and reminders: ${unsubscribeUrl}`,
    html: `${escapeHtml(reason)} <a href="${escapeHtml(unsubscribeUrl)}" style="color:${COLOR.muted};text-decoration:underline;">Stop tips and reminders</a>.`,
  };
}

function render(context: LifecycleEmailContext, content: Content): RenderedEmail {
  const footer = lifecycleFooter(context.unsubscribeUrl);
  const text = [
    content.title,
    '',
    ...content.lines.flatMap((line) => [line, '']),
    `${content.action.label}: ${content.action.url}`,
    '',
    footer.text,
  ].join('\n');
  const html = emailPage({
    appUrl: context.appUrl,
    subject: content.subject,
    preheader: content.preheader,
    card: `${heading(content.title)}
        ${content.lines
          .map((line) =>
            p(
              `font-size:14px;line-height:21px;color:${COLOR.text};margin-top:12px;`,
              escapeHtml(line),
            ),
          )
          .join('\n        ')}
        ${button(content.action.label, content.action.url)}`,
    footer: footer.html,
  });
  return { subject: content.subject, html, text };
}

export function renderWelcomeEmail(context: LifecycleEmailContext): RenderedEmail {
  const name = firstName(context.name);
  return render(context, {
    subject: 'Welcome to Formyx',
    preheader: 'Your first form is a few minutes away.',
    title: name ? `Welcome to Formyx, ${name}` : 'Welcome to Formyx',
    lines: [
      'Your first form is a few minutes away. Start from one of our templates, or a blank page, and drag in the questions you need.',
      'Then give it your own look in the Design Studio, publish it, and share the link. Responses appear the moment they are sent.',
      `Stuck on something? The help centre has a short guide to every feature: ${context.appUrl}/help`,
    ],
    action: { label: 'Create your first form', url: `${context.appUrl}/app/forms` },
  });
}

export function renderFirstFormPublishedEmail(
  context: LifecycleEmailContext,
  { formTitle, formUrl, shareUrl }: { formTitle: string; formUrl: string; shareUrl: string },
): RenderedEmail {
  const title = singleLine(formTitle);
  return render(context, {
    subject: `${title} is live`,
    preheader: 'Share the link and watch the responses arrive.',
    title: 'Your first form is live',
    lines: [
      `“${title}” is published at ${shareUrl}.`,
      'Share the link wherever your people are: a message, an email, a QR code on a poster, or embedded on your own site. Every way is on the form’s Share menu.',
      'Responses appear in Formyx as they are sent, and we can email you each one.',
    ],
    action: { label: 'Share your form', url: formUrl },
  });
}

export function renderFirstResponseEmail(
  context: LifecycleEmailContext,
  { formTitle, responsesUrl }: { formTitle: string; responsesUrl: string },
): RenderedEmail {
  const title = singleLine(formTitle);
  return render(context, {
    subject: `Your first response to ${title}`,
    preheader: 'Someone just filled in your form.',
    title: 'Your first response is in',
    lines: [
      `Someone just filled in “${title}”.`,
      'See it in Formyx, with a summary of every question that grows as more arrive. You can also send responses to Google Sheets, Notion, Slack or Discord from the form’s Integrations page.',
    ],
    action: { label: 'See the response', url: responsesUrl },
  });
}

export function renderInactiveEmail(
  context: LifecycleEmailContext,
  { newResponses }: { newResponses: number },
): RenderedEmail {
  const waiting =
    newResponses === 0
      ? null
      : newResponses === 1
        ? '1 new response has arrived since your last visit.'
        : `${newResponses.toLocaleString('en-IN')} new responses have arrived since your last visit.`;
  return render(context, {
    subject: waiting ? 'New responses are waiting for you' : 'Your forms are waiting',
    preheader: waiting ?? 'Pick up where you left off.',
    title: waiting ? 'You have new responses' : 'Pick up where you left off',
    lines: [
      ...(waiting ? [waiting] : []),
      'It has been two weeks since you were last in Formyx. Your forms are just as you left them.',
      'Need a new one? Our templates cover events, feedback, applications, orders and quizzes, each ready to publish.',
    ],
    action: { label: 'Open Formyx', url: `${context.appUrl}/app/forms` },
  });
}
