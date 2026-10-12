import { columnLetters, type SheetColumnKind } from '@formyx/shared';
import type { Env } from '../config/env.js';
import { IntegrationApiError, IntegrationAuthError } from './errors.js';

/*
 * Google, over plain HTTPS: OAuth (sign-in, tokens) and the few Sheets calls the sync needs.
 * The scope is `drive.file`, which only reaches files this app created, so Google's app
 * verification stays light; `email` names the account on the Integrations page.
 */

export const GOOGLE_SCOPES = ['openid', 'email', 'https://www.googleapis.com/auth/drive.file'];
const REQUEST_TIMEOUT_MS = 20_000;

export type GoogleEnv = Pick<
  Env,
  | 'GOOGLE_CLIENT_ID'
  | 'GOOGLE_CLIENT_SECRET'
  | 'GOOGLE_OAUTH_URL'
  | 'GOOGLE_TOKEN_URL'
  | 'GOOGLE_SHEETS_URL'
  | 'APP_URL'
>;

/** Where Google sends people back: this site, whose /api reaches the API. */
export const googleRedirectUri = (env: Pick<Env, 'APP_URL'>) =>
  `${env.APP_URL}/api/integrations/google/callback`;

export function googleConfigured(env: GoogleEnv): boolean {
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
}

/** Google said the account's access is gone (revoked, expired, or the password changed). */
export class GoogleAuthError extends IntegrationAuthError {
  constructor(message = 'Google access was revoked or has expired. Connect it again.') {
    super(message);
    this.name = 'GoogleAuthError';
  }
}

/** A Sheets request Google refused. */
export class GoogleApiError extends IntegrationApiError {
  constructor(status: number, message: string) {
    super(status, message);
    this.name = 'GoogleApiError';
  }
}

export function googleAuthorizeUrl(env: GoogleEnv, state: string): string {
  const url = new URL(`${env.GOOGLE_OAUTH_URL}/o/oauth2/v2/auth`);
  url.search = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID ?? '',
    redirect_uri: googleRedirectUri(env),
    response_type: 'code',
    scope: GOOGLE_SCOPES.join(' '),
    // A refresh token, every time: the sync runs while nobody is signed in.
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  }).toString();
  return url.toString();
}

export interface GoogleTokens {
  accessToken: string;
  /** Milliseconds since the epoch. */
  expiresAt: number;
  refreshToken: string;
}

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  id_token?: string;
  error?: string;
  error_description?: string;
}

async function tokenRequest(env: GoogleEnv, params: Record<string, string>) {
  const response = await fetch(`${env.GOOGLE_TOKEN_URL}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID ?? '',
      client_secret: env.GOOGLE_CLIENT_SECRET ?? '',
      ...params,
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const body = (await response.json().catch(() => ({}))) as TokenResponse;
  return { response, body };
}

/** The account's email, from the ID token Google just sent (over TLS, straight from Google). */
function emailFromIdToken(idToken: string | undefined): string | null {
  const payload = idToken?.split('.')[1];
  if (!payload) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      email?: unknown;
    };
    return typeof claims.email === 'string' ? claims.email : null;
  } catch {
    return null;
  }
}

/** Trades the code from Google's redirect for tokens, and names the account. */
export async function exchangeGoogleCode(
  env: GoogleEnv,
  code: string,
): Promise<{ tokens: GoogleTokens; email: string | null }> {
  const { response, body } = await tokenRequest(env, {
    code,
    grant_type: 'authorization_code',
    redirect_uri: googleRedirectUri(env),
  });
  if (!response.ok || !body.access_token || !body.refresh_token) {
    throw new GoogleAuthError(body.error_description ?? 'Google did not grant access.');
  }
  return {
    tokens: {
      accessToken: body.access_token,
      expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000,
      refreshToken: body.refresh_token,
    },
    email: emailFromIdToken(body.id_token),
  };
}

/** A fresh access token; `GoogleAuthError` when the refresh token no longer works. */
export async function refreshGoogleTokens(
  env: GoogleEnv,
  tokens: GoogleTokens,
): Promise<GoogleTokens> {
  const { response, body } = await tokenRequest(env, {
    refresh_token: tokens.refreshToken,
    grant_type: 'refresh_token',
  });
  if (body.error === 'invalid_grant' || response.status === 401) throw new GoogleAuthError();
  if (!response.ok || !body.access_token) {
    throw new GoogleApiError(response.status, 'Google could not refresh access. Trying again.');
  }
  return {
    accessToken: body.access_token,
    expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000,
    // Google sometimes rotates it.
    refreshToken: body.refresh_token ?? tokens.refreshToken,
  };
}

/** Ends Formyx's access to the account (disconnecting). Best effort. */
export async function revokeGoogleToken(env: GoogleEnv, token: string): Promise<void> {
  await fetch(`${env.GOOGLE_TOKEN_URL}/revoke`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ token }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  }).catch(() => undefined);
}

/** A sheet tab's name in A1 notation: quoted, with quotes doubled. */
const tab = (title: string) => `'${title.replace(/'/g, "''")}'`;

