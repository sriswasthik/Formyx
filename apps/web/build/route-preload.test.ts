import type { IndexHtmlTransformContext, IndexHtmlTransformHook } from 'vite';
import { describe, expect, it } from 'vitest';
import { routePreload } from './route-preload.ts';

const chunk = (
  fileName: string,
  imports: string[],
  extra: Partial<Record<string, unknown>> = {},
) => ({
  type: 'chunk',
  fileName,
  isEntry: false,
  facadeModuleId: null,
  imports,
  ...extra,
});

const bundle = {
  'assets/index.js': chunk('assets/index.js', ['assets/react.js'], { isEntry: true }),
  'assets/react.js': chunk('assets/react.js', []),
  'assets/page.js': chunk('assets/page.js', ['assets/react.js', 'assets/view.js'], {
    facadeModuleId: 'C:\\app\\src\\features\\public-form\\page.tsx',
  }),
  'assets/view.js': chunk('assets/view.js', []),
};

function transform(html: string): string {
  const plugin = routePreload([{ pathPrefix: '/f/', module: 'src/features/public-form/page.tsx' }]);
  const hook = plugin.transformIndexHtml as { handler: IndexHtmlTransformHook };
  const context = { bundle } as unknown as IndexHtmlTransformContext;
  return hook.handler.call({} as never, html, context) as string;
}

describe('routePreload', () => {
  it("preloads a route's own chunks, not the ones the entry already loads", () => {
    const html = transform('<html><head></head><body></body></html>');
    expect(html).toContain('["/assets/page.js","/assets/view.js"]');
    expect(html).not.toContain('/assets/react.js');
  });

  it('runs before the stylesheets, which would otherwise hold it back', () => {
    const html = transform(
      '<html><head><script type="module" src="/assets/index.js"></script>\n' +
        '<link rel="stylesheet" crossorigin href="/assets/index.css"></head><body></body></html>',
    );
    expect(html.indexOf('location.pathname')).toBeLessThan(html.indexOf('rel="stylesheet"'));
    expect(html.indexOf('location.pathname')).toBeGreaterThan(html.indexOf('index.js'));
  });

  it('goes at the end of the head when there is no stylesheet', () => {
    const html = transform('<html><head><title>Formyx</title></head><body></body></html>');
    expect(html.indexOf('location.pathname')).toBeLessThan(html.indexOf('</head>'));
    expect(html.indexOf('location.pathname')).toBeGreaterThan(html.indexOf('</title>'));
  });
});
