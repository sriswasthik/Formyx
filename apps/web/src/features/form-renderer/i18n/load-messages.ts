import { en, type FormLanguage, type FormMessages } from '@formyx/shared';

/*
 * English comes with every form. Telugu and Hindi load only for forms in those languages;
 * the fonts for their scripts load with the form's text (theme/script-fonts.ts).
 */

const loaded = new Map<FormLanguage, FormMessages>([['en', en]]);

/** The catalog for `language`, loading it the first time. */
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
