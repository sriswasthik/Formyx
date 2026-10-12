import type { Env } from '../config/env.js';
import { IntegrationApiError, IntegrationAuthError } from './errors.js';

/*
 * Notion, over plain HTTPS: OAuth for a public integration, and the database and page calls
 * the sync makes. During consent people pick the pages Formyx may use; the responses
 * database is made in one of them.
 */

/** The API version these requests are written for. */
const NOTION_VERSION = '2022-06-28';
const REQUEST_TIMEOUT_MS = 20_000;

export type NotionEnv = Pick<
  Env,
  'NOTION_CLIENT_ID' | 'NOTION_CLIENT_SECRET' | 'NOTION_API_URL' | 'APP_URL'
>;

export const notionRedirectUri = (env: Pick<Env, 'APP_URL'>) =>
  `${env.APP_URL}/api/integrations/notion/callback`;

export function notionConfigured(env: NotionEnv): boolean {
  return Boolean(env.NOTION_CLIENT_ID && env.NOTION_CLIENT_SECRET);
}

export class NotionAuthError extends IntegrationAuthError {
  constructor(message = 'Notion access was removed. Connect it again.') {
    super(message);
    this.name = 'NotionAuthError';
  }
}

export class NotionApiError extends IntegrationApiError {
  constructor(status: number, message: string) {
    super(status, message);
    this.name = 'NotionApiError';
  }
}

export function notionAuthorizeUrl(env: NotionEnv, state: string): string {
  const url = new URL(`${env.NOTION_API_URL}/v1/oauth/authorize`);
  url.search = new URLSearchParams({
    client_id: env.NOTION_CLIENT_ID ?? '',
    redirect_uri: notionRedirectUri(env),
    response_type: 'code',
    owner: 'user',
    state,
  }).toString();
  return url.toString();
}

/** Trades the code for a token (Notion's don't expire) and names the workspace. */
export async function exchangeNotionCode(
  env: NotionEnv,
  code: string,
): Promise<{ accessToken: string; workspaceName: string | null }> {
  const basic = Buffer.from(`${env.NOTION_CLIENT_ID ?? ''}:${env.NOTION_CLIENT_SECRET ?? ''}`);
  const response = await fetch(`${env.NOTION_API_URL}/v1/oauth/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic.toString('base64')}`,
      'Content-Type': 'application/json',
      'Notion-Version': NOTION_VERSION,
    },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      code,
      redirect_uri: notionRedirectUri(env),
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const body = (await response.json().catch(() => ({}))) as {
    access_token?: string;
    workspace_name?: string | null;
    error_description?: string;
  };
  if (!response.ok || !body.access_token) {
    throw new NotionAuthError(body.error_description ?? 'Notion did not grant access.');
  }
  return { accessToken: body.access_token, workspaceName: body.workspace_name ?? null };
}

export interface NotionPage {
  id: string;
  title: string;
}

/** Notion's rich text, a plain string. */
interface RichText {
  plain_text?: string;
}

export function createNotionClient(env: NotionEnv, token: string) {
  async function call<T>(path: string, method = 'GET', body?: object): Promise<T> {
    const response = await fetch(`${env.NOTION_API_URL}/v1${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Notion-Version': NOTION_VERSION,
      },
      ...(body && { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (response.status === 401) throw new NotionAuthError();
    if (!response.ok) {
      const error = (await response.json().catch(() => ({}))) as { message?: string };
      throw new NotionApiError(
        response.status,
        response.status === 404
          ? 'The Notion database or page was deleted, or is no longer shared with Formyx.'
          : (error.message ?? `Notion answered ${response.status}`),
      );
    }
    return (await response.json()) as T;
  }

  return {
    /** Pages people shared with Formyx when they connected it. */
    async sharedPages(): Promise<NotionPage[]> {
      const result = await call<{
        results: {
          id: string;
          properties?: Record<string, { type: string; title?: RichText[] }>;
        }[];
      }>('/search', 'POST', {
        filter: { property: 'object', value: 'page' },
        page_size: 20,
      });
      return result.results.map((page) => {
        const titleProperty = Object.values(page.properties ?? {}).find(
          (property) => property.type === 'title',
        );
        const title = (titleProperty?.title ?? []).map((part) => part.plain_text ?? '').join('');
        return { id: page.id, title: title || 'Untitled' };
      });
    },

    async createDatabase(parentPageId: string, title: string, properties: object) {
      return call<{ id: string; url: string }>('/databases', 'POST', {
        parent: { type: 'page_id', page_id: parentPageId },
        title: [{ type: 'text', text: { content: title } }],
        properties,
      });
    },

    async updateDatabase(databaseId: string, properties: object) {
      await call(`/databases/${databaseId}`, 'PATCH', { properties });
    },

    /** The page whose Response ID property is `responseId`, if there is one. */
    async findPage(databaseId: string, idProperty: string, responseId: string) {
      const result = await call<{ results: { id: string }[] }>(
        `/databases/${databaseId}/query`,
        'POST',
        { filter: { property: idProperty, rich_text: { equals: responseId } }, page_size: 1 },
      );
      return result.results[0]?.id ?? null;
    },

    async createPage(databaseId: string, properties: object) {
      return call<{ id: string }>('/pages', 'POST', {
        parent: { database_id: databaseId },
        properties,
      });
    },

    async updatePage(pageId: string, properties: object) {
      await call(`/pages/${pageId}`, 'PATCH', { properties });
    },
  };
}

export type NotionClient = ReturnType<typeof createNotionClient>;
