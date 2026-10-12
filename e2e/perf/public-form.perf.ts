import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { applyPreset, E2E_PASSWORD, uniqueEmail } from '../tests/helpers.js';

/*
 * How fast a public form shows on a slow phone, with the heaviest themes: Largest Contentful
 * Paint under 2.5 s, and no layout shift from fonts or backgrounds. Throttled as Lighthouse's
 * mobile runs assume (a 4x slower CPU, 150 ms round trips, 1.6 Mbps down), but applied to the
 * real browser rather than simulated, which is a little harsher. Each theme loads cold (empty
 * cache) three times; the median counts. Results go to perf/results/public-form.json.
 */

const RUNS = 3;
const LCP_BUDGET_MS = 2500;
const CLS_BUDGET = 0.1;

/** Plain, then each kind of heavy background with display fonts. */
const THEMES = [
  { preset: 'Minimal', heavy: 'nothing: the baseline' },
  { preset: 'Paper', heavy: 'a photographic paper texture' },
  { preset: 'Sunrise mesh', heavy: 'a mesh gradient and a Pro display font' },
  { preset: 'Pastel blobs', heavy: 'blurred blob shapes over a mesh' },
  { preset: 'Botanical', heavy: 'a contour texture, shapes and a Pro serif' },
  { preset: 'Confetti party', heavy: 'scattered confetti shapes and pill choices' },
];

interface Measurement {
  lcp: number;
  lcpElement: string;
  fcp: number;
  cls: number;
  shifts: { value: number; sources: string[] }[];
  transferKb: number;
}

/** Collects paint and layout-shift entries from the first moment the page exists. */
function observe() {
  const store = window as Window & {
    perf?: { lcp: number; lcpElement: string; shifts: { value: number; sources: string[] }[] };
  };
  const perf = { lcp: 0, lcpElement: '', shifts: [] as { value: number; sources: string[] }[] };
  store.perf = perf;
  const describe = (node: Node | null | undefined) => {
    if (!(node instanceof Element)) return node ? node.nodeName : 'unknown';
    const data = [...node.attributes]
      .filter((attribute) => attribute.name.startsWith('data-'))
      .map((attribute) => `[${attribute.name}${attribute.value ? `=${attribute.value}` : ''}]`)
      .join('');
    return `${node.tagName.toLowerCase()}${data}`;
  };
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries() as (PerformanceEntry & { element?: Element })[]) {
      perf.lcp = entry.startTime;
      perf.lcpElement = describe(entry.element);
    }
  }).observe({ type: 'largest-contentful-paint', buffered: true });
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries() as (PerformanceEntry & {
      value: number;
      hadRecentInput: boolean;
      sources?: { node?: Node | null }[];
    })[]) {
      if (entry.hadRecentInput) continue;
      perf.shifts.push({
        value: entry.value,
        sources: (entry.sources ?? []).map((source) => describe(source.node)),
      });
    }
  }).observe({ type: 'layout-shift', buffered: true });
}

async function measure(browser: Browser, path: string): Promise<Measurement> {
  const context = await browser.newContext({
    ...test.info().project.use,
    storageState: { cookies: [], origins: [] },
  });
  const page = await context.newPage();
  await page.addInitScript(observe);
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 150,
    downloadThroughput: (1.6 * 1024 * 1024) / 8,
    uploadThroughput: (750 * 1024) / 8,
  });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

  let transfer = 0;
  cdp.on('Network.loadingFinished', (event: { encodedDataLength: number }) => {
    transfer += event.encodedDataLength;
  });
  await page.goto(path, { waitUntil: 'load' });
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  // Late fonts and background images would show up as shifts in this time.
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1500);

  const result = await page.evaluate(() => {
    const store = window as Window & {
      perf?: { lcp: number; lcpElement: string; shifts: { value: number; sources: string[] }[] };
    };
    const paint = performance.getEntriesByName('first-contentful-paint')[0];
    return { ...store.perf, fcp: paint?.startTime ?? 0 };
  });
  await context.close();
  const shifts = result.shifts ?? [];
  return {
    lcp: Math.round(result.lcp ?? 0),
    lcpElement: result.lcpElement ?? '',
    fcp: Math.round(result.fcp),
    cls: Number(shifts.reduce((sum, shift) => sum + shift.value, 0).toFixed(4)),
    shifts,
    transferKb: Math.round(transfer / 1024),
  };
}

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
};

/** A user of its own, signed in on `page`. */
async function signIn(page: Page) {
  const response = await page.request.post('/api/auth/register', {
    data: { name: 'Perf Tester', email: uniqueEmail('perf'), password: E2E_PASSWORD },
  });
  expect(response.ok(), await response.text()).toBe(true);
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.setItem('formyx-signed-in', '1');
  });
}

/** A published copy of the event registration template in `preset`; its path. */
async function publishedForm(page: Page, preset: string): Promise<string> {
  const me = (await (await page.request.get('/api/auth/me')).json()) as {
    workspaces: { id: string }[];
  };
  const created = await page.request.post(`/api/workspaces/${me.workspaces[0]?.id ?? ''}/forms`, {
    data: { templateId: 'event_registration' },
  });
  const { id } = (await created.json()) as { id: string };
  await applyPreset(page, id, preset);
  const form = (await (await page.request.get(`/api/forms/${id}`)).json()) as {
    version: number;
    slug: string;
  };
  const published = await page.request.post(`/api/forms/${id}/publish`, {
    data: { version: form.version },
  });
  expect(published.ok(), await published.text()).toBe(true);
  return `/f/${form.slug}`;
}

test('the public form paints fast and holds still on a slow phone', async ({ browser }) => {
  const setup = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    ignoreHTTPSErrors: true,
  });
  const editor = await setup.newPage();
  await signIn(editor);

  const rows: (Measurement & { preset: string; heavy: string; runs: number[] })[] = [];
  for (const { preset, heavy } of THEMES) {
    const path = await publishedForm(editor, preset);
    const runs: Measurement[] = [];
    for (let run = 0; run < RUNS; run += 1) runs.push(await measure(browser, path));
    const middle = runs.find((run) => run.lcp === median(runs.map(({ lcp }) => lcp))) ?? runs[0];
    if (!middle) throw new Error('No runs');
    rows.push({
      ...middle,
      preset,
      heavy,
      cls: Math.max(...runs.map(({ cls }) => cls)),
      runs: runs.map(({ lcp }) => lcp),
    });
  }
  await setup.close();

  const dir = join(import.meta.dirname, 'results');
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'public-form.json'),
    `${JSON.stringify({ measuredAt: new Date().toISOString(), runs: RUNS, rows }, null, 2)}\n`,
  );
  // The results table: what this test is run for.
  // eslint-disable-next-line no-console
  console.log(
    [
      '| Theme | Heavy part | LCP (median) | LCP runs | FCP | CLS (worst) | Transfer |',
      '| --- | --- | --- | --- | --- | --- | --- |',
      ...rows.map(
        (row) =>
          `| ${row.preset} | ${row.heavy} | ${String(row.lcp)} ms | ${row.runs.join(' / ')} | ${String(row.fcp)} ms | ${String(row.cls)} | ${String(row.transferKb)} KB |`,
      ),
    ].join('\n'),
  );

  for (const row of rows) {
    expect(row.lcp, `${row.preset}: LCP`).toBeLessThan(LCP_BUDGET_MS);
    expect(row.cls, `${row.preset}: CLS ${JSON.stringify(row.shifts)}`).toBeLessThan(CLS_BUDGET);
  }
});
