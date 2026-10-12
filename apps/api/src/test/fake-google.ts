import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

/*
 * Google's OAuth token endpoint and the Sheets API calls the sync makes, in memory on
 * 127.0.0.1, for tests. Point GOOGLE_TOKEN_URL and GOOGLE_SHEETS_URL at `url`.
 */

type Cell = string | number | null;

interface FakeSheet {
  id: string;
  title: string;
  /** The single tab: its id, name and grid. */
  tab: { sheetId: number; title: string; columnCount: number };
  rows: Cell[][];
  /** Column formats set through batchUpdate, by column index. */
  formats: Record<number, string>;
}

export const FAKE_GOOGLE_CODE = 'code-from-google';
export const FAKE_GOOGLE_EMAIL = 'ada@example.com';

function columnIndex(letters: string): number {
  let index = 0;
  for (const letter of letters) index = index * 26 + (letter.charCodeAt(0) - 64);
  return index - 1;
}

/** `'Tab'!A2:C3`, `'Tab'!A:A`, `'Tab'!A1` → tab name and the top-left cell. */
function parseRange(range: string): { tab: string; row: number; column: number } {
  const match = /^'((?:[^']|'')*)'!([A-Z]+)(\d*)/.exec(range);
  if (!match) throw new Error(`Unexpected range ${range}`);
  return {
    tab: (match[1] ?? '').replace(/''/g, "'"),
    column: columnIndex(match[2] ?? 'A'),
    row: match[3] ? Number(match[3]) - 1 : 0,
  };
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

