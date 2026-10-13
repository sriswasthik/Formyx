import {
  brandKitFromTheme,
  createDefaultLiveSettings,
  createDefaultTheme,
  createEmptyForm,
  createField,
  hasRole,
  type Role,
} from '@formyx/shared';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createSecretBox } from '../lib/webhook-signature.js';
import { createTestApp, TEST_JWT_SECRET } from '../test/create-test-app.js';
import { matchesRoute, recordRoutes } from '../test/route-inventory.js';
import { resetDatabase, testPrisma as prisma } from '../test/database.js';
import { createFakeCloudinary } from '../test/fake-cloudinary.js';
import { checkoutSignature, startFakeRazorpay } from '../test/fake-razorpay.js';
import { createPublishedForm, createSubmission } from '../test/responses.js';
import { createTeam, requestAs } from '../test/team.js';
import { closedPort } from '../test/webhook-receiver.js';

/*
 * Who may call what: every endpoint that needs an account, called by each kind of caller.
 * Members need at least the endpoint's role; everyone else in the workspace gets 403, people
 * outside it get 403 and signed-out visitors 401. Adding an endpoint means adding a row here,
 * or to SIGNED_IN or PUBLIC below: the last test fails for an endpoint in none of them.
 */

// Billing talks to a fake Razorpay, so owners' calls get as far as a real checkout would.
const razorpay = await startFakeRazorpay();
afterAll(async () => {
  await razorpay.close();
});

const { result: app, routes } = recordRoutes(() =>
  createTestApp(
    // Configured, so connecting reaches the point of sending people to Google.
    {
      GOOGLE_CLIENT_ID: 'google-client',
      GOOGLE_CLIENT_SECRET: 'google-secret',
      ...razorpay.env,
    },
    { storage: createFakeCloudinary().storage },
  ),
);

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
  integrationId: string;
  failureId: string;
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
const SLACK = 'https://hooks.slack.com/services/T000/B000/abcdef123456';
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
  {
    name: 'export responses to Excel',
    minRole: 'VIEWER',
    ok: 200,
    call: (as, f) => as.get(`${forms(f)}/submissions/export.xlsx`),
  },
  {
    name: 'delete every response',
    minRole: 'EDITOR',
    ok: 200,
    // createPublishedForm's title.
    call: (as, f) => as.post(`${forms(f)}/submissions/delete-all`, { confirm: 'Customer survey' }),
  },
  // Form settings
  {
    name: 'read form settings',
    minRole: 'VIEWER',
    ok: 200,
    call: (as, f) => as.get(`${forms(f)}/settings`),
  },
  {
    name: 'change form settings',
    minRole: 'EDITOR',
    ok: 200,
    call: (as, f) => as.patch(`${forms(f)}/settings`, { data: { retentionDays: 30 } }),
  },
  {
    name: 'set a form password',
    minRole: 'EDITOR',
    ok: 200,
    call: (as, f) => as.put(`${forms(f)}/settings/password`, { password: 'open-sesame-1' }),
  },
  {
    name: 'connect a chat webhook',
    minRole: 'EDITOR',
    ok: 200,
    call: (as, f) => as.put(`${forms(f)}/settings/chat`, { service: 'slack', url: SLACK }),
  },
  {
    name: 'send a test chat message',
    minRole: 'EDITOR',
    ok: 204,
    prepare: (f) =>
      prisma.form.update({
        where: { id: f.formId },
        data: { slackWebhookEncrypted: createSecretBox(TEST_JWT_SECRET).encrypt(SLACK) },
      }),
    call: (as, f) => as.post(`${forms(f)}/settings/chat/test`, { service: 'slack' }),
  },
  {
    name: 'change the form’s link',
    minRole: 'EDITOR',
    ok: 200,
    call: (as, f) => as.put(`${forms(f)}/slug`, { slug: 'renamed-form' }),
  },
  {
    name: 'send a test autoresponder',
    minRole: 'EDITOR',
    ok: 202,
    call: (as, f) =>
      as.post(`${forms(f)}/settings/autoresponder/test`, {
        autoresponder: createDefaultLiveSettings().autoresponder,
      }),
  },
  // Integrations
  {
    name: 'list integrations',
    minRole: 'EDITOR',
    ok: 200,
    call: (as, f) => as.get(`${forms(f)}/integrations`),
  },
  {
    name: 'connect Google Sheets',
    minRole: 'EDITOR',
    ok: 200,
    call: (as, f) => as.post(`${forms(f)}/integrations/google_sheets/connect`),
  },
  {
    name: 'pause an integration',
    minRole: 'EDITOR',
    ok: 200,
    call: (as, f) => as.patch(`${forms(f)}/integrations/${f.integrationId}`, { paused: true }),
  },
  {
    name: 'copy every response again',
    minRole: 'EDITOR',
    ok: 202,
    call: (as, f) => as.post(`${forms(f)}/integrations/${f.integrationId}/resync`),
  },
  {
    name: 'disconnect an integration',
    minRole: 'EDITOR',
    ok: 204,
    call: (as, f) => as.delete(`${forms(f)}/integrations/${f.integrationId}`),
  },
  {
    name: 'retry a failed job',
    minRole: 'EDITOR',
    ok: 202,
    call: (as, f) => as.post(`${forms(f)}/job-failures/${f.failureId}/retry`),
  },
  {
    name: 'dismiss a failed job',
    minRole: 'EDITOR',
    ok: 204,
    call: (as, f) => as.delete(`${forms(f)}/job-failures/${f.failureId}`),
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
    name: 'read the plan’s entitlements',
    minRole: 'VIEWER',
    ok: 200,
    call: (as, f) => as.get(`${workspace(f)}/entitlements`),
  },
  {
    name: 'read workspace preferences',
    minRole: 'VIEWER',
    ok: 200,
    call: (as, f) => as.get(`${workspace(f)}/preferences`),
  },
  {
    name: 'change workspace preferences',
    minRole: 'OWNER',
    ok: 200,
    call: (as, f) =>
      as.put(`${workspace(f)}/preferences`, {
        timeZone: 'Europe/London',
        dateFormat: 'dmy',
        defaultNotifications: { frequency: 'instant', emails: [] },
      }),
  },
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
  // Billing: owners only
  {
    name: 'read billing',
    minRole: 'OWNER',
    ok: 200,
    call: (as, f) => as.get(`${workspace(f)}/billing`),
  },
  {
    name: 'list payments',
    minRole: 'OWNER',
    ok: 200,
    call: (as, f) => as.get(`${workspace(f)}/billing/payments`),
  },
  {
    name: 'start a subscription',
    minRole: 'OWNER',
    ok: 201,
    prepare: (f) => prisma.subscription.deleteMany({ where: { workspaceId: f.workspaceId } }),
    call: (as, f) =>
      as.post(`${workspace(f)}/billing/subscribe`, { plan: 'PRO', interval: 'monthly' }),
  },
  {
    name: 'confirm a checkout',
    minRole: 'OWNER',
    ok: 200,
    prepare: (f) => runningSubscription(f, { status: 'CREATED' }),
    call: (as, f) =>
      as.post(`${workspace(f)}/billing/verify`, {
        razorpayPaymentId: 'pay_matrix',
        razorpaySubscriptionId: MATRIX_SUBSCRIPTION,
        razorpaySignature: checkoutSignature('pay_matrix', MATRIX_SUBSCRIPTION),
      }),
  },
  {
    name: 'cancel the plan',
    minRole: 'OWNER',
    ok: 200,
    prepare: (f) => runningSubscription(f),
    call: (as, f) => as.post(`${workspace(f)}/billing/cancel`, {}),
  },
  {
    name: 'resume the plan',
    minRole: 'OWNER',
    ok: 201,
    prepare: (f) => runningSubscription(f, { cancelAtPeriodEnd: true }),
    call: (as, f) => as.post(`${workspace(f)}/billing/resume`),
  },
  {
    name: 'change the plan',
    minRole: 'OWNER',
    ok: 200,
    prepare: (f) => runningSubscription(f),
    call: (as, f) =>
      as.post(`${workspace(f)}/billing/change-plan`, { plan: 'BUSINESS', interval: 'monthly' }),
  },
  {
    name: 'dismiss what a downgrade changed',
    minRole: 'OWNER',
    ok: 204,
    call: (as, f) => as.post(`${workspace(f)}/billing/dismiss-downgrade`),
  },
];

