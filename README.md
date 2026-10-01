# Formyx

A full-stack form builder: build forms with drag and drop, add conditional logic, publish them with a shareable link and watch responses arrive live.

See [CLAUDE.md](./CLAUDE.md) for the product brief, design system and engineering rules.

## Stack

| Package           | What                                                                                                                                                |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web`        | React 18, Vite, TypeScript, Tailwind CSS v4, shadcn/ui (Radix), React Router, TanStack Query and Table, React Hook Form, Recharts, Socket.IO client |
| `apps/api`        | Node.js, Express 5, TypeScript, Prisma 7 + PostgreSQL, Zod, pino, Socket.IO, Resend, Cloudinary                                                     |
| `packages/shared` | Zod schemas, types and pure logic shared by web and api                                                                                             |
| `e2e`             | Playwright end-to-end tests                                                                                                                         |

## Getting started

Requirements: Node.js 22.13+, pnpm (the exact version is pinned in `package.json`) and PostgreSQL 17 (see [Database](#database)).

```sh
pnpm install

cp apps/api/.env.example apps/api/.env
# Then set JWT_SECRET in apps/api/.env (the file explains how to generate one).
cp apps/web/.env.example apps/web/.env   # optional

pnpm db:up        # start Postgres in Docker (skip if you run Postgres yourself)
pnpm db:migrate   # create the tables

pnpm dev
```

- Web: http://localhost:5173 (proxies `/api` to the API)
- API: http://localhost:4000 — health check at `/api/health`
- Styleguide (development only): http://localhost:5173/styleguide

## Database

The API needs two databases: `formyx` for development and `formyx_test`, which `pnpm test` empties on every run. The test setup refuses any database whose name does not end in `_test`.

**Docker (default).** `pnpm db:up` starts Postgres 17 from `docker-compose.yml` with both databases and the credentials in `.env.example`. Set `POSTGRES_PORT` if port 5432 is taken. `pnpm db:down` stops it; data persists in a Docker volume.

**Postgres installed locally.** Create the role and databases once as a superuser, and the defaults in `.env.example` work unchanged:

```sh
psql -U postgres -c "CREATE ROLE formyx LOGIN PASSWORD 'formyx' CREATEDB" \
  -c "CREATE DATABASE formyx OWNER formyx" -c "CREATE DATABASE formyx_test OWNER formyx"