export async function startFakeGoogle() {
  const sheets = new Map<string, FakeSheet>();
  const state = {
    accessToken: 'access-1',
    refreshToken: 'refresh-1',
    /** Refresh tokens Google no longer takes (revoked access). */
    revoked: false,
    /** Statuses the next Sheets requests get instead of an answer. */
    failures: [] as number[],
    requests: [] as { method: string; path: string }[],
    tokenRequests: [] as Record<string, string>[],
    revokedTokens: [] as string[],
  };
  let nextSheet = 1;

  const send = (res: ServerResponse, status: number, body: unknown) => {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(body));
  };

  const server = createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? '/', 'http://fake-google');
      const body = await readBody(req);
      state.requests.push({ method: req.method ?? '', path: url.pathname + url.search });

      if (url.pathname === '/token') {
        const params = Object.fromEntries(new URLSearchParams(body));
        state.tokenRequests.push(params);
        if (params.grant_type === 'authorization_code') {
          if (params.code !== FAKE_GOOGLE_CODE) {
            send(res, 400, { error: 'invalid_grant', error_description: 'Bad code' });
            return;
          }
          const claims = Buffer.from(JSON.stringify({ email: FAKE_GOOGLE_EMAIL })).toString(
            'base64url',
          );
          send(res, 200, {
            access_token: state.accessToken,
            expires_in: 3600,
            refresh_token: state.refreshToken,
            id_token: `header.${claims}.signature`,
          });
          return;
        }
        if (state.revoked || params.refresh_token !== state.refreshToken) {
          send(res, 400, { error: 'invalid_grant' });
          return;
        }
        state.accessToken = `access-${Date.now()}`;
        send(res, 200, { access_token: state.accessToken, expires_in: 3600 });
        return;
      }
      if (url.pathname === '/revoke') {
        state.revokedTokens.push(new URLSearchParams(body).get('token') ?? '');
        send(res, 200, {});
        return;
      }

      if (!url.pathname.startsWith('/v4/spreadsheets')) {
        send(res, 404, { error: { message: 'Not found' } });
        return;
      }
      if (state.revoked || req.headers.authorization !== `Bearer ${state.accessToken}`) {
        send(res, 401, { error: { message: 'Invalid credentials' } });
        return;
      }
      const failure = state.failures.shift();
      if (failure !== undefined) {
        send(res, failure, { error: { message: `Fake failure ${failure}` } });
        return;
      }

      const rest = url.pathname.slice('/v4/spreadsheets'.length);
      if (rest === '' && req.method === 'POST') {
        const input = JSON.parse(body) as {
          properties: { title: string };
          sheets: { properties: { title: string } }[];
        };
        const id = `sheet-${nextSheet++}`;
        const tabTitle = input.sheets[0]?.properties.title ?? 'Sheet1';
        sheets.set(id, {
          id,
          title: input.properties.title,
          tab: { sheetId: 0, title: tabTitle, columnCount: 26 },
          rows: [],
          formats: {},
        });
        send(res, 200, {
          spreadsheetId: id,
          spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${id}/edit`,
          sheets: [{ properties: { sheetId: 0, title: tabTitle } }],
        });
        return;
      }

      const match = /^\/([^/:]+)(.*)$/.exec(rest);
      const sheet = sheets.get(decodeURIComponent(match?.[1] ?? ''));
      if (!sheet) {
        send(res, 404, { error: { message: 'Requested entity was not found.' } });
        return;
      }
      const tail = match?.[2] ?? '';

      if (tail === '' && req.method === 'GET') {
        send(res, 200, {
          sheets: [
            {
              properties: {
                sheetId: sheet.tab.sheetId,
                title: sheet.tab.title,
                gridProperties: { columnCount: sheet.tab.columnCount },
              },
            },
          ],
        });
        return;
      }
      if (tail === ':batchUpdate') {
        const { requests } = JSON.parse(body) as {
          requests: {
            appendDimension?: { length: number };
            repeatCell?: {
              range: { startColumnIndex?: number };
              cell: { userEnteredFormat: { numberFormat?: { type: string } } };
            };
          }[];
        };
        for (const request of requests) {
          if (request.appendDimension) sheet.tab.columnCount += request.appendDimension.length;
          const format = request.repeatCell?.cell.userEnteredFormat.numberFormat;
          const column = request.repeatCell?.range.startColumnIndex;
          if (format && column !== undefined) sheet.formats[column] = format.type;
        }
        send(res, 200, {});
        return;
      }

      const values = /^\/values\/([^:]+)(:append|:clear)?$/.exec(tail);
      if (!values?.[1]) {
        send(res, 404, { error: { message: 'Unknown call' } });
        return;
      }
      const range = parseRange(decodeURIComponent(values[1]));
      if (range.tab !== sheet.tab.title) {
        send(res, 400, { error: { message: `Unable to parse range: ${range.tab}` } });
        return;
      }
      const action = values[2];
      if (action === ':clear') {
        sheet.rows = sheet.rows.slice(0, range.row);
        send(res, 200, {});
        return;
      }
      if (req.method === 'GET') {
        send(res, 200, { values: [sheet.rows.map((row) => String(row[0] ?? ''))] });
        return;
      }
      const written = (JSON.parse(body) as { values: Cell[][] }).values;
      if (written.some((row) => row.length > sheet.tab.columnCount)) {
        send(res, 400, { error: { message: 'Range exceeds grid limits' } });
        return;
      }
      if (action === ':append') {
        sheet.rows.push(...written.map((row) => [...row]));
      } else {
        written.forEach((row, offset) => {
          const target = (sheet.rows[range.row + offset] ??= []);
          row.forEach((cell, column) => {
            target[range.column + column] = cell;
          });
        });
      }
      send(res, 200, {});
    })().catch((error: unknown) => {
      send(res, 500, { error: { message: String(error) } });
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    state,
    sheets,
    /** The only spreadsheet made so far. */
    sheet(): FakeSheet {
      const [only] = sheets.values();
      if (!only) throw new Error('No spreadsheet was made');
      return only;
    },
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => {
          resolve();
        });
      }),
  };
}

export type FakeGoogle = Awaited<ReturnType<typeof startFakeGoogle>>;
