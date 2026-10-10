import {
  brandKitFromTheme,
  createDefaultTheme,
  createEmptyForm,
  createField,
  hasRole,
  type Role,
} from '@formyx/shared';
import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createSecretBox } from '../lib/webhook-signature.js';
import { createTestApp, TEST_JWT_SECRET } from '../test/create-test-app.js';
import { resetDatabase, testPrisma as prisma } from '../test/database.js';
import { createFakeCloudinary } from '../test/fake-cloudinary.js';
import { createPublishedForm, createSubmission } from '../test/responses.js';
import { createTeam, requestAs } from '../test/team.js';
import { closedPort } from '../test/webhook-receiver.js';

/*
 * Who may call what: every endpoint that needs an account, called by each kind of caller.
 * Members need at least the endpoint's role; everyone else in the workspace gets 403, people
 * outside it get 403 and signed-out visitors 401. Adding an endpoint means adding a row here.
 */

const app = createTestApp({}, { storage: createFakeCloudinary().storage });

interface Fixture {
  workspaceId: string;
  formId: string;
  formVersion: number;
  submissionId: string;
  inviteId: string;
  webhookId: string;
  brandKitId: string;
  /** A viewer whose role can be changed, or who can be removed, without side effects. */
  memberId: string;
}

type Requester = ReturnType<typeof requestAs>;

interface Endpoint {
  name: string;
  minRole: Role;
  call: (as: Requester, fixture: Fixture) => request.Test;
  /** The status a member with enough access gets. */
  ok: number;
  /** Puts the form in the state the endpoint expects. */
  prepare?: (fixture: Fixture) => Promise<unknown>;
}

const defaultTheme = createDefaultTheme();
const forms = (f: Fixture) => `/api/forms/${f.formId}`;
const workspace = (f: Fixture) => `/api/workspaces/${f.workspaceId}`;

