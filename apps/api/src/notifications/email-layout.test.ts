import { describe, expect, it } from 'vitest';
import { emailPage } from './email-layout.js';

const page = (appUrl: string) =>
  emailPage({ appUrl, subject: 'Hello', preheader: 'Hi', card: '<p>Card</p>', footer: 'Small' });

describe('emailPage', () => {
  it('heads every email with the logo: the hosted icon and the wordmark as text', () => {
    const html = page('https://formyx.app');
    // Decorative beside the wordmark, so it still reads with images blocked.
    expect(html).toContain(
      '<img src="https://formyx.app/email-logo.png" width="24" height="24" alt=""',
    );
    expect(html).toMatch(/<p [^>]*font-weight:600;[^>]*>Formyx<\/p>/);
    expect(html).not.toContain('<svg');
  });

  it('keeps the address from breaking out of the attribute', () => {
    expect(page('https://formyx.app/"><script>')).not.toContain('"><script>');
  });
});