```

`CREATEDB` lets `prisma migrate dev` create its temporary shadow database.

**Neon.** Set `DATABASE_URL` to the pooled connection string and `DIRECT_URL` to the direct one; migrations use the direct connection. Point `TEST_DATABASE_URL` at a separate branch or database whose name ends in `_test`.

After changing `apps/api/prisma/schema.prisma`, run `pnpm db:migrate` to create and apply a migration and regenerate the Prisma client. The client lives in `apps/api/src/generated` and is also generated on install (or with `pnpm --filter @formyx/api db:generate`).

## Authentication

- `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout` and `GET /api/auth/me`. Signing up also creates a personal workspace owned by the new user.
- Sessions are 7-day JWTs in an httpOnly, `SameSite=Lax` cookie, marked `Secure` in production. In development the web app proxies `/api`, so the cookie is first-party. In production, serve the web app and API from the same site (for example `formyx.app` and `api.formyx.app`).
- Passwords are hashed with bcrypt (`BCRYPT_COST`, default 12). Log-in failures always say "Invalid email or password".
- Sign-ups and failed log-ins are rate limited per IP (`AUTH_RATE_LIMIT_MAX` per 15 minutes). Behind a load balancer, set `TRUST_PROXY` (usually `1`) so the limit applies to real client IPs.
- `requireAuth` protects routes. `requireWorkspaceRole('EDITOR')` and `requireFormRole('EDITOR')` also check the caller's role in the workspace of the `:workspaceId` or `:formId` route param (OWNER > EDITOR > VIEWER); non-members and members with too little access get 403.

## Forms

A form's questions and settings are a JSON document (`FormSchema`) defined with Zod in `packages/shared/src/forms`, together with `createField`, `createEmptyForm` and the templates. The same schema validates drafts in the API and in the web app. It checks structure only, so unfinished drafts still save; conditions may only depend on earlier questions, which rules out cycles.

| Endpoint                                  | Who     | Does                                                                |
| ----------------------------------------- | ------- | ------------------------------------------------------------------- |
| `GET /api/workspaces/:workspaceId/forms`  | Members | Summaries with response counts; `?search=` (title) and `?status=`   |
| `POST /api/workspaces/:workspaceId/forms` | Editors | Creates a form, blank or from `templateId`                          |
| `GET /api/forms/:formId`                  | Members | The full form: draft and published schema, theme, version           |
| `PATCH /api/forms/:formId`                | Editors | Updates `title`, `draftSchema` and/or `theme`; send the `version`   |
| `POST /api/forms/:formId/duplicate`       | Editors | Copies the draft into a new form                                    |
| `DELETE /api/forms/:formId`               | Editors | Deletes the form and its responses                                  |
| `POST /api/forms/:formId/publish`         | Editors | Snapshots the draft and title as the published form; send `version` |
| `POST /api/forms/:formId/close`           | Editors | Stops a published form taking responses                             |
| `POST /api/forms/:formId/reopen`          | Editors | Takes responses again, unless its limit or closing time has passed  |

Every update increments `version`. A `PATCH` whose `version` is no longer current gets `409 CONFLICT` with `details.currentVersion`, so concurrent editors never overwrite each other silently.

## Editor

Editors open forms at `/app/forms/:formId/edit` (viewers get the read-only `/app/forms/:formId`). The code lives in `apps/web/src/features/form-editor`:

- **Store.** A Zustand + immer store per editor holds the title and draft schema, with up to 100 undo steps. Typing in one input within a second counts as one step. After a question is removed or moved, or its options or rating scale change, conditions that no longer make sense are removed, and a toast offers to undo that.
- **Drag and drop** uses dnd-kit. Drag question types from the palette to a position, or reorder questions with the mouse, touch (by the handle) or keyboard (focus the handle, then Space, the arrow keys and Space). Clicking a question type adds it at the end.
- **Rendering.** `features/form-renderer` draws each question from the schema. It is used by the canvas (inert), the preview and the public form page. Form colours come from the form's theme as `--form-*` CSS variables, so a form looks the same in the app's light and dark modes.
- **Autosave.** Saves one second after the last change, one request at a time, with the `version` the edit started from. Drafts are checked with the shared schema first; failed saves retry with backoff. A `409` pauses saving and offers to load the latest version. Leaving the editor saves pending changes first, and asks before discarding any that could not be saved.
- **Shortcuts.** Ctrl/⌘+Z undo, Ctrl/⌘+Shift+Z (or Ctrl+Y) redo, Ctrl/⌘+D duplicate, Delete or Backspace remove, Escape deselect. These apply outside text inputs; tooltips show them.
- **Small screens.** Below 1024px the editor has Build, Design, Settings and Preview tabs, and the question types open in a bottom sheet.
- **Logic.** A question's settings end with "Show this question only when…": conditions on earlier questions, with comparisons and values that fit each question type, combined with all or any. Questions with logic carry a Logic badge and a summary on the canvas.

## Publishing and responses

Publishing snapshots the draft and title into `publishedSchema` and `publishedTitle`: respondents only ever see the snapshot, and edits go live with the next publish. The editor saves pending changes first, marks a live form's "Unpublished changes", and lists what an unfinished draft still needs (`findPublishIssues`: labels, options, condition values). After publishing, the share dialog has the public link, a copy button and a QR code with a PNG download. A published form can be closed and reopened.

Anyone with the link answers at `/f/:slug`, a separate bundle without editor or app code (an ESLint rule keeps it that way). The same shared functions decide what respondents see and what they may send, in the browser and on the server:

- `evaluateVisibility(schema, answers)`: which questions show. Conditions only look back, and an answer to a hidden question counts as empty, so chains of conditions collapse.
- `buildSubmissionValidator(schema, answers)`: a Zod schema for the visible questions (required, text length, email, phone, number, rating, date, options), returning trimmed, typed answers.
- `sanitizeAnswers(schema, answers)`: drops answers to hidden, unknown and statement questions.

| Endpoint                                   | Does                                                                        |
| ------------------------------------------ | --------------------------------------------------------------------------- |
| `GET /api/public/forms/:slug`              | `{ status: 'open', title, schema, theme }` or `{ status: 'closed', title }` |
| `POST /api/public/forms/:slug/view`        | Counts a view (the page sends one per browser session)                      |
| `POST /api/public/forms/:slug/submissions` | Stores a response: `answers`, `completionTimeMs`, `referrer`                |

Submissions are validated against the published snapshot, with problems returned per question (`answers.<fieldId>`). Responses to a closed form get `410 FORM_CLOSED`, and so do responses after its `closeAt` time or once it has `closeAfterResponses` responses. The form row is locked while a response is stored, so simultaneous responses never overshoot the limit, and the response that reaches it closes the form. A hidden honeypot field (`website`) catches bots: they get a normal reply, but nothing is stored. Submissions are rate limited per IP and form (`SUBMISSION_RATE_LIMIT_MAX` per 15 minutes). Responses store the user agent and referrer, never IP addresses.

## Responses, analytics and live updates

`/app/forms/:formId/responses` (code in `apps/web/src/features/responses`) is reached from the form's navigation (Edit · Responses · Share), the dashboard's form menu and the read-only overview. Any member of the workspace can read responses and export them; deleting them takes EDITOR or above.

- **Summary.** Views, responses, completion rate (responses per view) and average completion time over all time; responses per day for the last 7, 30 or 90 days, counted on the viewer's calendar; and a summary of each published question: shares per option, the rating distribution and average, number minimum/average/maximum, and the latest five text answers.
- **Responses.** A table with a column per published question, sortable by date and searchable across answers (choices match by option label). Rows load 50 at a time with an opaque cursor. A row opens the full response in a side sheet. The tab, search, question filter and open response live in the URL, so links from emails and summaries land in the right place.
- **Live.** New responses appear on top with a brief tint, and counts and charts update in place; responses deleted elsewhere disappear.
- **Email.** Each member can turn on "Email me on new responses" for a form; the setting is theirs alone.

| Endpoint                                              | Who       | Does                                                                        |
| ----------------------------------------------------- | --------- | --------------------------------------------------------------------------- |
| `GET /api/forms/:formId/analytics`                    | Members   | Totals, responses per day (`?range=7d\|30d\|90d&tz=<IANA zone>`), questions |
| `GET /api/forms/:formId/submissions`                  | Members   | A page: `?cursor=&limit=&order=newest\|oldest&search=&answered=<fieldId>`   |
| `GET /api/forms/:formId/submissions/:submissionId`    | Members   | One response                                                                |
| `GET /api/forms/:formId/submissions/export`           | Members   | Every response as a streamed CSV                                            |
| `DELETE /api/forms/:formId/submissions/:submissionId` | Editors   | Deletes one response                                                        |
| `POST /api/forms/:formId/submissions/bulk-delete`     | Editors   | Deletes up to 100 responses: `{ ids }`; ids of other forms are ignored      |
| `GET`, `PUT /api/forms/:formId/notifications`         | Members   | The caller's own `{ emailOnSubmission }`                                    |
| `GET /api/realtime/token`                             | Signed in | A 60-second token for the live-updates socket                               |

**Analytics** are computed on the server. Totals and the daily series come from SQL; question summaries fold every response, in batches of 1,000, through `addSubmissionToSummaries` in `packages/shared`, the same function the dashboard uses to count in responses that arrive live. `created_at` columns hold UTC in a `timestamp` column, so raw SQL always converts explicitly (`(created_at AT TIME ZONE 'UTC') AT TIME ZONE $tz`) and never relies on the database session's time zone.

**CSV export** streams in batches with backpressure: RFC 4180 quoting, a `'` before text that a spreadsheet would run as a formula (`=`, `+`, `-`, `@`), CRLF line endings and a BOM so Excel reads UTF-8. Headers are the published question labels; numbers and ratings stay numeric.

