import { describe, expect, it } from 'vitest';
import {
  renderFirstFormPublishedEmail,
  renderInactiveEmail,
  renderWelcomeEmail,
  type LifecycleEmailContext,
} from './lifecycle-email.js';

const context: LifecycleEmailContext = {
  name: '  Ada   Lovelace ',
  appUrl: 'https://formyx.app',
  unsubscribeUrl: 'https://formyx.app/unsubscribe/abc.def',
};

describe('lifecycle emails', () => {
  it('greet by first name and end with a way to stop them, in HTML and text', () => {
    const email = renderWelcomeEmail(context);
    expect(email.html).toContain('Welcome to Formyx, Ada');
    expect(email.html).toContain('href="https://formyx.app/unsubscribe/abc.def"');
    expect(email.text).toContain('Stop tips and reminders: https://formyx.app/unsubscribe/abc.def');
    expect(email.text).toContain('Create your first form: https://formyx.app/app/forms');
  });

  it('keep what people typed from becoming HTML', () => {
    const email = renderFirstFormPublishedEmail(context, {
      formTitle: 'Party <script>alert(1)</script>',
      formUrl: 'https://formyx.app/app/forms/f1',
      shareUrl: 'https://formyx.app/f/party',
    });
    expect(email.html).not.toContain('<script>');
    expect(email.html).toContain('Party &lt;script&gt;');
    expect(email.subject).toBe('Party <script>alert(1)</script> is live');
  });

  it('count new responses in the nudge, and leave the count out when there are none', () => {
    expect(renderInactiveEmail(context, { newResponses: 1 }).text).toContain(
      '1 new response has arrived since your last visit.',
    );
    expect(renderInactiveEmail(context, { newResponses: 1200 }).text).toContain(
      '1,200 new responses',
    );
    const none = renderInactiveEmail(context, { newResponses: 0 });
    expect(none.subject).toBe('Your forms are waiting');
    expect(none.text).not.toContain('new response');
  });
});
