# Formyx — Project Guide

## What we're building
Formyx is a full-stack form builder SaaS (like Tally/Typeform). Users build forms with drag-and-drop, add conditional logic, publish them with a shareable link, and view responses live with analytics. Forms are stored as a JSON schema and rendered from it. This is a portfolio project that must be production quality.

## Stack
- Monorepo with pnpm workspaces:
  - apps/web: React 18 + Vite + TypeScript (strict), React Router, TanStack Query, Zustand (+ immer), React Hook Form + Zod, dnd-kit, Tailwind CSS v4, shadcn/ui, lucide-react icons, motion (Framer Motion), sonner toasts, Recharts
  - apps/api: Node.js + Express + TypeScript, Prisma + PostgreSQL, Socket.IO, zod, pino, helmet, express-rate-limit, bcrypt, jsonwebtoken, Resend (email), Cloudinary (uploads)
  - packages/shared: Zod schemas, TypeScript types and pure logic shared by web and api (form schema, validation builder, conditional logic)
- Testing: Vitest (all packages), Supertest (api), React Testing Library (web), Playwright (e2e)
- Do NOT use Next.js.

## Design system (follow strictly)
Style: clean, minimal, professional, calm. Think Linear, Vercel, Notion.
- Colors: neutral zinc scale for surfaces, borders and text. Primary buttons are near-black (zinc-900) in light mode and near-white in dark mode. One restrained accent (#2E5AAC, muted blue), used only for focus rings, links, selected states and small highlights. Semantic colors: green-600 success, amber-600 warning, red-600 danger. All colors are CSS variables with light and dark themes.
- NEVER use: gradients, glows, neon, glassmorphism, purple/violet "AI" palettes, heavy shadows, emojis in UI, decorative blobs.
- Typography: Inter via @fontsource-variable/inter. Scale: 12, 13, 14, 16, 20, 24, 32, 40px. App UI body text is 14px, line-height 1.5. Headings are semibold with slightly tight letter-spacing. Use tabular-nums for numbers and stats. Clear hierarchy: one primary heading per page, muted secondary text (zinc-500).
- Spacing: 4px base grid. Generous whitespace. Page padding 24px mobile / 32–40px desktop. Cards p-5 or p-6. Consistent vertical rhythm.
- Shape: radius 8px for inputs/buttons, 12px for cards/dialogs. 1px borders (zinc-200 light / zinc-800 dark). Cards have no shadow by default; popovers and dialogs use a very soft shadow.
- Motion: use the motion library. Durations 150–250ms, easing [0.2, 0, 0, 1]. Animate opacity plus small translate (4–8px) or scale (0.98 → 1). Layout animations for list reordering. No bouncy springs, no large movements. Always respect prefers-reduced-motion.
- Interactions: every clickable element has a hover state (subtle background shift or border darken, 150ms), an active state and a visible focus-visible ring (2px accent, 2px offset). Cursor styles are correct. Disabled states are clear.
- Icons: lucide-react, 16px, stroke width 1.75.
- States: every data view has a loading skeleton, an empty state (icon + one line + action) and an error state.
- Responsive: mobile-first. Test at 375px, 768px and 1280px. No horizontal scroll.
- Accessibility: WCAG AA contrast, semantic HTML, labels on all inputs, full keyboard navigation, aria attributes where needed.

## Engineering rules
- TypeScript strict everywhere, no `any`.
- All API input validated with Zod. Share schemas via packages/shared.
- Consistent API error shape: { error: { code, message, details? } }.
- Keep components small and focused. Co-locate feature code under apps/web/src/features/<feature>.
- Never commit secrets. Keep .env.example files up to date.

## Workflow
- Each sprint happens on its own branch named sprint-<n>-<short-name>.
- Make small, logical commits using conventional commit messages.
- When a sprint is done, open a PR to main with a summary, screenshots notes and a testing checklist.

## Definition of done (every sprint)
- pnpm lint, pnpm typecheck, pnpm test and pnpm build all pass.
- No console errors or warnings in the browser.
- Works at 375px, 768px and 1280px, in light and dark mode.
- Keyboard accessible, reduced motion respected.
- New logic has tests.
- Finish with a short summary: what was built, key decisions and why, and anything left for later.
