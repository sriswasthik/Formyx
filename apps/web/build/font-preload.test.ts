/// <reference lib="dom" />
import type { IndexHtmlTransformContext, IndexHtmlTransformHook } from 'vite';
import { afterEach, describe, expect, it } from 'vitest';
import { fontPreload } from './font-preload.ts';
import { runInlineScript } from './test-utils.ts';

const bundle = {
  'assets/inter-latin-wght-normal-A1.woff2': { type: 'asset' },
  'assets/inter-greek-wght-normal-B2.woff2': { type: 'asset' },
};

function script(): string {
  const plugin = fontPreload(/^assets\/inter-latin-wght-normal-[\w-]+\.woff2$/, '/f/');
  const hook = plugin.transformIndexHtml as { handler: IndexHtmlTransformHook };
  const context = { bundle } as unknown as IndexHtmlTransformContext;
  const html = hook.handler.call({} as never, '<head></head>', context) as string;
  return /<script>(.*)<\/script>/s.exec(html)?.[1] ?? '';
}

function preloadsOn(path: string): string[] {
  window.history.replaceState(null, '', path);
  runInlineScript(script());
  return [...document.head.querySelectorAll('link')].map(
    (link) => `${link.rel} ${link.getAttribute('href') ?? ''} ${link.getAttribute('as') ?? ''}`,
  );
}

describe('fontPreload', () => {
  afterEach(() => {
    document.head.innerHTML = '';
    window.history.replaceState(null, '', '/');
  });

  it('preloads the matching fonts on app pages', () => {
    expect(preloadsOn('/app/forms')).toEqual([
      'preload /assets/inter-latin-wght-normal-A1.woff2 font',
    ]);
  });

  it('leaves public forms to preload their own fonts', () => {
    expect(preloadsOn('/f/a-form')).toEqual([]);
  });
});
