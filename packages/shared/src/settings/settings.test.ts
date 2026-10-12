import { describe, expect, it } from 'vitest';
import { requiredSettingsFeatures } from '../entitlements/settings-features.js';
import { fillsForm, formAvailability, normalizeEmail, respondentEmailStep } from './access.js';
import {
  accessSettingsSchema,
  createDefaultLiveSettings,
  formNotificationSettingsSchema,
  readLiveSettings,
} from './live-settings.js';
import {
  accountPreferencesSchema,
  changePasswordInputSchema,
  readAccountPreferences,
  workspacePreferencesSchema,
} from './preferences.js';
import { chatWebhookInputSchema, updateFormSettingsInputSchema } from './settings-api.js';
import { chatWebhookHint, chatWebhookProblem, customSlugSchema } from './sharing-rules.js';

const access = createDefaultLiveSettings().access;
const now = new Date('2026-10-12T12:00:00Z');

describe('formAvailability', () => {
  it('is open when published and nothing stops it', () => {
    expect(formAvailability({ status: 'PUBLISHED', access, responseCount: 0, now })).toEqual({
      state: 'open',
    });
  });

  it('is closed while a draft and once closed by hand', () => {
    expect(formAvailability({ status: 'DRAFT', access, responseCount: 0, now })).toEqual({
      state: 'closed',
      reason: 'unpublished',
    });
    expect(formAvailability({ status: 'CLOSED', access, responseCount: 0, now })).toEqual({
      state: 'closed',
      reason: 'closed',
    });
  });

  it('closes when the response limit is reached, not before', () => {
    const limited = { ...access, responseLimit: 3 };
    expect(
      formAvailability({ status: 'PUBLISHED', access: limited, responseCount: 2, now }).state,
    ).toBe('open');
    expect(
      formAvailability({ status: 'PUBLISHED', access: limited, responseCount: 3, now }),
    ).toEqual({ state: 'closed', reason: 'response_limit' });
    expect(fillsForm(limited, 2)).toBe(false);
    expect(fillsForm(limited, 3)).toBe(true);
    expect(fillsForm(access, 1_000_000)).toBe(false);
  });

  it('opens and closes at their moments, whatever the time zone they were written in', () => {
    const scheduled = {
      ...access,
      opensAt: '2026-10-12T18:00:00+05:30', // 12:30 UTC
      closesAt: '2026-10-13T00:00:00+05:30',
    };
    expect(
      formAvailability({ status: 'PUBLISHED', access: scheduled, responseCount: 0, now }),
    ).toEqual({ state: 'not_open', opensAt: scheduled.opensAt });
    expect(
      formAvailability({
        status: 'PUBLISHED',
        access: scheduled,
        responseCount: 0,
        now: new Date('2026-10-12T12:30:00Z'),
      }).state,
    ).toBe('open');
    expect(
      formAvailability({
        status: 'PUBLISHED',
        access: scheduled,
        responseCount: 0,
        now: new Date('2026-10-12T18:30:00Z'),
      }),
    ).toEqual({ state: 'closed', reason: 'close_date' });
  });

  it('says closed rather than not open yet when both apply', () => {
    const full = { ...access, opensAt: '2026-10-20T00:00:00Z', responseLimit: 1 };
    expect(formAvailability({ status: 'PUBLISHED', access: full, responseCount: 1, now })).toEqual({
      state: 'closed',
      reason: 'response_limit',
    });
  });
});

describe('access settings', () => {
  it('asks for an email address when required, and confirms it for one response per person', () => {
    expect(respondentEmailStep(access)).toBe('none');
    expect(respondentEmailStep({ ...access, requireEmail: true })).toBe('ask');
    expect(respondentEmailStep({ ...access, oneResponsePer: 'email' })).toBe('verify');
    expect(respondentEmailStep({ ...access, oneResponsePer: 'browser' })).toBe('none');
  });

  it('compares email addresses trimmed and lowercased', () => {
    expect(normalizeEmail('  Ada@Example.COM ')).toBe('ada@example.com');
  });

  it('refuses a closing time before the opening time, and impossible limits', () => {
    const result = accessSettingsSchema.safeParse({
      ...access,
      opensAt: '2026-10-12T10:00:00Z',
      closesAt: '2026-10-12T09:00:00Z',
      responseLimit: 0,
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path.join('.'))).toEqual([
      'responseLimit',
      'closesAt',
    ]);
  });

  it('refuses the same notification address twice', () => {
    const result = formNotificationSettingsSchema.safeParse({
      emails: ['team@example.com', 'Team@Example.com'],
      frequency: 'daily',
      digestHour: 9,
    });
    expect(result.error?.issues[0]?.message).toBe('Already added');
  });
});

