import type { FormLanguage } from './languages.js';

/*
 * Writing systems most theme fonts can't draw, which forms load a font for (Noto Sans
 * Telugu, Noto Sans Devanagari) only when they need it: when the form is in that language,
 * when its own words are written in it, or when a respondent types in it.
 */

export const SCRIPTS = ['telugu', 'devanagari'] as const;
export type Script = (typeof SCRIPTS)[number];

/** A character class for the code points from `from` to `to`. */
const block = (...ranges: [from: number, to: number][]) =>
  new RegExp(
    `[${ranges.map(([from, to]) => `${String.fromCodePoint(from)}-${String.fromCodePoint(to)}`).join('')}]`,
    'u',
  );

/** Each script's Unicode blocks (Devanagari with its extended block). */
const PATTERNS: Record<Script, RegExp> = {
  telugu: block([0x0c00, 0x0c7f]),
  devanagari: block([0x0900, 0x097f], [0xa8e0, 0xa8ff]),
};

/** The script each form language is written in, for those that need a font. */
export const LANGUAGE_SCRIPTS: Partial<Record<FormLanguage, Script>> = {
  te: 'telugu',
  hi: 'devanagari',
};

/** The scripts that need a font among `texts`, in `SCRIPTS` order. */
export function scriptsIn(...texts: readonly (string | null | undefined)[]): Script[] {
  return SCRIPTS.filter((script) =>
    texts.some((text) => typeof text === 'string' && PATTERNS[script].test(text)),
  );
}

/**
 * The scripts a form needs fonts for: its language's, and any its words are written in.
 * Everything a respondent might read is somewhere in `content` (a schema, say), so it is
 * searched whole.
 */
export function formScripts(language: FormLanguage, content: unknown): Script[] {
  const own = LANGUAGE_SCRIPTS[language];
  const found = scriptsIn(JSON.stringify(content));
  return SCRIPTS.filter((script) => script === own || found.includes(script));
}
