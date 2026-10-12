import {
  createEmptyForm,
  createField,
  integrationsOverviewSchema,
  type FormSchema,
} from '@formyx/shared';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { JOB_POLICIES } from '../jobs/job-types.js';
import { createSubmissionService } from '../services/submission-service.js';
import { startTestServer, type TestServer } from '../test/create-test-app.js';
import { resetDatabase, testPrisma as prisma } from '../test/database.js';
import {
  FAKE_GOOGLE_CODE,
  FAKE_GOOGLE_EMAIL,
  startFakeGoogle,
  type FakeGoogle,
} from '../test/fake-google.js';
import { createPublishedForm, createSubmission } from '../test/responses.js';
import { createTeam, requestAs, type Team } from '../test/team.js';

const name = { ...createField('short_text'), id: 'fld_name', label: 'Name' };
const guests = { ...createField('number'), id: 'fld_guests', label: 'Guests' };
const SCHEMA: FormSchema = { ...createEmptyForm(), fields: [name, guests] };

let google: FakeGoogle;
let server: TestServer;
let team: Team;

beforeAll(async () => {
  google = await startFakeGoogle();
});
afterAll(async () => {
  await google.close();
});

beforeEach(async () => {
  await resetDatabase();
  team = await createTeam(prisma);
  google.sheets.clear();
  Object.assign(google.state, {
    accessToken: 'access-1',
    refreshToken: 'refresh-1',
    revoked: false,
    failures: [],
    requests: [],
    tokenRequests: [],
    revokedTokens: [],
  });
  server = await startTestServer({
    env: {
      GOOGLE_CLIENT_ID: 'client-id',
      GOOGLE_CLIENT_SECRET: 'client-secret',
      GOOGLE_TOKEN_URL: google.url,
      GOOGLE_SHEETS_URL: google.url,
    },
  });
});
afterEach(async () => {
  await server.close();
});

const editor = () => requestAs(server.app, team.users.EDITOR);
const base = (formId: string) => `/api/forms/${formId}/integrations`;

/** Starts connecting Sheets as the editor and follows Google back with a code. */
async function connect(formId: string, { as = team.users.EDITOR } = {}) {
  const started = await requestAs(server.app, team.users.EDITOR)
    .post(`${base(formId)}/google_sheets/connect`)
    .expect(200);
  const authorize = new URL((started.body as { authorizeUrl: string }).authorizeUrl);
  const state = authorize.searchParams.get('state') ?? '';
  const back = await requestAs(server.app, as)
    .get(`/api/integrations/google/callback?code=${FAKE_GOOGLE_CODE}&state=${state}`)
    .expect(303);
  return { authorize, location: back.headers.location ?? '' };
}

async function respond(slug: string, answers: Record<string, unknown>) {
  await request(server.app)
    .post(`/api/public/forms/${slug}/submissions`)
    .send({ answers })
    .expect(201);
}

const integration = () => prisma.integration.findFirstOrThrow();

describe('connecting Google Sheets', () => {
  it('asks Google for access to its own files only, with a signed state', async () => {
    const form = await createPublishedForm(prisma, team.workspaceId, SCHEMA);
    const res = await editor()
      .post(`${base(form.id)}/google_sheets/connect`)
      .expect(200);
    const url = new URL((res.body as { authorizeUrl: string }).authorizeUrl);

    expect(url.searchParams.get('scope')).toBe(
      'openid email https://www.googleapis.com/auth/drive.file',
    );
    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('redirect_uri')).toBe(
      'https://app.formyx.test/api/integrations/google/callback',
    );
    expect(url.searchParams.get('state')?.split('.')).toHaveLength(3);
  });

  it('is for editors only', async () => {
    const form = await createPublishedForm(prisma, team.workspaceId, SCHEMA);
    await requestAs(server.app, team.users.VIEWER)
      .post(`${base(form.id)}/google_sheets/connect`)
      .expect(403);
  });

  it('makes a sheet with every response so far, keeping the tokens sealed', async () => {
    const form = await createPublishedForm(prisma, team.workspaceId, SCHEMA, 'Party');
    await createSubmission(prisma, form.id, {
      answers: { fld_name: 'Ada', fld_guests: 2 },
      createdAt: new Date('2026-10-01T10:00:00Z'),
    });
    await createSubmission(prisma, form.id, {
      answers: { fld_name: '=HYPERLINK("https://evil.example")' },
      createdAt: new Date('2026-10-02T10:00:00Z'),
    });

    const { location } = await connect(form.id);

    expect(location).toBe(
      `https://app.formyx.test/app/forms/${form.id}/integrations?connected=google_sheets`,
    );
    await vi.waitFor(async () => {
      expect((await integration()).status).toBe('ACTIVE');
    });
    const sheet = google.sheet();
    expect(sheet.title).toBe('Party responses');
    expect(sheet.rows[0]).toEqual([
      'Response ID',
      'Submitted at (UTC)',
      'Name',
      'Guests',
      'Time to complete (seconds)',
    ]);
    // Oldest first; answers that look like formulas stay text.
    expect(sheet.rows.slice(1).map((row) => row[2])).toEqual([
      'Ada',
      '=HYPERLINK("https://evil.example")',
    ]);
    expect(sheet.formats[1]).toBe('DATE_TIME');

    const stored = await integration();
    expect(stored.accountLabel).toBe(FAKE_GOOGLE_EMAIL);
    expect(stored.credentialsEncrypted).not.toContain('refresh-1');
    expect(stored.credentialsEncrypted).toMatch(/^v2\./);
  });

  it('refuses a callback started by someone else', async () => {
    const form = await createPublishedForm(prisma, team.workspaceId, SCHEMA);
    const { location } = await connect(form.id, { as: team.users.OWNER });

    expect(location).toContain('connect_error=expired');
    expect(await prisma.integration.count()).toBe(0);
  });

  it('says so when people decline on Google’s page', async () => {
    const form = await createPublishedForm(prisma, team.workspaceId, SCHEMA);
    const started = await editor()
      .post(`${base(form.id)}/google_sheets/connect`)
      .expect(200);
    const state = new URL((started.body as { authorizeUrl: string }).authorizeUrl).searchParams.get(
      'state',
    );
    const back = await editor()
      .get(`/api/integrations/google/callback?error=access_denied&state=${state ?? ''}`)
      .expect(303);
    expect(back.headers.location).toContain('connect_error=denied');
  });
});

