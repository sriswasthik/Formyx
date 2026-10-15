import { createEmptyForm, createField, type FormSchema } from '@formyx/shared';
import { describe, expect, it, vi } from 'vitest';
import { withoutLinks } from '../notifications/autoresponder-notifier.js';
import { isDisposableEmail } from './disposable-email.js';
import { approveModeration, readModeration, reviewForPublish } from './form-moderation.js';
import { blocklistReason, createLinkChecker, type LinkChecker } from './link-checker.js';
import { turnstileKeys } from './turnstile.js';

const noLinks: LinkChecker = { check: () => Promise.resolve([]) };

function asking(label: string): FormSchema {
  return { ...createEmptyForm(), fields: [{ ...createField('short_text'), label }] };
}

describe('blocklistReason', () => {
  it.each([
    ['https://bit.ly/abc', 'is a link shortener, which hides where it goes'],
    ['https://www.tinyurl.com/x', 'is a link shortener, which hides where it goes'],
    ['http://203.0.113.9/login', 'points at a bare IP address'],
    ['https://[2001:db8::1]/x', 'points at a bare IP address'],
    ['https://bank.example@evil.example/', 'hides its real address behind a user name'],
  ])('refuses %s', (url, reason) => {
    expect(blocklistReason(url)).toBe(reason);
  });

  it('refuses extra domains and their subdomains, and lets the rest through', () => {
    expect(blocklistReason('https://login.bad.example/x', ['bad.example'])).toBe(
      'is on Formyx’s list of unsafe sites',
    );
    expect(blocklistReason('https://notbad.example/x', ['bad.example'])).toBeNull();
    expect(blocklistReason('https://example.com/policy')).toBeNull();
    expect(blocklistReason('not a url')).toBeNull();
  });

  it('allows bare IPs where servers call them (webhooks)', () => {
    expect(blocklistReason('https://203.0.113.9/hook', [], { allowIpAddresses: true })).toBeNull();
  });
});

describe('createLinkChecker', () => {
  const env = {
    BLOCKED_LINK_DOMAINS: [],
    SAFE_BROWSING_URL: 'https://safebrowsing.test',
  };

  it('asks Safe Browsing about what the blocklist let through, when a key is set', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        Response.json({
          matches: [
            { threatType: 'SOCIAL_ENGINEERING', threat: { url: 'https://phish.example/' } },
          ],
        }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const links = createLinkChecker({ ...env, GOOGLE_SAFE_BROWSING_KEY: 'key' }, { warn: vi.fn() });
    expect(await links.check(['https://bit.ly/x', 'https://phish.example/'])).toEqual([
      { url: 'https://bit.ly/x', reason: 'is a link shortener, which hides where it goes' },
      { url: 'https://phish.example/', reason: 'is a known phishing site' },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it('lets links through, and says so, when Safe Browsing fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('offline'))),
    );
    const warn = vi.fn();
    const links = createLinkChecker({ ...env, GOOGLE_SAFE_BROWSING_KEY: 'key' }, { warn });
    expect(await links.check(['https://example.com/'])).toEqual([]);
    expect(warn).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('never calls out without a key', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const links = createLinkChecker(
      { ...env, GOOGLE_SAFE_BROWSING_KEY: undefined },
      { warn: vi.fn() },
    );
    expect(await links.check(['https://example.com/'])).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe('isDisposableEmail', () => {
  it('knows throwaway inboxes and their subdomains, in any case', () => {
    expect(isDisposableEmail('eve@Mailinator.com')).toBe(true);
    expect(isDisposableEmail('eve@mail.yopmail.com')).toBe(true);
    expect(isDisposableEmail('ada@gmail.com')).toBe(false);
    expect(isDisposableEmail('ada@notmailinator.com')).toBe(false);
  });
});

describe('reviewForPublish', () => {
  it('remembers what an admin approved', async () => {
    const first = await reviewForPublish({
      schema: asking('Your password'),
      title: 'Login',
      previous: readModeration({}),
      links: noLinks,
    });
    expect(first.hold).toBe(true);

    const approved = approveModeration(first.record);
    expect(approved.approvedRuleIds).toEqual(['password']);
    const again = await reviewForPublish({
      schema: asking('Your password, again'),
      title: 'Login',
      previous: approved,
      links: noLinks,
    });
    expect(again.hold).toBe(false);
  });

  it('reads anything unexpected as never checked', () => {
    expect(readModeration('nonsense')).toEqual(readModeration({}));
    expect(readModeration(null).approvedRuleIds).toEqual([]);
  });
});

describe('withoutLinks', () => {
  it('keeps link text and drops addresses', () => {
    expect(withoutLinks('Read [our policy](https://example.com) or https://x.example/y now')).toBe(
      'Read our policy or now',
    );
  });
});

describe('turnstileKeys', () => {
  it("uses Cloudflare's test keys outside production, and nothing in production", () => {
    const unset = { TURNSTILE_SITE_KEY: undefined, TURNSTILE_SECRET_KEY: undefined };
    expect(turnstileKeys({ NODE_ENV: 'development', ...unset })?.siteKey).toBe(
      '1x00000000000000000000AA',
    );
    expect(turnstileKeys({ NODE_ENV: 'production', ...unset })).toBeNull();
    expect(
      turnstileKeys({
        NODE_ENV: 'production',
        TURNSTILE_SITE_KEY: 'site',
        TURNSTILE_SECRET_KEY: 'secret',
      }),
    ).toEqual({ siteKey: 'site', secretKey: 'secret' });
  });
});
