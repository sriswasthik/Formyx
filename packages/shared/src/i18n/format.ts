import {
  FORM_LOCALES,
  type DateFormat,
  type FormLanguage,
  type NumberFormat,
} from './languages.js';

/*
 * Numbers, amounts and dates as respondents read them, in the form's language and formats:
 * piped into text, on end screens and in the emails they get. One set of functions for the
 * browser and the server, so what an email says matches what the page said.
 */

export interface FormatOptions {
  language: FormLanguage;
  dateFormat: DateFormat;
  numberFormat: NumberFormat;
}

/** How forms wrote numbers and dates before they had formats: and still do by default. */
export const DEFAULT_FORMAT: FormatOptions = {
  language: 'en',
  dateFormat: 'auto',
  numberFormat: 'auto',
};

const GROUPING_LOCALES: Record<Exclude<NumberFormat, 'auto'>, string> = {
  indian: 'en-IN',
  international: 'en-US',
  european: 'de-DE',
};

function numberLocale(options: FormatOptions, currency?: string): string {
  if (options.numberFormat !== 'auto') return GROUPING_LOCALES[options.numberFormat];
  if (options.language !== 'en') return FORM_LOCALES[options.language];
  return currency === 'INR' ? 'en-IN' : 'en';
}

/** A number with up to two decimals: 1,23,456.5 or 123,456.5 or 123.456,5. */
export function formatNumber(value: number, options: FormatOptions = DEFAULT_FORMAT): string {
  return new Intl.NumberFormat(numberLocale(options), { maximumFractionDigits: 2 }).format(value);
}

/** An amount: "₹1,500" in a sentence, "₹1,499.50" when there are paise. */
export function formatMoney(
  amount: number,
  currency: string,
  options: FormatOptions = DEFAULT_FORMAT,
): string {
  try {
    return new Intl.NumberFormat(numberLocale(options, currency), {
      style: 'currency',
      currency,
      minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${formatNumber(amount, options)}`;
  }
}

const CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * A calendar date (`2026-10-12`, as date answers are stored) as words or digits. Anything
 * else comes back as it is.
 */
export function formatDate(date: string, options: FormatOptions = DEFAULT_FORMAT): string {
  const match = CALENDAR_DATE.exec(date);
  if (!match) return date;
  const [, year = '', month = '', day = ''] = match;
  switch (options.dateFormat) {
    case 'dmy':
      return `${day}/${month}/${year}`;
    case 'mdy':
      return `${month}/${day}/${year}`;
    case 'ymd':
      return date;
    case 'auto': {
      // Midday UTC, read in UTC: the same calendar day in every time zone.
      const moment = new Date(`${date}T12:00:00Z`);
      if (Number.isNaN(moment.getTime())) return date;
      return new Intl.DateTimeFormat(FORM_LOCALES[options.language], {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
      }).format(moment);
    }
  }
}

/**
 * A moment (ISO 8601) as a date and time in `timeZone`, such as when a form opens. Numeric
 * date formats keep their order; the time follows the language.
 */
export function formatDateTime(
  iso: string,
  timeZone: string,
  options: FormatOptions = DEFAULT_FORMAT,
): string {
  const moment = new Date(iso);
  if (Number.isNaN(moment.getTime())) return iso;
  const locale = FORM_LOCALES[options.language];
  const time = new Intl.DateTimeFormat(locale, {
    hour: 'numeric',
    minute: '2-digit',
    timeZone,
  }).format(moment);
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone,
  }).format(moment);
  return `${formatDate(parts, options)}, ${time}`;
}
