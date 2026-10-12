import {
  createDefaultAccountPreferences,
  createDefaultTheme,
  createEmptyForm,
  createField,
  formDetailSchema,
} from '@formyx/shared';
import { pino } from 'pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestApp } from '../test/create-test-app.js';
import { resetDatabase, testPrisma as prisma } from '../test/database.js';
import { createTeam, requestAs, type Team } from '../test/team.js';
import {
  createProductAnalytics,
  createRecordingAnalytics,
  pseudonym,
  publishEvents,
} from './product-analytics.js';

const SECRET = 'test-only-jwt-secret-with-at-least-32-chars';
const env = {
  POSTHOG_KEY: 'phc_test',
  POSTHOG_HOST: 'https://eu.i.posthog.com',
  JWT_SECRET: SECRET,
  NODE_ENV: 'test' as const,
};

let team: Team;

beforeEach(async () => {
  await resetDatabase();
  team = await createTeam(prisma);
});

function fakePostHog() {
  return vi.fn<typeof fetch>(() => Promise.resolve(new Response('{}', { status: 200 })));
}

function sentBody(send: ReturnType<typeof fakePostHog>) {
  const body = send.mock.calls[0]?.[1]?.body;
  if (typeof body !== 'string') throw new Error('Nothing was sent');
  return JSON.parse(body) as {
    api_key: string;
    event: string;
    distinct_id: string;
    properties: Record<string, unknown>;
  };
}

describe('createProductAnalytics', () => {
  it('sends hashed ids, the plan and the event, without person profiles or location', async () => {
    const send = fakePostHog();
    const analytics = createProductAnalytics({
      env,
      prisma,
      logger: pino({ level: 'silent' }),
      fetch: send,
    });

    analytics.track(
      { name: 'form_created', properties: { source: 'template', template: 'blank' } },
      { userId: team.users.OWNER, workspaceId: team.workspaceId },
    );
    await analytics.flush();

    expect(send).toHaveBeenCalledOnce();
    expect(send.mock.calls[0]?.[0]).toBe('https://eu.i.posthog.com/i/v0/e/');
    const body = sentBody(send);
    expect(body).toMatchObject({
      api_key: 'phc_test',
      event: 'form_created',
      distinct_id: pseudonym(SECRET, 'user', team.users.OWNER),
      properties: {
        source: 'template',
        template: 'blank',
        plan: 'FREE',
        workspace: pseudonym(SECRET, 'workspace', team.workspaceId),
        $process_person_profile: false,
        $geoip_disable: true,
      },
    });
    // Neither id travels as itself.
    expect(JSON.stringify(body)).not.toContain(team.users.OWNER);
    expect(JSON.stringify(body)).not.toContain(team.workspaceId);
  });

  it('finds the workspace from a form', async () => {
    const send = fakePostHog();
    const analytics = createProductAnalytics({
      env,
      prisma,
      logger: pino({ level: 'silent' }),
      fetch: send,
    });
    const form = await prisma.form.create({
      data: {
        workspaceId: team.workspaceId,
        createdById: team.users.OWNER,
        title: 'Survey',
        slug: 'survey',
        draftSchema: createEmptyForm(),
        theme: createDefaultTheme(),
      },
    });

    analytics.track(
      { name: 'integration_connected', properties: { kind: 'google_sheets' } },
      { userId: team.users.OWNER, formId: form.id },
    );
    await analytics.flush();

    expect(sentBody(send).properties.workspace).toBe(
      pseudonym(SECRET, 'workspace', team.workspaceId),
    );
  });

  it('sends nothing for people who turned it off, or without a key', async () => {
    await prisma.user.update({
      where: { id: team.users.EDITOR },
      data: { preferences: { ...createDefaultAccountPreferences(), productAnalytics: false } },
    });
    const send = fakePostHog();
    const logger = pino({ level: 'silent' });
    const analytics = createProductAnalytics({ env, prisma, logger, fetch: send });
    const off = createProductAnalytics({
      env: { ...env, POSTHOG_KEY: undefined },
      prisma,
      logger,
      fetch: send,
    });

    analytics.track({ name: 'signed_up' }, { userId: team.users.EDITOR });
    off.track({ name: 'signed_up' }, { userId: team.users.OWNER });
    await Promise.all([analytics.flush(), off.flush()]);

    expect(send).not.toHaveBeenCalled();
  });

  it('never throws, even when PostHog is down', async () => {
    const analytics = createProductAnalytics({
      env,
      prisma,
      logger: pino({ level: 'silent' }),
      fetch: () => Promise.reject(new Error('offline')),
    });
    analytics.track({ name: 'signed_up' }, { userId: team.users.OWNER });
    await expect(analytics.flush()).resolves.toBeUndefined();
  });
});

describe('publishEvents', () => {
  it('describes the form and each premium look it uses', () => {
    const base = createDefaultTheme();
    const events = publishEvents({
      draftSchema: {
        ...createEmptyForm(),
        fields: [createField('short_text'), createField('rating'), createField('short_text')],
      },
      theme: {
        ...base,
        typography: { ...base.typography, headingFont: 'fraunces' },
        layout: { ...base.layout, mode: 'conversational' },
      },
    });

    expect(events).toEqual([
      {
        name: 'form_published',
        properties: {
          layout: 'conversational',
          fieldCount: 3,
          fieldTypes: ['rating', 'short_text'],
          logicRules: 0,
          quiz: false,
        },
      },
      {
        name: 'premium_asset_used',
        properties: { feature: 'premium_fonts', assets: ['fraunces'] },
      },
      {
        name: 'premium_asset_used',
        properties: { feature: 'conversational_layout', assets: ['conversational'] },
      },
    ]);
  });
});

describe('tracked actions', () => {
  it('records creating, duplicating and publishing forms', async () => {
    const analytics = createRecordingAnalytics();
    const app = createTestApp({}, { analytics });
    const editor = requestAs(app, team.users.EDITOR);

    const created = await editor
      .post(`/api/workspaces/${team.workspaceId}/forms`, { templateId: 'blank' })
      .expect(201);
    const form = formDetailSchema.parse(created.body);
    const saved = await editor
      .patch(`/api/forms/${form.id}`, {
        version: form.version,
        draftSchema: { ...form.draftSchema, fields: [{ ...createField('email'), label: 'Email' }] },
      })
      .expect(200);
    await editor
      .post(`/api/forms/${form.id}/publish`, {
        version: formDetailSchema.parse(saved.body).version,
      })
      .expect(200);
    await editor.post(`/api/forms/${form.id}/duplicate`).expect(201);

    expect(analytics.events.map(({ event }) => event.name)).toEqual([
      'form_created',
      'form_published',
      'form_created',
    ]);
    expect(analytics.events[0]).toMatchObject({
      userId: team.users.EDITOR,
      workspaceId: team.workspaceId,
      event: { properties: { source: 'template', template: 'blank' } },
    });
    expect(analytics.events[2]?.event.properties).toEqual({ source: 'duplicate' });
  });
});
