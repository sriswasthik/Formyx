/* eslint-disable no-console -- a command-line report: printing is its job. */
// Reports how much each route downloads (JS and CSS, gzipped) after `vite build`, and fails
// when the public form, which respondents load on any connection, grows past its budget.
// Usage: pnpm --filter @formyx/web build && pnpm --filter @formyx/web size
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const DIST = join(import.meta.dirname, '..', 'dist');
/** What opening a public form may download before it shows, gzipped. */
// Measured at 180 KB in Sprint 8 (from 255 KB) and 190 KB after Sprint 10's backgrounds.
// Sprint 11 (forty fonts, choice and button styles, progress bars) took it to 193 KB with the
// conversational flow and the font loaders loading lazily; the headroom is for small additions.
// Sprint 12 (21 question types, pages, hidden fields) is 199.8 KB: the new types' controls,
// file uploads, image and video blocks and the phone country table load only with forms
// that use them, but every type's schema and validator ship with every form.
// Sprint 13 (pages, jumps, piping, shuffling, saved progress) raised it to 205 KB; it is
// 204.8 KB with end screens, saving by email, resuming and quiz marking loading lazily, and
// the checks that span a form schema kept out of the public form (form-schema-shape.ts).
// Sprint 14 (form languages, password and email steps, edit links, prefilled links) added
// about 9 KB, with Telugu and Hindi, their fonts and the access screens loading lazily; the
// renderer joining classes with `cx` instead of tailwind-merge's `cn` took 10 KB back: 204.2 KB.
// Sprint 19 (billing) left the form's own code as it was, but the app's entry carries the
// router table (three more lazy pages) and the one stylesheet carries the new pages' classes:
// 205.9 KB, so the budget was 207 KB. Checkout's script never loads on public forms.
// Sprint 20 (launch) raises this to 210.9 KB after the new launch experience additions, so
// keep a small headroom for minor route-level growth.
// Redesign 1 and 3 (brand, landing page): the form's own code grew by the badge's logo, and the
// one stylesheet by the landing page's classes, 0.7 KB of it: 212.1 KB, so the budget is
// 213 KB. Keeping marketing styles out of public forms would take a stylesheet of their own.
const PUBLIC_FORM_BUDGET_KB = 213;

const ROUTES = {
  'Public form (/f/:slug)': 'src/features/public-form/public-form-page.tsx',
  'Landing (/)': 'src/features/landing/landing-page.tsx',
  'Log in': 'src/features/auth/login-page.tsx',
  'Forms dashboard': 'src/features/forms/forms-page.tsx',
  Editor: 'src/features/form-editor/editor-page.tsx',
  Responses: 'src/features/responses/responses-page.tsx',
  'Workspace settings': 'src/features/settings/workspace/workspace-settings-page.tsx',
};

const manifest = JSON.parse(readFileSync(join(DIST, '.vite', 'manifest.json'), 'utf8'));
const gzipCache = new Map();

function gzipKb(file) {
  if (!gzipCache.has(file)) {
    gzipCache.set(file, gzipSync(readFileSync(join(DIST, file)), { level: 9 }).length / 1024);
  }
  return gzipCache.get(file);
}

/** Every chunk a module needs before it runs: itself and its static imports, recursively. */
function closure(key, seen = new Set()) {
  if (seen.has(key)) return seen;
  const chunk = manifest[key];
  if (!chunk) throw new Error(`Not in the build manifest: ${key}`);
  seen.add(key);
  for (const imported of chunk.imports ?? []) closure(imported, seen);
  return seen;
}

function routeSize(routeKey) {
  // A route bundled into the entry has no chunk of its own: the entry is all it loads.
  const own = manifest[routeKey] ? closure(routeKey) : [];
  const keys = new Set([...closure('index.html'), ...own]);
  let js = 0;
  let css = 0;
  for (const key of keys) {
    js += gzipKb(manifest[key].file);
    for (const file of manifest[key].css ?? []) css += gzipKb(file);
  }
  return { js, css, total: js + css };
}

const rows = Object.entries(ROUTES).map(([name, key]) => ({ name, ...routeSize(key) }));
const pad = (value, width) => String(value).padStart(width);
console.log(`${'Route'.padEnd(26)}${pad('JS', 9)}${pad('CSS', 9)}${pad('Total', 10)}  (KB, gzip)`);
for (const { name, js, css, total } of rows) {
  console.log(
    `${name.padEnd(26)}${pad(js.toFixed(1), 9)}${pad(css.toFixed(1), 9)}${pad(total.toFixed(1), 10)}`,
  );
}

const publicForm = rows[0];
if (publicForm.total > PUBLIC_FORM_BUDGET_KB) {
  console.error(
    `\nThe public form loads ${publicForm.total.toFixed(1)} KB, over its ${PUBLIC_FORM_BUDGET_KB} KB budget.`,
  );
  process.exit(1);
}
console.log(
  `\nPublic form: ${publicForm.total.toFixed(1)} KB of its ${PUBLIC_FORM_BUDGET_KB} KB budget.`,
);
