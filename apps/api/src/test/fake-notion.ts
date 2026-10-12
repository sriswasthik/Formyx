import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

/*
 * The Notion API calls the sync makes (OAuth token, search, databases, pages), in memory on
 * 127.0.0.1, for tests. Point NOTION_API_URL at `url`.
 */

export const FAKE_NOTION_CODE = 'code-from-notion';
export const FAKE_NOTION_TOKEN = 'secret_notion_token';

interface FakeDatabase {
  id: string;
  parentPageId: string;
  title: string;
  /** Property name → type. */
  properties: Record<string, string>;
}

interface FakePage {
  id: string;
  databaseId: string;
  properties: Record<string, Record<string, unknown>>;
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

/** The plain text of a rich text property value. */
export function plainText(value: Record<string, unknown> | undefined): string {
  const parts = (value?.rich_text ?? value?.title ?? []) as { text: { content: string } }[];
  return parts.map((part) => part.text.content).join('');
}

export async function startFakeNotion() {
  const databases = new Map<string, FakeDatabase>();
  const pages = new Map<string, FakePage>();
  const state = {
    sharedPages: [{ id: 'page-shared', title: 'Team wiki' }],
    failures: [] as number[],
  };
  let next = 1;

  const send = (res: ServerResponse, status: number, body: unknown) => {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(body));
  };

  const server = createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? '/', 'http://fake-notion');
      const raw = await readBody(req);
      const body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
      const path = url.pathname;

      if (path === '/v1/oauth/token') {
        if (body.code !== FAKE_NOTION_CODE) {
          send(res, 400, { error: 'invalid_grant', error_description: 'Bad code' });
          return;
        }
        send(res, 200, { access_token: FAKE_NOTION_TOKEN, workspace_name: 'Analytical Engines' });
        return;
      }
      if (req.headers.authorization !== `Bearer ${FAKE_NOTION_TOKEN}`) {
        send(res, 401, { message: 'API token is invalid.' });
        return;
      }
      const failure = state.failures.shift();
      if (failure !== undefined) {
        send(res, failure, { message: `Fake failure ${failure}` });
        return;
      }

      if (path === '/v1/search') {
        send(res, 200, {
          results: state.sharedPages.map((page) => ({
            id: page.id,
            properties: { title: { type: 'title', title: [{ plain_text: page.title }] } },
          })),
        });
        return;
      }
      if (path === '/v1/databases' && req.method === 'POST') {
        const id = `db-${next++}`;
        const properties = body.properties as Record<string, Record<string, unknown>>;
        databases.set(id, {
          id,
          parentPageId: (body.parent as { page_id: string }).page_id,
          title: (body.title as { text: { content: string } }[])[0]?.text.content ?? '',
          properties: Object.fromEntries(
            Object.entries(properties).map(([name, spec]) => [name, Object.keys(spec)[0] ?? '']),
          ),
        });
        send(res, 200, { id, url: `https://www.notion.so/${id}` });
        return;
      }
      const database = /^\/v1\/databases\/([^/]+)(\/query)?$/.exec(path);
      if (database?.[1]) {
        const found = databases.get(database[1]);
        if (!found) {
          send(res, 404, { message: 'Could not find database.' });
          return;
        }
        if (database[2]) {
          const filter = body.filter as { property: string; rich_text: { equals: string } };
          const results = [...pages.values()].filter(
            (page) =>
              page.databaseId === found.id &&
              plainText(page.properties[filter.property]) === filter.rich_text.equals,
          );
          send(res, 200, { results: results.map(({ id }) => ({ id })) });
          return;
        }
        for (const [name, spec] of Object.entries(
          body.properties as Record<string, Record<string, unknown>>,
        )) {
          if (typeof spec.name === 'string') {
            const type = found.properties[name] ?? '';
            found.properties = Object.fromEntries(
              Object.entries(found.properties).filter(([key]) => key !== name),
            );
            found.properties[spec.name] = type;
          } else {
            found.properties[name] = Object.keys(spec)[0] ?? '';
          }
        }
        send(res, 200, { id: found.id });
        return;
      }
      if (path === '/v1/pages' && req.method === 'POST') {
        const databaseId = (body.parent as { database_id: string }).database_id;
        if (!databases.has(databaseId)) {
          send(res, 404, { message: 'Could not find database.' });
          return;
        }
        const id = `page-${next++}`;
        pages.set(id, {
          id,
          databaseId,
          properties: body.properties as FakePage['properties'],
        });
        send(res, 200, { id });
        return;
      }
      const page = /^\/v1\/pages\/([^/]+)$/.exec(path);
      if (page?.[1] && req.method === 'PATCH') {
        const found = pages.get(page[1]);
        if (!found) {
          send(res, 404, { message: 'Could not find page.' });
          return;
        }
        Object.assign(found.properties, body.properties);
        send(res, 200, { id: found.id });
        return;
      }
      send(res, 404, { message: `No ${path}` });
    })().catch((error: unknown) => {
      send(res, 500, { message: String(error) });
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    state,
    databases,
    pages,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => {
          resolve();
        });
      }),
  };
}

export type FakeNotion = Awaited<ReturnType<typeof startFakeNotion>>;