const ENDPOINTS: Endpoint[] = [
  // Forms
  {
    name: 'list forms',
    minRole: 'VIEWER',
    ok: 200,
    call: (as, f) => as.get(`${workspace(f)}/forms`),
  },
  {
    name: 'create a form',
    minRole: 'EDITOR',
    ok: 201,
    call: (as, f) => as.post(`${workspace(f)}/forms`, {}),
  },
  { name: 'read a form', minRole: 'VIEWER', ok: 200, call: (as, f) => as.get(forms(f)) },
  {
    name: 'edit a form',
    minRole: 'EDITOR',
    ok: 200,
    call: (as, f) => as.patch(forms(f), { version: f.formVersion, title: 'Renamed' }),
  },
  {
    name: 'duplicate a form',
    minRole: 'EDITOR',
    ok: 201,
    call: (as, f) => as.post(`${forms(f)}/duplicate`),
  },
  {
    name: 'publish a form',
    minRole: 'EDITOR',
    ok: 200,
    call: (as, f) => as.post(`${forms(f)}/publish`, { version: f.formVersion }),
  },
  {
    name: 'close a form',
    minRole: 'EDITOR',
    ok: 200,
    call: (as, f) => as.post(`${forms(f)}/close`),
  },
  {
    name: 'reopen a form',
    minRole: 'EDITOR',
    ok: 200,
    prepare: (f) => prisma.form.update({ where: { id: f.formId }, data: { status: 'CLOSED' } }),
    call: (as, f) => as.post(`${forms(f)}/reopen`),
  },
  { name: 'delete a form', minRole: 'EDITOR', ok: 204, call: (as, f) => as.delete(forms(f)) },
  {
    name: 'sign a logo upload',
    minRole: 'EDITOR',
    ok: 200,
    call: (as, f) => as.get(`/api/uploads/signature?purpose=logo&formId=${f.formId}`),
  },
  // Responses
  {
    name: 'list responses',
    minRole: 'VIEWER',
    ok: 200,
    call: (as, f) => as.get(`${forms(f)}/submissions`),
  },
  {
    name: 'export responses',
    minRole: 'VIEWER',
    ok: 200,
    call: (as, f) => as.get(`${forms(f)}/submissions/export`),
  },
  {
    name: 'read a response',
    minRole: 'VIEWER',
    ok: 200,
    call: (as, f) => as.get(`${forms(f)}/submissions/${f.submissionId}`),
  },
  {
    name: 'delete a response',
    minRole: 'EDITOR',
    ok: 204,
    call: (as, f) => as.delete(`${forms(f)}/submissions/${f.submissionId}`),
  },
  {
    name: 'delete responses in bulk',
    minRole: 'EDITOR',
    ok: 200,
    call: (as, f) => as.post(`${forms(f)}/submissions/bulk-delete`, { ids: [f.submissionId] }),
  },
  {
    name: 'read analytics',
    minRole: 'VIEWER',
    ok: 200,
    call: (as, f) => as.get(`${forms(f)}/analytics`),
  },
  {
    name: 'read own notifications',
    minRole: 'VIEWER',
    ok: 200,
    call: (as, f) => as.get(`${forms(f)}/notifications`),
  },
  {
    name: 'change own notifications',
    minRole: 'VIEWER',
    ok: 200,
    call: (as, f) => as.put(`${forms(f)}/notifications`, { emailOnSubmission: true }),
  },
  // Webhooks
  {
    name: 'list webhooks',
    minRole: 'EDITOR',
    ok: 200,
    call: (as, f) => as.get(`${forms(f)}/webhooks`),
  },
  {
    name: 'add a webhook',
    minRole: 'EDITOR',
    ok: 201,
    call: (as, f) => as.post(`${forms(f)}/webhooks`, { url: 'https://hooks.example.com/x' }),
  },
  {
    name: 'remove a webhook',
    minRole: 'EDITOR',
    ok: 204,
    call: (as, f) => as.delete(`${forms(f)}/webhooks/${f.webhookId}`),
  },
  {
    name: 'read a webhook’s deliveries',
    minRole: 'EDITOR',
    ok: 200,
    call: (as, f) => as.get(`${forms(f)}/webhooks/${f.webhookId}/deliveries`),
  },
  {
    name: 'send a test event',
    minRole: 'EDITOR',
    ok: 200,
    call: (as, f) => as.post(`${forms(f)}/webhooks/${f.webhookId}/test`),
  },
  // Workspaces, members and invites
  {
    name: 'rename the workspace',
    minRole: 'OWNER',
    ok: 200,
    call: (as, f) => as.patch(workspace(f), { name: 'Acme' }),
  },
  {
    name: 'delete the workspace',
    minRole: 'OWNER',
    ok: 204,
    call: (as, f) => as.delete(workspace(f)),
  },
  {
    name: 'list members',
    minRole: 'VIEWER',
    ok: 200,
    call: (as, f) => as.get(`${workspace(f)}/members`),
  },
  {
    name: 'change a member’s role',
    minRole: 'OWNER',
    ok: 200,
    call: (as, f) => as.patch(`${workspace(f)}/members/${f.memberId}`, { role: 'EDITOR' }),
  },
  {
    name: 'remove a member',
    minRole: 'OWNER',
    ok: 204,
    call: (as, f) => as.delete(`${workspace(f)}/members/${f.memberId}`),
  },
  {
    name: 'list invites',
    minRole: 'OWNER',
    ok: 200,
    call: (as, f) => as.get(`${workspace(f)}/invites`),
  },
  {
    name: 'invite someone',
    minRole: 'OWNER',
    ok: 201,
    call: (as, f) => as.post(`${workspace(f)}/invites`, { email: 'new@example.com' }),
  },
  {
    name: 'send an invite again',
    minRole: 'OWNER',
    ok: 200,
    call: (as, f) => as.post(`${workspace(f)}/invites/${f.inviteId}/resend`),
  },
  {
    name: 'withdraw an invite',
    minRole: 'OWNER',
    ok: 204,
    call: (as, f) => as.delete(`${workspace(f)}/invites/${f.inviteId}`),
  },
  // Brand kits
  {
    name: 'list brand kits',
    minRole: 'VIEWER',
    ok: 200,
    call: (as, f) => as.get(`${workspace(f)}/brand-kits`),
  },
  {
    name: 'save a brand kit',
    minRole: 'EDITOR',
    ok: 201,
    call: (as, f) =>
      as.post(`${workspace(f)}/brand-kits`, { name: 'Kit', kit: brandKitFromTheme(defaultTheme) }),
  },
  {
    name: 'rename a brand kit',
    minRole: 'EDITOR',
    ok: 200,
    call: (as, f) => as.patch(`${workspace(f)}/brand-kits/${f.brandKitId}`, { name: 'Renamed' }),
  },
  {
    name: 'delete a brand kit',
    minRole: 'EDITOR',
    ok: 204,
    call: (as, f) => as.delete(`${workspace(f)}/brand-kits/${f.brandKitId}`),
  },
  {
    name: 'choose the default brand kit',
    minRole: 'EDITOR',
    ok: 200,
    call: (as, f) => as.put(`${workspace(f)}/default-brand-kit`, { brandKitId: f.brandKitId }),
  },
];

