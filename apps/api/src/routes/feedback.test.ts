import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRecordingAnalytics } from '../lib/product-analytics.js';
import {
  createFakeMailer,
  createTestApp,
  startTestServer,
  type TestServer,
} from '../test/create-test-app.js';
import { resetDatabase, testPrisma as prisma } from '../test/database.js';
import { createTeam, requestAs, type Team } from '../test/team.js';

let team: Team;
let server: TestServer | undefined;

beforeEach(async () => {
  await resetDatabase();
  team = await createTeam(prisma);
});

afterEach(async () => {
  await server?.close();
  server = undefined;
});

describe('POST /api/feedback', () => {
  it('keeps the feedback and emails it to the team, replying to the sender', async () => {
    const mailer = createFakeMailer();
    server = await startTestServer({ mailer, env: { FEEDBACK_EMAIL: 'team@formyx.app' } });
    const owner = requestAs(server.app, team.users.OWNER);

    await owner
      .post('/api/feedback', {
        kind: 'problem',
        message: 'The preview <b>flickers</b> when I add a texture.',
        page: '/app/forms/abc/edit?tab=design',
      })
      .expect(201);

    const [stored] = await prisma.feedback.findMany();
    expect(stored).toMatchObject({
      userId: team.users.OWNER,
      kind: 'PROBLEM',
      message: 'The preview <b>flickers</b> when I add a texture.',
      page: '/app/forms/abc/edit',
    });
    await expect.poll(() => mailer.sent.length).toBe(1);
    const [message] = mailer.sent[0]?.messages ?? [];
    expect(message).toMatchObject({
      to: 'team@formyx.app',
      replyTo: 'owner@example.com',
      subject: 'Feedback: a problem from OWNER',
    });
    // Escaped, never markup.
    expect(message?.html).toContain('&lt;b&gt;flickers&lt;/b&gt;');
  });

  it('only stores it without FEEDBACK_EMAIL, and counts it in product analytics', async () => {
    const analytics = createRecordingAnalytics();
    const app = createTestApp({}, { analytics });

    await requestAs(app, team.users.VIEWER).post('/api/feedback', {
      kind: 'idea',
      message: 'Dark mode for forms',
    });

    expect(await prisma.feedback.count()).toBe(1);
    expect(analytics.events).toEqual([
      {
        event: { name: 'feedback_sent', properties: { kind: 'idea' } },
        userId: team.users.VIEWER,
      },
    ]);
  });

  it('refuses empty messages and limits each person', async () => {
    const app = createTestApp();
    const viewer = requestAs(app, team.users.VIEWER);
    await viewer.post('/api/feedback', { kind: 'idea', message: '  ' }).expect(400);

    // The refused one counts too: ten tries in all.
    for (let i = 0; i < 9; i += 1) {
      await viewer.post('/api/feedback', { kind: 'idea', message: `Idea ${i}` }).expect(201);
    }
    await viewer.post('/api/feedback', { kind: 'idea', message: 'One more' }).expect(429);
    // Someone else can still send theirs.
    await requestAs(app, team.users.EDITOR)
      .post('/api/feedback', { kind: 'other', message: 'Hello' })
      .expect(201);
  });
});
