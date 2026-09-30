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

After changing `apps/api/prisma/schema.prisma`, run `pnpm db:migrate` to create and apply a migration. The Prisma client is generated into `apps/api/src/generated` on install (or with `pnpm --filter @formyx/api db:generate`).

## Authentication

- `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout` and `GET /api/auth/me`. Signing up also creates a personal workspace owned by the new user.
- Sessions are 7-day JWTs in an httpOnly, `SameSite=Lax` cookie, marked `Secure` in production. In development the web app proxies `/api`, so the cookie is first-party. In production, serve the web app and API from the same site (for example `formyx.app` and `api.formyx.app`).
- Passwords are hashed with bcrypt (`BCRYPT_COST`, default 12). Log-in failures always say "Invalid email or password".
- Sign-ups and failed log-ins are rate limited per IP (`AUTH_RATE_LIMIT_MAX` per 15 minutes). Behind a load balancer, set `TRUST_PROXY` (usually `1`) so the limit applies to real client IPs.
- `requireAuth` protects routes; `requireWorkspaceRole('EDITOR')` additionally checks the caller's role in the `:workspaceId` route param (OWNER > EDITOR > VIEWER).

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