**Live updates** use Socket.IO on the API's HTTP server at `/api/socket.io`, so whatever routes `/api` (the Vite proxy, a load balancer) routes the socket too. The web app and API may run on different origins, where the session cookie is not sent, so the browser gets a 60-second token from `GET /api/realtime/token` for each connection attempt and hands it over in the handshake. Realtime tokens have their own issuer and audience: they are refused as sessions, and session tokens are refused by the socket. A socket joins `form:<id>` only after the same membership check as the REST API, then receives `submission:created` and `submissions:deleted`. After a reconnect the page rejoins its rooms and refetches what it may have missed. Set `VITE_REALTIME_URL` when the socket is served from another origin.

**Emails** go through Resend after the response is saved and answered: a listener on an in-process event bus sends one batch to subscribers who are still members, with an idempotency key per response. Listener failures are logged and never reach the respondent. Without `RESEND_API_KEY`, emails are written to the log instead. `APP_URL` is used for the links in emails and `EMAIL_FROM` is the sender; its domain must be verified in Resend.

One API instance is assumed: rate limits and Socket.IO rooms live in memory. Running several needs a shared store such as Redis (and the Socket.IO Redis adapter).

## Themes

The editor's Design tab sets a form's look: an accent from eight muted presets or any hex colour (with a warning below 3:1 contrast against the background), a font (Inter, a serif or a rounded sans), sharp or rounded corners, a white, off-white or dark background, and an optional logo and cover image. The canvas and preview change as you go; respondents see the theme from the last publish (`publishedTheme`), like the questions. `formThemeVariables` turns a theme into `--form-*` CSS variables, and fonts load only when a form uses them.

