import { apiErrorSchema, createEmptyForm, createField } from '@formyx/shared';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from '../test/create-test-app.js';
import { resetDatabase, testPrisma as prisma } from '../test/database.js';
import { createPublishedForm } from '../test/responses.js';
import { createTeam, requestAs, type Team } from '../test/team.js';

// Which limits stop whom. The authorization matrix checks every endpoint has one; these check
// that the API-wide ceiling and the newer per-endpoint limits answer 429 when reached.

let team: Team;

beforeEach(async () => {
  await resetDatabase();
  team = await createTeam(prisma);
});

describe('the API-wide limit', () => {
  it('counts each signed-in person separately', async () => {
    const app = createTestApp({ API_RATE_LIMIT_MAX: '3' });
    const owner = requestAs(app, team.users.OWNER);
    for (let i = 0; i < 3; i += 1) await owner.get('/api/auth/me').expect(200);

    const res = await owner.get('/api/auth/me').expect(429);
    expect(apiErrorSchema.parse(res.body).error.code).toBe('RATE_LIMITED');
    // Someone else on the same network is not held back.
    await requestAs(app, team.users.EDITOR).get('/api/auth/me').expect(200);
  });

  it('counts signed-out requests by IP, and ignores forged sessions', async () => {
    const app = createTestApp({ API_RATE_LIMIT_MAX: '2' });
    await request(app).get('/api/auth/me').expect(401);
    await request(app).get('/api/auth/me').set('Cookie', 'formyx_session=forged').expect(401);
    await request(app).get('/api/auth/me').set('Cookie', 'formyx_session=other').expect(429);
  });

  it('leaves public forms and health checks to their own limits', async () => {
    const app = createTestApp({ API_RATE_LIMIT_MAX: '1' });
    const form = await createPublishedForm(prisma, team.workspaceId, {
      ...createEmptyForm(),
      fields: [{ ...createField('short_text'), label: 'Name' }],
    });
    for (let i = 0; i < 3; i += 1) {
      await request(app).get('/api/health').expect(200);
      await request(app).get(`/api/public/forms/${form.slug}`).expect(200);
    }
  });
});

describe('OAuth callbacks', () => {
  it('are limited per IP', async () => {
    const app = createTestApp();
    for (let i = 0; i < 30; i += 1) {
      await request(app).get('/api/integrations/google/callback?code=x&state=y').expect(303);
    }
    await request(app).get('/api/integrations/notion/callback?code=x&state=y').expect(429);
  });
});
