import { z } from 'zod';

/*
 * The languages a form's own words (buttons, messages, dates) can be in. What creators type
 * is theirs to write in any language; this covers everything Formyx adds around it.
 */

export const FORM_LANGUAGES = ['en', 'te', 'hi'] as const;
export const formLanguageSchema = z.enum(FORM_LANGUAGES);
export type FormLanguage = z.infer<typeof formLanguageSchema>;

/** Each language in its own script, then in English, for pickers. */
export const FORM_LANGUAGE_NAMES: Record<FormLanguage, { native: string; english: string }> = {
  en: { native: 'English', english: 'English' },
  te: { native: 'తెలుగు', english: 'Telugu' },
  hi: { native: 'हिन्दी', english: 'Hindi' },
};

/** The locale dates and numbers are written in: Indian English, Telugu and Hindi. */
export const FORM_LOCALES: Record<FormLanguage, string> = {
  en: 'en-IN',
  te: 'te-IN',
  hi: 'hi-IN',
};

/**
 * How dates are written. `auto` follows the language (12 Oct 2026, 12 అక్టో 2026, …); the
 * others are fixed numeric orders.
 */
export const DATE_FORMATS = ['auto', 'dmy', 'mdy', 'ymd'] as const;
export const dateFormatSchema = z.enum(DATE_FORMATS);
export type DateFormat = z.infer<typeof dateFormatSchema>;

export const DATE_FORMAT_LABELS: Record<DateFormat, string> = {
  auto: 'From the language (12 Oct 2026)',
  dmy: 'DD/MM/YYYY (12/10/2026)',
  mdy: 'MM/DD/YYYY (10/12/2026)',
  ymd: 'YYYY-MM-DD (2026-10-12)',
};

/**
 * How numbers are grouped. `auto` groups amounts in rupees the Indian way and other numbers
 * the international way, as forms always have.
 */
export const NUMBER_FORMATS = ['auto', 'indian', 'international', 'european'] as const;
export const numberFormatSchema = z.enum(NUMBER_FORMATS);
export type NumberFormat = z.infer<typeof numberFormatSchema>;

export const NUMBER_FORMAT_LABELS: Record<NumberFormat, string> = {
  auto: 'Automatic (₹1,23,456 for rupees, 123,456 otherwise)',
  indian: 'Indian (1,23,456.78)',
  international: 'International (123,456.78)',
  european: 'European (123.456,78)',
};