## File uploads

File questions upload straight from the browser to Cloudinary with a progress bar, cancel and retry; the API never handles the bytes.

1. `GET /api/uploads/signature?purpose=answer&form=<slug>&field=<id>` (no account; rate limited) or `?purpose=logo|cover&formId=` (editors) signs one upload. The signature pins the folder (`<CLOUDINARY_FOLDER>/forms/<formId>/<fieldId>` or `.../themes/<formId>`) and the allowed formats.
2. The browser checks the question's size and type limits (`fileProblem` in `packages/shared`) and posts the file to Cloudinary.
3. The answer keeps `{ url, publicId, name, size, type }`. On submit the API asks Cloudinary's Admin API about each file and refuses files from another question or form, URLs it did not issue, real sizes over the limit and formats the question does not take; the stored size replaces the browser's. Logos and cover images get the same check when the theme is saved.

Responses link to the files (they open in a new tab) and CSV exports have their URLs. Uploaded files are public but unguessable Cloudinary URLs. Set `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY` and `CLOUDINARY_API_SECRET` to switch uploads on; without them the signature endpoint answers `503 UPLOADS_UNAVAILABLE` and file questions say uploads are unavailable.

## Teams and roles

Every request that touches a workspace checks the caller's role in it. Owners manage people and can delete the workspace; editors build forms, manage responses and webhooks; viewers read forms and responses. The web app hides or disables what a role cannot do, and `apps/api/src/routes/authorization.test.ts` calls every protected endpoint as an owner, editor, viewer, non-member and signed-out visitor.

| Endpoint                                                     | Who     | Does                                                     |
| ------------------------------------------------------------ | ------- | -------------------------------------------------------- |
| `POST /api/workspaces`                                       | Anyone  | Creates a workspace owned by the caller                  |
| `PATCH`, `DELETE /api/workspaces/:workspaceId`               | Owners  | Renames, or deletes it with its forms and responses      |
| `GET /api/workspaces/:workspaceId/members`                   | Members | Members and roles                                        |
| `PATCH /api/workspaces/:workspaceId/members/:userId`         | Owners  | Changes a role                                           |
| `DELETE /api/workspaces/:workspaceId/members/:userId`        | Owners  | Removes someone; anyone may remove themselves (leave)    |
| `GET`, `POST /api/workspaces/:workspaceId/invites`           | Owners  | Open invites; invites `{ email, role }` by email         |
| `POST .../invites/:inviteId/resend`, `DELETE .../:inviteId`  | Owners  | A fresh link (the old one stops working), or withdraws   |
| `GET /api/invites/:token`, `POST /api/invites/:token/accept` | Link    | What the invite is for; joins (signed in, invited email) |

