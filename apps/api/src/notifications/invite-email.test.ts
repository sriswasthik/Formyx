import { describe, expect, it } from 'vitest';
import { renderInviteEmail } from './invite-email.js';

const acceptUrl = 'https://formyx.app/invite/abc_123';

describe('renderInviteEmail', () => {
  it('says who invited whom to what, with the link and its limits', () => {
    const email = renderInviteEmail({
      workspaceName: 'Acme',
      inviterName: 'Grace Hopper',
      role: 'EDITOR',
      acceptUrl,
      appUrl: 'https://formyx.app',
    });

    expect(email.subject).toBe('Grace Hopper invited you to Acme on Formyx');
    expect(email.text).toContain('Join as an editor to build forms and manage their responses.');
    expect(email.text).toContain(`Accept the invite: ${acceptUrl}`);
    expect(email.text).toContain('The link works for 7 days, for this email address only.');
    expect(email.html).toContain(`href="${acceptUrl}"`);
  });

  it('escapes names and keeps them on one line', () => {
    const email = renderInviteEmail({
      workspaceName: '<b>Acme</b>\r\nBcc: x@example.com',
      inviterName: null,
      role: 'VIEWER',
      acceptUrl,
      appUrl: 'https://formyx.app',
    });

    expect(email.subject).toBe('Someone invited you to <b>Acme</b> Bcc: x@example.com on Formyx');
    expect(email.html).not.toContain('<b>');
    expect(email.html).toContain('&lt;b&gt;Acme&lt;/b&gt;');
    expect(email.text).toContain('Join as a viewer');
  });
});
