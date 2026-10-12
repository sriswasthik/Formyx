import {
  accountPreferencesSchema,
  apiErrorSchema,
  createDefaultAccountPreferences,
  createDefaultWorkspacePreferences,
  formDetailSchema,
  soleOwnerDetailsSchema,
  workspacePreferencesSchema,
} from '@formyx/shared';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from '../test/create-test-app.js';
import { resetDatabase, testPrisma as prisma } from '../test/database.js';
import { createTeam, requestAs, type Team } from '../test/team.js';

// The signed-in person's own account (preferences, password, leaving) and a workspace's
// preferences.

const app = createTestApp();
const PASSWORD = 'correct horse battery';

/** Signs up through the API and returns a cookie-keeping agent. */
async function signUp(email = 'ada@example.com') {
  const agent = request.agent(app);
  await agent
    .post('/api/auth/register')
    .send({ name: 'Ada', email, password: PASSWORD })
    .expect(201);
  return agent;
}

beforeEach(async () => {
  await resetDatabase();
});

describe('account preferences', () => {
  it('start from the defaults and keep what is saved', async () => {
    const agent = await signUp();
    const initial = await agent.get('/api/account/preferences').expect(200);
    expect(accountPreferencesSchema.parse(initial.body)).toEqual(createDefaultAccountPreferences());

    const saved = { theme: 'dark', reducedMotion: 'reduce', language: 'te', emailOnNewForms: true };
    await agent.put('/api/account/preferences').send(saved).expect(200);
    expect((await agent.get('/api/account/preferences').expect(200)).body).toEqual(saved);
    await agent
      .put('/api/account/preferences')
      .send({ ...saved, language: 'fr' })
      .expect(400);
  });

  it('start new forms in my language, subscribed if I asked', async () => {
    const agent = await signUp();
    await agent
      .put('/api/account/preferences')
      .send({ ...createDefaultAccountPreferences(), language: 'hi', emailOnNewForms: true })
      .expect(200);
    const me = await agent.get('/api/auth/me').expect(200);
    const workspaceId = (me.body as { workspaces: { id: string }[] }).workspaces[0]?.id ?? '';

    const created = await agent.post(`/api/workspaces/${workspaceId}/forms`).send({}).expect(201);
    const form = formDetailSchema.parse(created.body);
    expect(form.draftSchema.settings).toMatchObject({
      language: 'hi',
      submitButtonText: 'जमा करें',
    });
    expect(await prisma.formSubscription.count({ where: { formId: form.id } })).toBe(1);
  });
});

describe('changing the password', () => {
  it('needs the current one, and signs out every other session', async () => {
    const agent = await signUp();
    const other = request.agent(app);
    await other
      .post('/api/auth/login')
      .send({ email: 'ada@example.com', password: PASSWORD })
      .expect(200);

    const wrong = await agent
      .post('/api/account/password')
      .send({ currentPassword: 'nope nope nope', newPassword: 'a new long password' })
      .expect(400);
    expect(apiErrorSchema.parse(wrong.body).error.code).toBe('WRONG_CODE');

    await agent
      .post('/api/account/password')
      .send({ currentPassword: PASSWORD, newPassword: 'a new long password' })
      .expect(204);
    // This session carries on with its new cookie; the other one is signed out.
    await agent.get('/api/auth/me').expect(200);
    await other.get('/api/auth/me').expect(401);
    await request(app)
      .post('/api/auth/login')
      .send({ email: 'ada@example.com', password: 'a new long password' })
      .expect(200);
  });
});

describe('deleting the account', () => {
  let team: Team;

  beforeEach(async () => {
    team = await createTeam(prisma);
  });

  it('is refused while I am the only owner of a workspace others are in', async () => {
    await prisma.user.update({
      where: { id: team.users.OWNER },
      data: { passwordHash: await import('bcrypt').then((bcrypt) => bcrypt.hash(PASSWORD, 4)) },
    });
    const res = await requestAs(app, team.users.OWNER)
      .post('/api/account/delete', { password: PASSWORD })
      .expect(409);
    const { error } = apiErrorSchema.parse(res.body);
    expect(error.code).toBe('LAST_OWNER');
    expect(soleOwnerDetailsSchema.parse(error.details).workspaces).toEqual([
      { id: team.workspaceId, name: 'Team' },
    ]);
  });

  it('deletes me and the workspaces only I am in, and keeps shared ones', async () => {
    const agent = await signUp('grace@example.com');
    const me = await agent.get('/api/auth/me').expect(200);
    const own = me.body as { user: { id: string }; workspaces: { id: string }[] };
    await prisma.membership.create({
      data: { userId: own.user.id, workspaceId: team.workspaceId, role: 'EDITOR' },
    });

    await agent.post('/api/account/delete').send({ password: 'wrong password!' }).expect(400);
    await agent.post('/api/account/delete').send({ password: PASSWORD }).expect(204);

    expect(await prisma.user.findUnique({ where: { id: own.user.id } })).toBeNull();
    expect(
      await prisma.workspace.findUnique({ where: { id: own.workspaces[0]?.id ?? '' } }),
    ).toBeNull();
    expect(await prisma.workspace.findUnique({ where: { id: team.workspaceId } })).not.toBeNull();
    await agent.get('/api/auth/me').expect(401);
  });
});

describe('workspace preferences', () => {
  let team: Team;

  beforeEach(async () => {
    team = await createTeam(prisma);
  });

  it('are read by members and changed by owners', async () => {
    const url = `/api/workspaces/${team.workspaceId}/preferences`;
    const viewer = requestAs(app, team.users.VIEWER);
    const read = await viewer.get(url).expect(200);
    expect(workspacePreferencesSchema.parse(read.body)).toEqual(
      createDefaultWorkspacePreferences(),
    );

    const preferences = {
      timeZone: 'Europe/London',
      dateFormat: 'dmy',
      defaultNotifications: { frequency: 'daily', emails: ['ops@example.com'] },
    };
    await requestAs(app, team.users.EDITOR).put(url, preferences).expect(403);
    await requestAs(app, team.users.OWNER).put(url, preferences).expect(200);
    await requestAs(app, team.users.OWNER)
      .put(url, { ...preferences, timeZone: 'Nowhere' })
      .expect(400);
    expect((await viewer.get(url).expect(200)).body).toEqual(preferences);

    // New forms start with the workspace's notifications.
    const created = await requestAs(app, team.users.EDITOR)
      .post(`/api/workspaces/${team.workspaceId}/forms`, {})
      .expect(201);
    const { id } = formDetailSchema.parse(created.body);
    const settings = await requestAs(app, team.users.EDITOR).get(`/api/forms/${id}/settings`);
    expect(settings.body).toMatchObject({
      settings: { notifications: { frequency: 'daily', emails: ['ops@example.com'] } },
    });
  });
});
