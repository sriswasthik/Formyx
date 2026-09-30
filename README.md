# Formyx

A full-stack form builder: build forms with drag and drop, add conditional logic, publish them with a shareable link and watch responses arrive live.

See [CLAUDE.md](./CLAUDE.md) for the product brief, design system and engineering rules.

## Stack

| Package           | What                                                                                                          |
| ----------------- | ------------------------------------------------------------------------------------------------------------- |
| `apps/web`        | React 18, Vite, TypeScript, Tailwind CSS v4, shadcn/ui (Radix), React Router, TanStack Query, React Hook Form |
| `apps/api`        | Node.js, Express 5, TypeScript, Prisma 7 + PostgreSQL, Zod, pino                                              |
| `packages/shared` | Zod schemas, types and pure logic shared by web and api                                                       |
| `e2e`             | Playwright end-to-end tests                                                                                   |

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
| `PATCH /api/forms/:formId`                | Editors | Updates `title` and/or `draftSchema`; send the `version` you edited |
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
- **Small screens.** Below 1024px the editor has Build, Settings and Preview tabs, and the question types open in a bottom sheet.
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