const MATRIX_SUBSCRIPTION = 'sub_matrix';
const DAY_MS = 24 * 60 * 60 * 1000;

/** The workspace's one subscription, running on Pro (here and in the fake Razorpay). */
async function runningSubscription(
  f: Fixture,
  data: { status?: 'CREATED' | 'ACTIVE'; cancelAtPeriodEnd?: boolean } = {},
) {
  await prisma.subscription.deleteMany({ where: { workspaceId: f.workspaceId } });
  await prisma.subscription.create({
    data: {
      workspaceId: f.workspaceId,
      razorpaySubscriptionId: MATRIX_SUBSCRIPTION,
      plan: 'PRO',
      interval: 'MONTHLY',
      status: data.status ?? 'ACTIVE',
      cancelAtPeriodEnd: data.cancelAtPeriodEnd ?? false,
      currentPeriodStart: new Date(Date.now() - DAY_MS),
      currentPeriodEnd: new Date(Date.now() + 29 * DAY_MS),
    },
  });
  razorpay.subscriptions.set(MATRIX_SUBSCRIPTION, {
    id: MATRIX_SUBSCRIPTION,
    plan_id: 'plan_promonthly',
    status: 'active',
    total_count: 120,
  });
}

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
  const integration = await prisma.integration.create({
    data: {
      formId: form.id,
      kind: 'GOOGLE_SHEETS',
      status: 'ACTIVE',
      connectedById: team.users.OWNER,
      accountLabel: 'sheets@example.com',
    },
  });
  const failure = await prisma.jobFailure.create({
    data: {
      queue: 'integration.sync',
      jobId: 'job-1',
      formId: form.id,
      integrationId: integration.id,
      summary: 'Add a new response',
      error: 'Google said no',
      attempts: 8,
      data: { formId: form.id, integrationId: integration.id, submissionId: submission.id },
    },
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
    integrationId: integration.id,
    failureId: failure.id,
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

/*
 * Endpoints outside the matrix: those for the signed-in person themselves (signed-out
 * visitors get 401), and public ones, which must have a rate limit of their own.
 */
const SIGNED_IN: [method: string, url: string][] = [
  ['GET', '/api/auth/me'],
  ['GET', '/api/realtime/token'],
  ['POST', '/api/workspaces'],
  ['GET', '/api/account/preferences'],
  ['PUT', '/api/account/preferences'],
  ['GET', '/api/account/onboarding'],
  ['PATCH', '/api/account/onboarding'],
  ['POST', '/api/account/password'],
  ['POST', '/api/account/delete'],
  ['POST', '/api/invites/token/accept'],
  ['POST', '/api/feedback'],
  // Admins only; everyone else signed in gets 403 (see admin.test.ts).
  ['GET', '/api/admin/workspaces'],
  ['GET', '/api/admin/workspaces/id'],
  ['POST', '/api/admin/workspaces/id/complimentary'],
  ['DELETE', '/api/admin/workspaces/id/complimentary'],
  ['POST', '/api/admin/workspaces/id/extend-trial'],
];

/** Public endpoints, and why any of them may go without a limit of its own. */
const PUBLIC: [method: string, url: string, unlimited?: string][] = [
  ['GET', '/api/health', 'answers uptime checks and touches nothing'],
  ['POST', '/api/auth/register'],
  ['POST', '/api/auth/login'],
  ['POST', '/api/auth/demo'],
  ['POST', '/api/auth/logout', 'only clears a cookie'],
  ['GET', '/api/invites/token'],
  [
    'GET',
    '/api/uploads/signature',
    'limits respondents in its first handler, and needs a session for everything else',
  ],
  ['GET', '/api/public/pincodes/500001'],
  ['GET', '/api/integrations/google/callback'],
  ['GET', '/api/integrations/notion/callback'],
  [
    'POST',
    '/api/webhooks/razorpay',
    'only Razorpay can sign it: a wrong signature costs one HMAC, under the API-wide limit',
  ],
  ...(
    [
      ['GET', ''],
      ['GET', '/meta'],
      ['GET', '/og.png'],
      ['POST', '/unlock'],
      ['POST', '/verify'],
      ['POST', '/verify/check'],
      ['POST', '/view'],
      ['POST', '/progress'],
      ['POST', '/drafts'],
      ['POST', '/drafts/resume'],
      ['POST', '/edit'],
      ['POST', '/submissions'],
    ] as const
  ).map(([method, path]): [string, string] => [method, `/api/public/forms/slug${path}`]),
];

/** The method and URL each matrix row calls, found by calling it with a recorder. */
function matrixCalls(): [string, string][] {
  const calls: [string, string][] = [];
  const stub = new Proxy({}, { get: () => () => stub }) as request.Test;
  const record = (method: string) => (url: string) => {
    calls.push([method, url]);
    return stub;
  };
  const recorder: Requester = {
    get: record('GET'),
    post: record('POST'),
    patch: record('PATCH'),
    put: record('PUT'),
    delete: record('DELETE'),
  };
  const ids = new Proxy({}, { get: () => 'id' }) as Fixture;
  for (const endpoint of ENDPOINTS) endpoint.call(recorder, ids);
  return calls;
}

describe('the endpoint inventory', () => {
  const listed = [...matrixCalls(), ...SIGNED_IN, ...PUBLIC];
  const covers = (route: (typeof routes)[number]) =>
    listed.some(([method, url]) => method === route.method && matchesRoute(route.path, url));

  it('finds the routes', () => {
    expect(routes.length).toBeGreaterThan(80);
  });

  it('has every endpoint in the matrix, SIGNED_IN or PUBLIC', () => {
    const missing = routes.filter((route) => !covers(route));
    expect(missing.map(({ method, path }) => `${method} ${path}`)).toEqual([]);
  });

  it('turns signed-out visitors away from SIGNED_IN endpoints', async () => {
    for (const [method, url] of SIGNED_IN) {
      const res = await request(app)[method.toLowerCase() as 'get'](url);
      expect(res.status, `${method} ${url}`).toBe(401);
    }
  });

  it('gives every public endpoint a rate limit of its own, or a reason not to', () => {
    const unlimited = routes.filter(
      (route) =>
        !route.limited &&
        PUBLIC.some(
          ([method, url, reason]) =>
            !reason && method === route.method && matchesRoute(route.path, url),
        ),
    );
    expect(unlimited.map(({ method, path }) => `${method} ${path}`)).toEqual([]);
  });

  it('puts everything outside public forms and health under the API-wide limit', () => {
    expect(routes.filter((route) => !route.apiWide)).toEqual([]);
  });
});
