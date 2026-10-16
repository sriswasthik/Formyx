import type { Script } from '@formyx/shared';
import { useEffect, useMemo } from 'react';

/*
 * Fonts for writing systems most theme fonts can't draw. Each loads the first time a form
 * needs it (see `formScripts` in shared) and joins every font stack of the form, after the
 * theme's fonts and before the generic families.
 */

export const SCRIPT_FAMILIES: Record<Script, string> = {
  telugu: "'Noto Sans Telugu'",
  devanagari: "'Noto Sans Devanagari'",
};

const LOADERS: Record<Script, () => Promise<unknown>> = {
  telugu: () => import('./script-font-telugu'),
  devanagari: () => import('./script-font-devanagari'),
};

const started = new Set<Script>();

/** Starts loading `script`'s font, once; a failed load is tried again next time. */
export function loadScriptFont(script: Script): void {
  if (started.has(script)) return;
  started.add(script);
  LOADERS[script]().catch(() => {
    started.delete(script);
  });
}

/** The font families for `scripts`, for `fontStack`; undefined when there are none. */
export function scriptFontStack(scripts: readonly Script[]): string | undefined {
  return scripts.length > 0
    ? scripts.map((script) => SCRIPT_FAMILIES[script]).join(', ')
    : undefined;
}

/** Loads the fonts `scripts` need, and returns their families for the form's font stacks. */
export function useScriptFonts(scripts: readonly Script[]): string | undefined {
  const key = scripts.join(' ');
  useEffect(() => {
    for (const script of key.split(' ')) if (script) loadScriptFont(script as Script);
  }, [key]);
  return useMemo(() => scriptFontStack(key ? (key.split(' ') as Script[]) : []), [key]);
}