- **Invites** carry a random 256-bit token in the link; only its SHA-256 is stored. A link works for 7 days, once, and only for the invited address. Inviting someone again replaces their open invite. Used, withdrawn and expired links answer `410 INVITE_UNAVAILABLE` with the reason. `/invite/:token` works signed out too: it leads to sign-up or log-in with the email filled in and comes back. Invite emails are rate limited per user (`INVITE_RATE_LIMIT_MAX`).
- **Last owner.** Changing a role or removing someone locks the workspace's owner rows first, so a workspace always keeps an owner, even when two owners demote each other at once (`409 LAST_OWNER`).

## Webhooks

Editors manage a form's webhooks from its settings in the editor (Webhooks › Manage webhooks): add up to 10 endpoints, send a test event, read the last 20 deliveries and remove them.

- **Requests.** Each new response is `POST`ed as JSON (`event`, `form`, `submission` with each answer's label, raw value and readable text) with `X-Formyx-Event`, `X-Formyx-Delivery` (one id per event, shared by its retries) and `X-Formyx-Signature: sha256=<hex HMAC-SHA256 of the raw body, keyed with the webhook's secret>`. Verify by computing the same over the raw bytes and comparing in constant time.
- **Secrets** are shown once, when the webhook is added. They are stored encrypted (AES-256-GCM with a key derived from `JWT_SECRET`), so changing `JWT_SECRET` means adding webhooks again.
- **Retries.** No response, or anything but 2xx, is retried three times, after 2, 4 and 8 seconds, with the same body and signature. Requests time out after 10 seconds.
- **Limitation: the queue is in memory.** Deliveries waiting for a retry are lost if the API restarts, and with several API instances each retries only its own. A durable queue (a jobs table, or Redis with BullMQ) would remove this; `apps/api/src/webhooks/dispatcher.ts` keeps the same interface either way.
- **Private networks.** Endpoints must be public `https` URLs. Loopback, private, link-local (including cloud metadata addresses) and other non-public addresses are refused when the URL is added and again when connecting, through the socket's own DNS lookup, so a name that later resolves somewhere private is caught. `WEBHOOK_ALLOW_PRIVATE_URLS=true` lifts this for local development; never set it on a server. Webhook URLs never appear in logs, since some carry tokens.

## Scripts

Run from the repository root:

| Script            | Does                                               |
| ----------------- | -------------------------------------------------- |
| `pnpm dev`        | Starts web and api together, with reload           |
| `pnpm build`      | Builds every package                               |
| `pnpm lint`       | ESLint across the repo                             |
| `pnpm typecheck`  | TypeScript in every package                        |
| `pnpm test`       | Vitest in every package (API tests need Postgres)  |
| `pnpm test:e2e`   | Playwright (starts both dev servers automatically) |
| `pnpm db:up`      | Starts Postgres in Docker (`db:down` stops it)     |
| `pnpm db:migrate` | Creates and applies migrations in development      |
| `pnpm db:deploy`  | Applies pending migrations (CI and production)     |
| `pnpm db:studio`  | Opens Prisma Studio                                |
| `pnpm format`     | Formats with Prettier (`format:check` to verify)   |

Before the first `pnpm test:e2e`, install the browser once with `pnpm --filter @formyx/e2e exec playwright install chromium`. End-to-end tests sign up throwaway users in the development database.

## How packages share code

`@formyx/shared` exports its TypeScript source through a custom `@formyx/source` export condition. Vite, Vitest, tsx and the TypeScript compiler all use that condition, so development and tests never need a build step. Production builds of the API resolve the compiled `dist` output instead.
