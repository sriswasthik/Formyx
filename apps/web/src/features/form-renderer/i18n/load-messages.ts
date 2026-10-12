import { en, type FormLanguage, type FormMessages } from '@formyx/shared';

/*
 * English comes with every form. Telugu and Hindi load only for forms in those languages,
 * together with fonts that have their scripts (most themes' fonts are Latin only, so the
 * browser would otherwise fall back to whatever the device has).
 */

const loaded = new Map<FormLanguage, FormMessages>([['en', en]]);

/** The catalog for `language`, loading it (and its script's font) the first time. */
export async function loadFormMessages(language: FormLanguage): Promise<FormMessages> {
  const known = loaded.get(language);
  if (known) return known;
  const messages =
    language === 'te' ? (await import('./catalog-te')).te : (await import('./catalog-hi')).hi;
  loaded.set(language, messages);
  return messages;
}

/** The catalog for `language` if it has loaded; English until then. */
export function loadedFormMessages(language: FormLanguage): FormMessages {
  return loaded.get(language) ?? en;
}
