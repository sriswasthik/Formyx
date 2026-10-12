import { createEmptyForm, createField, createOption, type FormSchema } from '@formyx/shared';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSubmissionService } from '../services/submission-service.js';
import { startTestServer, type TestServer } from '../test/create-test-app.js';
import { resetDatabase, testPrisma as prisma } from '../test/database.js';
import {
  FAKE_NOTION_CODE,
  plainText,
  startFakeNotion,
  type FakeNotion,
} from '../test/fake-notion.js';
import { createPublishedForm, createSubmission } from '../test/responses.js';
import { createTeam, requestAs, type Team } from '../test/team.js';

const red = createOption('Red');
const name = { ...createField('short_text'), id: 'fld_name', label: 'Name' };
const colour = {
  ...createField('single_choice'),
  id: 'fld_colour',
  label: 'Colour',
  options: [red],
};
const SCHEMA: FormSchema = { ...createEmptyForm(), fields: [name, colour] };

let notion: FakeNotion;
let server: TestServer;
let team: Team;

beforeAll(async () => {
  notion = await startFakeNotion();
});
afterAll(async () => {
  await notion.close();
});
beforeEach(async () => {
  await resetDatabase();
  team = await createTeam(prisma);
  notion.databases.clear();
  notion.pages.clear();
  notion.state.sharedPages = [{ id: 'page-shared', title: 'Team wiki' }];
  server = await startTestServer({
    env: {
      NOTION_CLIENT_ID: 'notion-client',
      NOTION_CLIENT_SECRET: 'notion-secret',
      NOTION_API_URL: notion.url,
    },
  });
});
afterEach(async () => {
  await server.close();
});

async function connect(formId: string) {
  const editor = requestAs(server.app, team.users.EDITOR);
  const started = await editor.post(`/api/forms/${formId}/integrations/notion/connect`).expect(200);
  const state =
    new URL((started.body as { authorizeUrl: string }).authorizeUrl).searchParams.get('state') ??
    '';
  return editor
    .get(`/api/integrations/notion/callback?code=${FAKE_NOTION_CODE}&state=${state}`)
    .expect(303);
}

const integration = () => prisma.integration.findFirstOrThrow();
const pagesByName = () => [...notion.pages.values()].map((page) => plainText(page.properties.Name));

describe('Notion', () => {
  it('makes a typed database in the shared page, with a page per response', async () => {
    const form = await createPublishedForm(prisma, team.workspaceId, SCHEMA, 'Party');
    await createSubmission(prisma, form.id, { answers: { fld_name: 'Ada', fld_colour: red.id } });

    const back = await connect(form.id);
    expect(back.headers.location).toContain('connected=notion');
    await vi.waitFor(async () => {
      expect((await integration()).status).toBe('ACTIVE');
    });

    const [database] = notion.databases.values();
    expect(database).toMatchObject({
      parentPageId: 'page-shared',
      title: 'Party responses',
      properties: expect.objectContaining({
        Response: 'title',
        'Response ID': 'rich_text',
        Name: 'rich_text',
        Colour: 'select',
      }) as unknown,
    });
    expect(pagesByName()).toEqual(['Ada']);
    const [page] = notion.pages.values();
    expect(page?.properties.Colour).toEqual({ select: { name: 'Red' } });
    expect((await integration()).accountLabel).toBe('Analytical Engines');
  });

  it('adds new responses, and updates the page of a changed one', async () => {
    const form = await createPublishedForm(prisma, team.workspaceId, SCHEMA);
    await connect(form.id);
    await vi.waitFor(async () => {
      expect((await integration()).status).toBe('ACTIVE');
    });

    await request(server.app)
      .post(`/api/public/forms/${form.slug}/submissions`)
      .send({ answers: { fld_name: 'Grace' } })
      .expect(201);
    await vi.waitFor(() => {
      expect(pagesByName()).toEqual(['Grace']);
    });

    const stored = await prisma.submission.findFirstOrThrow();
    await prisma.submission.update({
      where: { id: stored.id },
      data: { answers: { fld_name: 'Grace Hopper' }, editedAt: new Date() },
    });
    const submission = await createSubmissionService(prisma).get(form.id, stored.id);
    server.events.emit('submission.updated', { formId: form.id, submission });

    await vi.waitFor(() => {
      expect(pagesByName()).toEqual(['Grace Hopper']);
    });
  });

  it('says what to do when no page was shared', async () => {
    notion.state.sharedPages = [];
    const form = await createPublishedForm(prisma, team.workspaceId, SCHEMA);
    await connect(form.id);

    await vi.waitFor(async () => {
      expect((await integration()).status).toBe('ERROR');
    });
    expect((await integration()).lastError).toMatch(/Share a page with Formyx/);
  });
});
