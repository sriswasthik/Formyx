import { en } from './en.js';
import { DEFAULT_FORMAT, type FormatOptions } from './format.js';
import type { FormMessages } from './messages.js';

/** A form's words and formats together: what anything shown to respondents needs. */
export interface FormLocale {
  messages: FormMessages;
  format: FormatOptions;
}

export const ENGLISH_LOCALE: FormLocale = { messages: en, format: DEFAULT_FORMAT };

/** The locale of a form with `settings`, given the catalog for its language. */
export function formLocale(settings: FormatOptions, messages: FormMessages): FormLocale {
  return {
    messages,
    format: {
      language: settings.language,
      dateFormat: settings.dateFormat,
      numberFormat: settings.numberFormat,
    },
  };
}