type Caller = Role | 'OUTSIDER' | 'SIGNED_OUT';
const CALLERS: Caller[] = ['OWNER', 'EDITOR', 'VIEWER', 'OUTSIDER', 'SIGNED_OUT'];

let fixture: Fixture;
/** Test events go here: nothing listens, so they fail fast without leaving the machine. */
let deadEnd: string;

beforeAll(async () => {
  deadEnd = `http://127.0.0.1:${await closedPort()}/hook`;
});
let users: Record<Exclude<Caller, 'SIGNED_OUT'>, string>;

beforeEach(async () => {
  await resetDatabase();
  const team = await createTeam(prisma);
  const outsider = await prisma.user.create({
    data: { name: 'Eve', email: 'eve@example.com', passwordHash: 'x' },
  });
  const member = await prisma.user.create({
    data: { name: 'Mo', email: 'mo@example.com', passwordHash: 'x' },
  });
  await prisma.membership.create({
    data: { userId: member.id, workspaceId: team.workspaceId, role: 'VIEWER' },
  });
  const form = await createPublishedForm(prisma, team.workspaceId, {
    ...createEmptyForm(),
    fields: [{ ...createField('short_text'), label: 'Name' }],
  });
  const submission = await createSubmission(prisma, form.id);
  const invite = await prisma.invite.create({
    data: {
      workspaceId: team.workspaceId,
      email: 'invited@example.com',
      role: 'EDITOR',
      tokenHash: 'hash',
      expiresAt: new Date(Date.now() + 60_000),
    },
  });
  const webhook = await prisma.webhook.create({
    data: {
      formId: form.id,
      url: deadEnd,
      secretEncrypted: createSecretBox(TEST_JWT_SECRET).encrypt('whsec_test'),
    },
  });
  const brandKit = await prisma.brandKit.create({
    data: { workspaceId: team.workspaceId, name: 'Kit', kit: brandKitFromTheme(defaultTheme) },
  });
  const { version } = await prisma.form.findUniqueOrThrow({
    where: { id: form.id },
    select: { version: true },
  });

  users = { ...team.users, OUTSIDER: outsider.id };
  fixture = {
    workspaceId: team.workspaceId,
    formId: form.id,
    formVersion: version,
    submissionId: submission.id,
    inviteId: invite.id,
    webhookId: webhook.id,
    brandKitId: brandKit.id,
    memberId: member.id,
  };
});

/** Supertest requests without a session cookie, shaped like `requestAs`. */
const signedOut: Requester = {
  get: (url) => request(app).get(url),
  post: (url, body) => (body ? request(app).post(url).send(body) : request(app).post(url)),
  patch: (url, body) => request(app).patch(url).send(body),
  put: (url, body) => request(app).put(url).send(body),
  delete: (url) => request(app).delete(url),
};

function expectedStatus(endpoint: Endpoint, caller: Caller): number {
  if (caller === 'SIGNED_OUT') return 401;
  if (caller === 'OUTSIDER') return 403;
  return hasRole(caller, endpoint.minRole) ? endpoint.ok : 403;
}

describe.each(ENDPOINTS)('$name (needs $minRole)', (endpoint) => {
  it.each(CALLERS)('%s', async (caller) => {
    await endpoint.prepare?.(fixture);
    const as = caller === 'SIGNED_OUT' ? signedOut : requestAs(app, users[caller]);

    const res = await endpoint.call(as, fixture);

    expect(res.status).toBe(expectedStatus(endpoint, caller));
  });
});
