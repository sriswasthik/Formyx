# Formyx

A full-stack form builder: build forms with drag and drop, add conditional logic, publish them with a shareable link and watch responses arrive live.

See [CLAUDE.md](./CLAUDE.md) for the product brief, design system and engineering rules.

## Stack

| Package           | What                                                                                         |
| ----------------- | -------------------------------------------------------------------------------------------- |
| `apps/web`        | React 18, Vite, TypeScript, Tailwind CSS v4, shadcn/ui (Radix), React Router, TanStack Query |
| `apps/api`        | Node.js, Express 5, TypeScript, Zod, pino                                                    |
| `packages/shared` | Zod schemas, types and pure logic shared by web and api                                      |
| `e2e`             | Playwright end-to-end tests                                                                  |

## Getting started

Requirements: Node.js 22.13+ and pnpm (the exact version is pinned in `package.json`).

```sh
pnpm install

# Optional: override defaults
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env

pnpm dev
```

- Web: http://localhost:5173 (proxies `/api` to the API)
- API: http://localhost:4000 — health check at `/api/health`
- Styleguide (development only): http://localhost:5173/styleguide

## Scripts

Run from the repository root:

| Script           | Does                                               |
| ---------------- | -------------------------------------------------- |
| `pnpm dev`       | Starts web and api together, with reload           |
| `pnpm build`     | Builds every package                               |
| `pnpm lint`      | ESLint across the repo                             |
| `pnpm typecheck` | TypeScript in every package                        |
| `pnpm test`      | Vitest in every package                            |
| `pnpm test:e2e`  | Playwright (starts both dev servers automatically) |
| `pnpm format`    | Formats with Prettier (`format:check` to verify)   |

Before the first `pnpm test:e2e`, install the browser once with `pnpm --filter @formyx/e2e exec playwright install chromium`.

## How packages share code

`@formyx/shared` exports its TypeScript source through a custom `@formyx/source` export condition. Vite, Vitest, tsx and the TypeScript compiler all use that condition, so development and tests never need a build step. Production builds of the API resolve the compiled `dist` output instead.
