import { formDetailSchema, type OnboardingResponse } from '@formyx/shared';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from '../test/create-test-app.js';
import { resetDatabase, testPrisma as prisma } from '../test/database.js';
import { createSubmission } from '../test/responses.js';
import { createTeam, requestAs } from '../test/team.js';

// The welcome after sign-up and the getting-started checklist.

const app = createTestApp();

async function signUp() {
  const agent = request.agent(app);
  const me = await agent
    .post('/api/auth/register')
    .send({ name: 'Ada', email: 'ada@example.com', password: 'correct horse battery' })
    .expect(201);
  const workspaceId = (me.body as { workspaces: { id: string }[] }).workspaces[0]?.id ?? '';
  return { agent, workspaceId };
}

async function onboarding(agent: ReturnType<typeof request.agent>): Promise<OnboardingResponse> {
  return (await agent.get('/api/account/onboarding').expect(200)).body as OnboardingResponse;
}

beforeEach(async () => {
  await resetDatabase();
});

describe('onboarding', () => {
  it('welcomes a new account, then remembers what it is for and that it was welcomed', async () => {
    const { agent } = await signUp();
    expect(await onboarding(agent)).toEqual({
      welcome: true,
      useCase: null,
      checklist: {
        create_form: false,
        customise_design: false,
        publish: false,
        first_response: false,
      },
    });

    await agent.patch('/api/account/onboarding').send({ useCase: 'events' }).expect(200);
    const after = await agent.patch('/api/account/onboarding').send({ welcomed: true }).expect(200);
    expect(after.body).toMatchObject({ welcome: false, useCase: 'events' });
    expect(await onboarding(agent)).toMatchObject({ welcome: false, useCase: 'events' });
  });

  it('ticks off creating, designing, publishing and the first response, then goes away', async () => {
    const { agent, workspaceId } = await signUp();
    const created = await agent
      .post(`/api/workspaces/${workspaceId}/forms`)
      .send({ templateId: 'feedback_survey' })
      .expect(201);
    const form = formDetailSchema.parse(created.body);
    expect((await onboarding(agent)).checklist).toMatchObject({
      create_form: true,
      customise_design: false,
    });

    // Autosave sends the look with every change: an unchanged one is not a design change.
    const sameLook = await agent
      .patch(`/api/forms/${form.id}`)
      .send({ version: form.version, title: 'Renamed', theme: form.theme })
      .expect(200);
    expect((await onboarding(agent)).checklist?.customise_design).toBe(false);

    const version = formDetailSchema.parse(sameLook.body).version;
    const theme = { ...form.theme, colors: { ...form.theme.colors, primary: '#123456' } };
    const designed = await agent
      .patch(`/api/forms/${form.id}`)
      .send({ version, theme })
      .expect(200);
    expect((await onboarding(agent)).checklist?.customise_design).toBe(true);

    await agent
      .post(`/api/forms/${form.id}/publish`)
      .send({ version: formDetailSchema.parse(designed.body).version })
      .expect(200);
    expect((await onboarding(agent)).checklist?.publish).toBe(true);

    await createSubmission(prisma, form.id);
    expect((await onboarding(agent)).checklist).toBeNull();
  });

  it('can be dismissed', async () => {
    const { agent } = await signUp();
    await agent.patch('/api/account/onboarding').send({ checklistDismissed: true }).expect(200);
    expect((await onboarding(agent)).checklist).toBeNull();
  });

  it('rejects changes nobody may make', async () => {
    const { agent } = await signUp();
    await agent
      .patch('/api/account/onboarding')
      .send({ designedAt: new Date().toISOString() })
      .expect(400);
    await agent.patch('/api/account/onboarding').send({ useCase: 'gardening' }).expect(400);
  });

  it('leaves accounts from before onboarding alone', async () => {
    const team = await createTeam(prisma);
    const res = await requestAs(app, team.users.OWNER).get('/api/account/onboarding').expect(200);
    expect(res.body).toEqual({ welcome: false, useCase: null, checklist: null });
  });
});
