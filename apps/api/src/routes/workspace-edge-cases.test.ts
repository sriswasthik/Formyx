import { createEmptyForm } from '@formyx/shared';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from '../test/create-test-app.js';
import { resetDatabase, testPrisma as prisma } from '../test/database.js';
import { startFakeRazorpay } from '../test/fake-razorpay.js';
import { createPublishedForm } from '../test/responses.js';
import { createTeam, requestAs, type Team } from '../test/team.js';

const razorpay = await startFakeRazorpay();
afterAll(async () => {
  await razorpay.close();
});
const app = createTestApp(razorpay.env);
const appWithoutBilling = createTestApp();

let team: Team;
beforeEach(async () => {
  await resetDatabase();
  razorpay.reset();
  team = await createTeam(prisma);
});

const as = (userId: string) => requestAs(app, userId);
const memberPath = (userId: string) => `/api/workspaces/${team.workspaceId}/members/${userId}`;

describe('a member leaving', () => {
  it('leaves their forms, brand kits and webhooks with the workspace, passed to an owner', async () => {
    const form = await createPublishedForm(prisma, team.workspaceId, createEmptyForm());
    await prisma.form.update({ where: { id: form.id }, data: { createdById: team.users.EDITOR } });
    const kit = await prisma.brandKit.create({
      data: {
        workspaceId: team.workspaceId,
        name: 'Ours',
        kit: {},
        createdById: team.users.EDITOR,
      },
    });
    const webhook = await prisma.webhook.create({
      data: {
        formId: form.id,
        url: 'https://example.com/hook',
        secretEncrypted: 'x',
        createdById: team.users.EDITOR,
      },
    });
    await prisma.formSubscription.create({ data: { userId: team.users.EDITOR, formId: form.id } });

    await as(team.users.EDITOR).delete(memberPath(team.users.EDITOR)).expect(204);

    const stored = await prisma.form.findUniqueOrThrow({ where: { id: form.id } });
    expect(stored.createdById).toBe(team.users.OWNER);
    expect((await prisma.brandKit.findUniqueOrThrow({ where: { id: kit.id } })).createdById).toBe(
      team.users.OWNER,
    );
    expect(
      (await prisma.webhook.findUniqueOrThrow({ where: { id: webhook.id } })).createdById,
    ).toBe(team.users.OWNER);
    // They no longer belong to the workspace, so its response emails stop too.
    expect(await prisma.formSubscription.count({ where: { userId: team.users.EDITOR } })).toBe(0);
  });

  it('passes them to the longest-standing owner who stays, when an owner leaves', async () => {
    await prisma.membership.update({
      where: { userId_workspaceId: { userId: team.users.EDITOR, workspaceId: team.workspaceId } },
      data: { role: 'OWNER' },
    });
    const form = await createPublishedForm(prisma, team.workspaceId, createEmptyForm());
    await prisma.form.update({ where: { id: form.id }, data: { createdById: team.users.OWNER } });

    await as(team.users.OWNER).delete(memberPath(team.users.OWNER)).expect(204);

    const stored = await prisma.form.findUniqueOrThrow({ where: { id: form.id } });
    expect(stored.createdById).toBe(team.users.EDITOR);
  });

  it('leaves forms in other workspaces alone', async () => {
    const elsewhere = await prisma.workspace.create({ data: { name: 'Mine', slug: 'mine' } });
    await prisma.membership.create({
      data: { userId: team.users.EDITOR, workspaceId: elsewhere.id, role: 'OWNER' },
    });
    const own = await createPublishedForm(prisma, elsewhere.id, createEmptyForm());
    await prisma.form.update({ where: { id: own.id }, data: { createdById: team.users.EDITOR } });

    await as(team.users.EDITOR).delete(memberPath(team.users.EDITOR)).expect(204);

    const stored = await prisma.form.findUniqueOrThrow({ where: { id: own.id } });
    expect(stored.createdById).toBe(team.users.EDITOR);
  });
});

describe('deleting a workspace that pays for a plan', () => {
  async function subscribe(status: 'ACTIVE' | 'CANCELLED' = 'ACTIVE') {
    razorpay.subscriptions.set('sub_live', {
      id: 'sub_live',
      plan_id: 'plan_promonthly',
      status: status === 'ACTIVE' ? 'active' : 'cancelled',
      total_count: 120,
    });
    await prisma.subscription.create({
      data: {
        workspaceId: team.workspaceId,
        razorpaySubscriptionId: 'sub_live',
        plan: 'PRO',
        interval: 'MONTHLY',
        status,
      },
    });
  }
  const remove = (target = app) =>
    requestAs(target, team.users.OWNER).delete(`/api/workspaces/${team.workspaceId}`);

  it('cancels the plan at once, then deletes the workspace', async () => {
    await subscribe();

    await remove().expect(204);

    expect(razorpay.subscriptions.get('sub_live')?.status).toBe('cancelled');
    const cancel = razorpay.requests.find((call) => call.path.endsWith('/sub_live/cancel'));
    expect(cancel?.body).toMatchObject({ cancel_at_cycle_end: 0 });
    expect(await prisma.workspace.count()).toBe(0);
  });

  it('keeps the workspace when the plan can’t be cancelled', async () => {
    await subscribe();
    razorpay.fail(500);

    await remove().expect(502);

    expect(await prisma.workspace.count()).toBe(1);
  });

  it('keeps the workspace on a server that can’t reach Razorpay', async () => {
    await subscribe();

    const res = await remove(appWithoutBilling).expect(503);

    expect((res.body as { error: { code: string } }).error.code).toBe('BILLING_UNAVAILABLE');
    expect(await prisma.workspace.count()).toBe(1);
  });

  it('deletes at once when nothing is running', async () => {
    await subscribe('CANCELLED');

    await remove(appWithoutBilling).expect(204);

    expect(razorpay.requests).toEqual([]);
    expect(await prisma.workspace.count()).toBe(0);
  });
});
