// A stand-in for Google, for end-to-end tests: the sign-in page (which agrees at once and sends
// people back with a code), the token endpoint and the Sheets API calls the sync makes. The
// API's GOOGLE_OAUTH_URL, GOOGLE_TOKEN_URL and GOOGLE_SHEETS_URL point at /google here.
// Tests read the sheets at GET /google/__sheets and revoke access with POST /google/__revoke.

const CODE = 'e2e-google-code';
const EMAIL = 'sheets@example.com';

const state = { accessToken: 'e2e-access', refreshToken: 'e2e-refresh', revoked: false };
/** By spreadsheet id: title, tab and rows. */
const sheets = new Map();
let nextSheet = 1;

function columnIndex(letters) {
  let index = 0;
  for (const letter of letters) index = index * 26 + (letter.charCodeAt(0) - 64);
  return index - 1;
}

function parseRange(range) {
  const match = /^'((?:[^']|'')*)'!([A-Z]+)(\d*)/.exec(range);
  if (!match) throw new Error(`Unexpected range ${range}`);
  return {
    tab: match[1].replace(/''/g, "'"),
    column: columnIndex(match[2]),
    row: match[3] ? Number(match[3]) - 1 : 0,
  };
}

/** Answers a request under /google; `parts` are the path's parts after "google". */
export async function handleGoogle(req, res, url, parts, send, readBody) {
  const body = (await readBody(req)).toString('utf8');
  const path = `/${parts.join('/')}`;

  if (path === '/__sheets') return send(res, 200, [...sheets.values()]);
  if (path === '/__revoke') {
    state.revoked = true;
    state.accessToken = `revoked-${Date.now()}`;
    return send(res, 200, {});
  }
  if (path === '/__restore') {
    state.revoked = false;
    return send(res, 200, {});
  }

  // The consent screen: agree at once.
  if (path === '/o/oauth2/v2/auth') {
    const back = new URL(url.searchParams.get('redirect_uri') ?? '');
    back.searchParams.set('code', CODE);
    back.searchParams.set('state', url.searchParams.get('state') ?? '');
    res.writeHead(302, { Location: back.toString() });
    return res.end();
  }
  if (path === '/token') {
    const params = Object.fromEntries(new URLSearchParams(body));
    if (params.grant_type === 'authorization_code') {
      if (params.code !== CODE) return send(res, 400, { error: 'invalid_grant' });
      state.revoked = false;
      state.accessToken = `e2e-access-${Date.now()}`;
      const claims = Buffer.from(JSON.stringify({ email: EMAIL })).toString('base64url');
      return send(res, 200, {
        access_token: state.accessToken,
        expires_in: 3600,
        refresh_token: state.refreshToken,
        id_token: `header.${claims}.signature`,
      });
    }
    if (state.revoked) return send(res, 400, { error: 'invalid_grant' });
    state.accessToken = `e2e-access-${Date.now()}`;
    return send(res, 200, { access_token: state.accessToken, expires_in: 3600 });
  }
  if (path === '/revoke') return send(res, 200, {});

  if (!path.startsWith('/v4/spreadsheets')) return send(res, 404, { error: { message: 'Nope' } });
  if (state.revoked || req.headers.authorization !== `Bearer ${state.accessToken}`) {
    return send(res, 401, { error: { message: 'Invalid credentials' } });
  }

  const rest = url.pathname.slice(url.pathname.indexOf('/v4/spreadsheets') + 16);
  if (rest === '' && req.method === 'POST') {
    const input = JSON.parse(body);
    const id = `e2e-sheet-${nextSheet++}`;
    const tab = input.sheets[0]?.properties.title ?? 'Sheet1';
    sheets.set(id, { id, title: input.properties.title, tab, columnCount: 26, rows: [] });
    return send(res, 200, {
      spreadsheetId: id,
      spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${id}/edit`,
      sheets: [{ properties: { sheetId: 0, title: tab } }],
    });
  }
  const match = /^\/([^/:]+)(.*)$/.exec(rest);
  const sheet = sheets.get(decodeURIComponent(match?.[1] ?? ''));
  if (!sheet) return send(res, 404, { error: { message: 'Requested entity was not found.' } });
  const tail = match?.[2] ?? '';

  if (tail === '' && req.method === 'GET') {
    return send(res, 200, {
      sheets: [
        {
          properties: {
            sheetId: 0,
            title: sheet.tab,
            gridProperties: { columnCount: sheet.columnCount },
          },
        },
      ],
    });
  }
  if (tail === ':batchUpdate') {
    for (const request of JSON.parse(body).requests) {
      if (request.appendDimension) sheet.columnCount += request.appendDimension.length;
    }
    return send(res, 200, {});
  }
  const values = /^\/values\/([^:]+)(:append|:clear)?$/.exec(tail);
  if (!values) return send(res, 404, { error: { message: 'Unknown call' } });
  const range = parseRange(decodeURIComponent(values[1]));
  if (values[2] === ':clear') {
    sheet.rows = sheet.rows.slice(0, range.row);
    return send(res, 200, {});
  }
  if (req.method === 'GET') {
    return send(res, 200, { values: [sheet.rows.map((row) => String(row[0] ?? ''))] });
  }
  const written = JSON.parse(body).values;
  if (values[2] === ':append') {
    sheet.rows.push(...written);
  } else {
    written.forEach((row, offset) => {
      const target = (sheet.rows[range.row + offset] ??= []);
      row.forEach((cell, column) => {
        target[range.column + column] = cell;
      });
    });
  }
  return send(res, 200, {});
}
