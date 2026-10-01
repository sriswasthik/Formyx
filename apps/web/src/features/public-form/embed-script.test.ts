import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * public/embed.js is what other sites load to show a form, so it is tested as they would run
 * it: plain script text, with `document.currentScript` pointing at a <script src> on the
 * Formyx site.
 */

const SOURCE = readFileSync(join(import.meta.dirname, '../../../public/embed.js'), 'utf8');
const FORMYX = 'https://forms.formyx.test';

function runEmbedScript() {
  const script = document.createElement('script');
  script.src = `${FORMYX}/embed.js`;
  vi.spyOn(document, 'currentScript', 'get').mockReturnValue(script);
  // eslint-disable-next-line @typescript-eslint/no-implied-eval -- runs the file as a browser would
  new Function(SOURCE)();
}

function frameOf(container: Element): HTMLIFrameElement {
  const frame = container.querySelector('iframe');
  if (!frame) throw new Error('No iframe was added');
  return frame;
}

function deliver(
  data: unknown,
  { origin = FORMYX, from }: { origin?: string; from: Window | null },
) {
  window.dispatchEvent(new MessageEvent('message', { data, origin, source: from }));
}

beforeEach(() => {
  document.body.innerHTML =
    '<div id="a" data-formyx="party-abc"></div><div id="b" data-formyx="job-xyz"></div>';
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('embed.js', () => {
  it('is small enough to load anywhere', () => {
    expect(Buffer.byteLength(SOURCE)).toBeLessThan(3 * 1024);
  });

  it('puts the embedded form in each placeholder, once', () => {
    runEmbedScript();
    runEmbedScript();

    const a = document.getElementById('a');
    if (!a) throw new Error('missing');
    expect(a.querySelectorAll('iframe')).toHaveLength(1);
    const src = new URL(frameOf(a).src);
    expect(src.origin).toBe(FORMYX);
    expect(src.pathname).toBe('/f/party-abc');
    expect(src.searchParams.get('embed')).toBe('1');
    expect(src.searchParams.get('parent')).toBe(window.location.origin);
    expect(frameOf(a).title).toBe('Form');
  });

  it('resizes the right iframe, only for messages from its form', () => {
    runEmbedScript();
    const a = document.getElementById('a');
    const b = document.getElementById('b');
    if (!a || !b) throw new Error('missing');
    const frame = frameOf(a);

    deliver(
      { source: 'formyx', type: 'resize', slug: 'party-abc', height: 712.4, title: 'Party' },
      {
        from: frame.contentWindow,
      },
    );
    expect(frame.style.height).toBe('713px');
    expect(frame.title).toBe('Party');
    expect(frameOf(b).style.height).toBe('480px');

    // Another site, another frame, or junk: ignored.
    deliver(
      { source: 'formyx', type: 'resize', height: 10 },
      {
        origin: 'https://evil.example',
        from: frame.contentWindow,
      },
    );
    deliver({ source: 'formyx', type: 'resize', height: 10 }, { from: window });
    deliver({ source: 'formyx', type: 'resize', height: -5 }, { from: frame.contentWindow });
    deliver('resize', { from: frame.contentWindow });
    expect(frame.style.height).toBe('713px');
  });

  it('tells the host page when a response was sent', () => {
    runEmbedScript();
    const a = document.getElementById('a');
    if (!a) throw new Error('missing');
    const listener = vi.fn<(event: Event) => void>();
    document.addEventListener('formyx:submitted', listener);

    deliver(
      { source: 'formyx', type: 'submitted', slug: 'party-abc' },
      {
        from: frameOf(a).contentWindow,
      },
    );
    deliver(
      { source: 'formyx', type: 'submitted' },
      {
        origin: 'https://evil.example',
        from: frameOf(a).contentWindow,
      },
    );

    expect(listener).toHaveBeenCalledTimes(1);
    const [event] = listener.mock.calls[0] ?? [];
    expect(event).toBeInstanceOf(CustomEvent);
    expect((event as CustomEvent<{ slug: string }>).detail).toEqual({ slug: 'party-abc' });
    expect(event?.target).toBe(a);
    document.removeEventListener('formyx:submitted', listener);
  });

  it('mounts forms added later when asked', () => {
    runEmbedScript();
    const late = document.createElement('div');
    late.setAttribute('data-formyx', 'late-form');
    document.body.appendChild(late);

    (window as unknown as { Formyx: { scan: () => void } }).Formyx.scan();

    expect(new URL(frameOf(late).src).pathname).toBe('/f/late-form');
  });
});