type CellValue = string | number | null;

export interface SpreadsheetTab {
  sheetId: number;
  title: string;
  columnCount: number;
}

const NUMBER_FORMATS: Partial<Record<SheetColumnKind, { type: string; pattern: string }>> = {
  date: { type: 'DATE', pattern: 'yyyy-mm-dd' },
  datetime: { type: 'DATE_TIME', pattern: 'yyyy-mm-dd hh:mm:ss' },
};

/** The Sheets calls the sync makes, as one account. */
export function createSheetsClient(
  env: GoogleEnv,
  /** A valid access token; `force` refreshes it even if it looks unexpired. */
  accessToken: (force?: boolean) => Promise<string>,
) {
  async function call<T>(
    path: string,
    { method = 'GET', body }: { method?: string; body?: string } = {},
  ): Promise<T> {
    const send = async (force: boolean) =>
      fetch(`${env.GOOGLE_SHEETS_URL}/v4/spreadsheets${path}`, {
        method,
        ...(body !== undefined && { body }),
        headers: {
          Authorization: `Bearer ${await accessToken(force)}`,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    let response = await send(false);
    // A token Google stopped taking early: refresh once, then believe it.
    if (response.status === 401) response = await send(true);
    if (response.status === 401) throw new GoogleAuthError();
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as {
        error?: { message?: string };
      };
      throw new GoogleApiError(
        response.status,
        body.error?.message ?? `Google Sheets answered ${response.status}`,
      );
    }
    return (await response.json()) as T;
  }

  const values = (spreadsheetId: string, range: string, suffix = '') =>
    `/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}${suffix}`;

  return {
    /** A new spreadsheet with one tab, its header row frozen. */
    async create(title: string) {
      const created = await call<{
        spreadsheetId: string;
        spreadsheetUrl: string;
        sheets: { properties: { sheetId: number; title: string } }[];
      }>('', {
        method: 'POST',
        body: JSON.stringify({
          properties: { title },
          sheets: [{ properties: { title: 'Responses', gridProperties: { frozenRowCount: 1 } } }],
        }),
      });
      const first = created.sheets[0]?.properties;
      if (!first) throw new GoogleApiError(500, 'Google made a spreadsheet without a tab');
      return { ...created, sheetId: first.sheetId };
    },

    /** The tab with `sheetId`: its current name (people rename tabs) and width. */
    async tab(spreadsheetId: string, sheetId: number): Promise<SpreadsheetTab> {
      const sheet = await call<{
        sheets?: {
          properties: { sheetId: number; title: string; gridProperties?: { columnCount?: number } };
        }[];
      }>(
        `/${encodeURIComponent(spreadsheetId)}?fields=${encodeURIComponent(
          'sheets.properties(sheetId,title,gridProperties.columnCount)',
        )}`,
      );
      const found = sheet.sheets?.find((entry) => entry.properties.sheetId === sheetId);
      if (!found) throw new GoogleApiError(404, 'The Responses tab was deleted from the sheet.');
      return {
        sheetId,
        title: found.properties.title,
        columnCount: found.properties.gridProperties?.columnCount ?? 26,
      };
    },

    /** Makes the tab at least `columns` wide, then writes the header row and formats. */
    async writeHeader(
      spreadsheetId: string,
      sheet: SpreadsheetTab,
      columns: readonly { header: string; kind: SheetColumnKind }[],
      formatFrom: number,
    ) {
      const requests: object[] = [];
      if (columns.length > sheet.columnCount) {
        requests.push({
          appendDimension: {
            sheetId: sheet.sheetId,
            dimension: 'COLUMNS',
            length: columns.length - sheet.columnCount,
          },
        });
      }
      requests.push({
        repeatCell: {
          range: { sheetId: sheet.sheetId, startRowIndex: 0, endRowIndex: 1 },
          cell: { userEnteredFormat: { textFormat: { bold: true } } },
          fields: 'userEnteredFormat.textFormat.bold',
        },
      });
      // Dates and times arrive as serial numbers (see sheetValue); these formats show them.
      columns.forEach((column, index) => {
        const format = NUMBER_FORMATS[column.kind];
        if (!format || index < formatFrom) return;
        requests.push({
          repeatCell: {
            range: {
              sheetId: sheet.sheetId,
              startRowIndex: 1,
              startColumnIndex: index,
              endColumnIndex: index + 1,
            },
            cell: { userEnteredFormat: { numberFormat: format } },
            fields: 'userEnteredFormat.numberFormat',
          },
        });
      });
      await call(`/${encodeURIComponent(spreadsheetId)}:batchUpdate`, {
        method: 'POST',
        body: JSON.stringify({ requests }),
      });
      await call(
        values(
          spreadsheetId,
          `${tab(sheet.title)}!A1:${columnLetters(columns.length - 1)}1`,
          '?valueInputOption=RAW',
        ),
        { method: 'PUT', body: JSON.stringify({ values: [columns.map((c) => c.header)] }) },
      );
    },

    /** The first column (response ids), top to bottom; row n is index n - 1. */
    async responseIds(spreadsheetId: string, sheet: SpreadsheetTab): Promise<string[]> {
      const result = await call<{ values?: string[][] }>(
        values(spreadsheetId, `${tab(sheet.title)}!A:A`, '?majorDimension=COLUMNS'),
      );
      return (result.values?.[0] ?? []).map(String);
    },

    /**
     * Adds rows below the last one. RAW: nothing is read as a formula, so an answer of
     * "=IMPORTXML(…)" stays text.
     */
    async append(spreadsheetId: string, sheet: SpreadsheetTab, rows: CellValue[][]) {
      if (rows.length === 0) return;
      await call(
        values(
          spreadsheetId,
          `${tab(sheet.title)}!A1`,
          ':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS',
        ),
        { method: 'POST', body: JSON.stringify({ values: rows }) },
      );
    },

    /** Replaces row `rowNumber` (1-based). */
    async updateRow(
      spreadsheetId: string,
      sheet: SpreadsheetTab,
      rowNumber: number,
      row: CellValue[],
    ) {
      const range = `${tab(sheet.title)}!A${rowNumber}:${columnLetters(row.length - 1)}${rowNumber}`;
      await call(values(spreadsheetId, range, '?valueInputOption=RAW'), {
        method: 'PUT',
        body: JSON.stringify({ values: [row] }),
      });
    },

    /** Empties every row below the header (re-syncing everything). */
    async clearRows(spreadsheetId: string, sheet: SpreadsheetTab) {
      await call(values(spreadsheetId, `${tab(sheet.title)}!A2:ZZZ`, ':clear'), {
        method: 'POST',
        body: '{}',
      });
    },
  };
}

export type SheetsClient = ReturnType<typeof createSheetsClient>;