describe('keeping the sheet up to date', () => {
  async function connected() {
    const form = await createPublishedForm(prisma, team.workspaceId, SCHEMA);
    await connect(form.id);
    await vi.waitFor(async () => {
      expect((await integration()).status).toBe('ACTIVE');
    });
    return form;
  }

  it('adds each new response as it arrives', async () => {
    const form = await connected();
    await respond(form.slug, { fld_name: 'Grace', fld_guests: 3 });

    await vi.waitFor(() => {
      expect(google.sheet().rows).toHaveLength(2);
    });
    expect(google.sheet().rows[1]?.slice(2, 4)).toEqual(['Grace', 3]);
  });

  it('rewrites a response’s own row when its respondent changes it', async () => {
    const form = await connected();
    await respond(form.slug, { fld_name: 'Grace' });
    await respond(form.slug, { fld_name: 'Linus' });
    await vi.waitFor(() => {
      expect(google.sheet().rows).toHaveLength(3);
    });

    const first = await prisma.submission.findFirstOrThrow({ orderBy: { createdAt: 'asc' } });
    await prisma.submission.update({
      where: { id: first.id },
      data: { answers: { fld_name: 'Grace Hopper' }, editedAt: new Date() },
    });
    const submission = await createSubmissionService(prisma).get(form.id, first.id);
    server.events.emit('submission.updated', { formId: form.id, submission });

    await vi.waitFor(() => {
      expect(google.sheet().rows[1]?.[2]).toBe('Grace Hopper');
    });
    expect(google.sheet().rows).toHaveLength(3);
  });

  it('adds a new question as a new column at the end', async () => {
    const form = await connected();
    const notes = { ...createField('long_text'), id: 'fld_notes', label: 'Notes' };
    const next = { ...SCHEMA, fields: [name, notes, guests] };
    await prisma.form.update({ where: { id: form.id }, data: { publishedSchema: next } });

    await respond(form.slug, { fld_name: 'Ada', fld_notes: 'Vegetarian', fld_guests: 1 });

    await vi.waitFor(() => {
      expect(google.sheet().rows[0]?.at(-1)).toBe('Notes');
    });
    const row = google.sheet().rows[1] ?? [];
    expect(row[2]).toBe('Ada');
    expect(row[3]).toBe(1);
    expect(row.at(-1)).toBe('Vegetarian');
  });

  it('rides out Google’s trouble, then shows the sheet as up to date', async () => {
    const form = await connected();
    google.state.failures.push(503, 429);

    await respond(form.slug, { fld_name: 'Ada' });

    await vi.waitFor(() => {
      expect(google.sheet().rows).toHaveLength(2);
    });
    const stored = await integration();
    expect(stored.status).toBe('ACTIVE');
    expect(stored.lastError).toBeNull();
  });

  it('asks for a reconnect when access is revoked, and catches up after it', async () => {
    const form = await connected();
    google.state.revoked = true;
    google.state.accessToken = 'access-gone';

    await respond(form.slug, { fld_name: 'Ada' });

    await vi.waitFor(async () => {
      expect((await integration()).status).toBe('NEEDS_RECONNECT');
    });
    const overview = integrationsOverviewSchema.parse(
      (await editor().get(base(form.id)).expect(200)).body,
    );
    expect(overview.integrations[0]).toMatchObject({
      status: 'needs_reconnect',
      lastError: expect.stringMatching(/revoked|expired/) as unknown,
    });
    expect(overview.failures).toEqual([
      expect.objectContaining({ queue: 'integration.sync', summary: 'Add a new response' }),
    ]);
    // Revoked access isn't retried: one try.
    expect(overview.failures[0]?.attempts).toBe(1);

    google.state.revoked = false;
    google.state.accessToken = 'access-1';
    await connect(form.id);

    await vi.waitFor(async () => {
      expect((await integration()).status).toBe('ACTIVE');
    });
    expect(google.sheets.size).toBe(1);
    expect(google.sheet().rows.map((row) => row[2])).toEqual(['Name', 'Ada']);
    expect(await prisma.jobFailure.count({ where: { resolvedAt: null } })).toBe(0);
  });

  it('stops copying while paused, and catches up when resumed', async () => {
    const form = await connected();
    const { id } = await integration();
    await editor()
      .patch(`${base(form.id)}/${id}`, { paused: true })
      .expect(200);

    await respond(form.slug, { fld_name: 'Ada' });
    await server.jobs.drain();
    expect(google.sheet().rows).toHaveLength(1);

    await editor()
      .patch(`${base(form.id)}/${id}`, { paused: false })
      .expect(200);
    await vi.waitFor(() => {
      expect(google.sheet().rows).toHaveLength(2);
    });
  });

  it('copies everything again on a re-sync, without duplicates', async () => {
    const form = await connected();
    await respond(form.slug, { fld_name: 'Ada' });
    await vi.waitFor(() => {
      expect(google.sheet().rows).toHaveLength(2);
    });
    google.sheet().rows.push(['stray', 'row']);

    const { id } = await integration();
    await editor()
      .post(`${base(form.id)}/${id}/resync`)
      .expect(202);

    await vi.waitFor(async () => {
      expect((await integration()).status).toBe('ACTIVE');
    });
    expect(google.sheet().rows.map((row) => row[2])).toEqual(['Name', 'Ada']);
  });

  it('lists a job that ran out of tries, and sends it again on retry', async () => {
    const form = await connected();
    const tries = JOB_POLICIES['integration.sync'].attempts;
    google.state.failures.push(...Array.from({ length: tries }, () => 500));

    await respond(form.slug, { fld_name: 'Ada' });
    await vi.waitFor(async () => {
      expect((await integration()).status).toBe('ERROR');
    });
    const { failures } = integrationsOverviewSchema.parse(
      (await editor().get(base(form.id)).expect(200)).body,
    );
    expect(failures).toHaveLength(1);
    expect(failures[0]?.attempts).toBe(tries);

    await editor()
      .post(`/api/forms/${form.id}/job-failures/${failures[0]?.id ?? ''}/retry`)
      .expect(202);
    await vi.waitFor(() => {
      expect(google.sheet().rows).toHaveLength(2);
    });
    const after = integrationsOverviewSchema.parse(
      (await editor().get(base(form.id)).expect(200)).body,
    );
    expect(after.failures).toEqual([]);
    expect(after.integrations[0]?.status).toBe('active');
  });

  it('gives up the account’s access when disconnected, leaving the sheet', async () => {
    const form = await connected();
    const { id } = await integration();
    await editor()
      .delete(`${base(form.id)}/${id}`)
      .expect(204);

    expect(google.state.revokedTokens).toEqual(['refresh-1']);
    expect(await prisma.integration.count()).toBe(0);
    expect(google.sheets.size).toBe(1);
  });
});

describe('the Integrations overview', () => {
  it('shows each integration’s state without anything secret', async () => {
    const form = await createPublishedForm(prisma, team.workspaceId, SCHEMA);
    await connect(form.id);
    await vi.waitFor(async () => {
      expect((await integration()).status).toBe('ACTIVE');
    });

    const res = await editor().get(base(form.id)).expect(200);
    const overview = integrationsOverviewSchema.parse(res.body);
    expect(overview.available).toEqual({ google_sheets: true, notion: false });
    expect(overview.integrations).toEqual([
      expect.objectContaining({
        kind: 'google_sheets',
        status: 'active',
        accountLabel: FAKE_GOOGLE_EMAIL,
        connectedBy: 'EDITOR',
        target: { name: 'Google Sheet', url: expect.stringContaining('sheet-1') as unknown },
      }),
    ]);
    expect(JSON.stringify(res.body)).not.toMatch(/refresh-1|access-1|v2\./);
  });
});