describe('readLiveSettings', () => {
  it('fills in what is missing, and replaces only the sections that do not read', () => {
    const stored = {
      access: { ...access, requireEmail: true },
      notifications: { emails: 'not a list' },
    };
    const settings = readLiveSettings(stored);
    expect(settings.access.requireEmail).toBe(true);
    expect(settings.notifications).toEqual(createDefaultLiveSettings().notifications);
    expect(settings.data).toEqual({ retentionDays: null });
    expect(readLiveSettings(null)).toEqual(createDefaultLiveSettings());
  });

  it('starts new forms with the workspace defaults for notifications', () => {
    expect(
      createDefaultLiveSettings({ frequency: 'daily', emails: ['ops@example.com'] }).notifications,
    ).toMatchObject({ frequency: 'daily', emails: ['ops@example.com'] });
  });
});

describe('updates and plans', () => {
  it('needs at least one section', () => {
    expect(updateFormSettingsInputSchema.safeParse({}).success).toBe(false);
  });

  it('asks the plan only for what a change turns on', () => {
    const defaults = createDefaultLiveSettings();
    expect(requiredSettingsFeatures({ access: defaults.access })).toEqual([]);
    expect(
      requiredSettingsFeatures({
        access: { ...defaults.access, oneResponsePer: 'email' },
        autoresponder: { ...defaults.autoresponder, enabled: true },
        notifications: { ...defaults.notifications, emails: ['a@example.com'] },
        sharing: { faviconUrl: 'https://example.com/icon.png' },
      }),
    ).toEqual(['verified_responses', 'autoresponder', 'extra_recipients', 'custom_social']);
  });
});

describe('custom slugs', () => {
  it('takes lowercase words joined by single hyphens', () => {
    expect(customSlugSchema.parse('  Summer-Camp-2026 ')).toBe('summer-camp-2026');
    for (const slug of ['ab', 'a--b', '-ab', 'ab-', 'snake_case', 'with space', 'api', 'admin']) {
      expect(customSlugSchema.safeParse(slug).success, slug).toBe(false);
    }
  });
});

describe('chat webhooks', () => {
  it('takes Slack and Discord incoming webhook URLs only', () => {
    expect(
      chatWebhookProblem('slack', 'https://hooks.slack.com/services/T000/B000/XXXXXXXX'),
    ).toBeNull();
    expect(
      chatWebhookProblem(
        'discord',
        'https://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz_-123',
      ),
    ).toBeNull();
    for (const url of [
      'http://hooks.slack.com/services/T000/B000/XXXX',
      'https://hooks.slack.com.evil.example/services/T/B/X',
      'https://hooks.slack.com/services/T000/B000/X?redirect=http://127.0.0.1',
      'https://127.0.0.1/api/webhooks/1/2',
    ]) {
      expect(chatWebhookProblem('slack', url), url).not.toBeNull();
      expect(chatWebhookProblem('discord', url), url).not.toBeNull();
    }
  });

  it('shows only the end of a saved URL', () => {
    expect(chatWebhookHint('https://hooks.slack.com/services/T000/B000/abcd1234')).toBe('…1234');
  });

  it('removes a webhook with a null URL', () => {
    expect(chatWebhookInputSchema.parse({ service: 'slack', url: null })).toEqual({
      service: 'slack',
      url: null,
    });
    expect(chatWebhookInputSchema.safeParse({ service: 'slack', url: 'https://x.y' }).success).toBe(
      false,
    );
  });
});

describe('preferences', () => {
  it('needs a real time zone', () => {
    const base = {
      timeZone: 'Asia/Kolkata',
      dateFormat: 'dmy',
      defaultNotifications: { frequency: 'instant', emails: [] },
    };
    expect(workspacePreferencesSchema.safeParse(base).success).toBe(true);
    expect(
      workspacePreferencesSchema.safeParse({ ...base, timeZone: 'Mars/Olympus' }).success,
    ).toBe(false);
  });

  it('reads stored account preferences over the defaults', () => {
    expect(readAccountPreferences({ theme: 'dark' })).toMatchObject({
      theme: 'dark',
      reducedMotion: 'system',
      language: 'en',
    });
    expect(readAccountPreferences({ theme: 'sepia' }).theme).toBe('system');
    expect(
      accountPreferencesSchema.safeParse({ ...readAccountPreferences(null), language: 'fr' })
        .success,
    ).toBe(false);
  });

  it('needs a new password that differs from the current one', () => {
    expect(
      changePasswordInputSchema.safeParse({
        currentPassword: 'old-password-1',
        newPassword: 'old-password-1',
      }).success,
    ).toBe(false);
  });
});
