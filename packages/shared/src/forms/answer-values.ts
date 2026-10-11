import { z } from 'zod';

/*
 * Answers that are more than text, a number or a list: an address, a date range and the
 * rows of a matrix. Each has a type guard, since stored answers are read as `unknown`.
 */

export const ADDRESS_PARTS = ['line1', 'line2', 'pin', 'city', 'state'] as const;
export type AddressPart = (typeof ADDRESS_PARTS)[number];

export const ADDRESS_PART_LABELS: Record<AddressPart, string> = {
  line1: 'Address line 1',
  line2: 'Address line 2',
  pin: 'PIN code',
  city: 'City',
  state: 'State',
};

/** An Indian postal address. Line 2 is optional. */
export interface AddressAnswer {
  line1: string;
  line2?: string;
  pin: string;
  city: string;
  state: string;
}

/** Six digits, not starting with 0. */
export const PIN_CODE_PATTERN = /^[1-9]\d{5}$/;

export function isAddressAnswer(value: unknown): value is AddressAnswer {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.line1 === 'string' &&
    typeof record.pin === 'string' &&
    typeof record.city === 'string' &&
    typeof record.state === 'string' &&
    (record.line2 === undefined || typeof record.line2 === 'string')
  );
}

/** Two calendar days (YYYY-MM-DD), the end on or after the start. */
export interface DateRangeAnswer {
  start: string;
  end: string;
}

export function isDateRangeAnswer(value: unknown): value is DateRangeAnswer {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return typeof record.start === 'string' && typeof record.end === 'string';
}

/** The column picked in each answered row: one id, or several when the matrix allows it. */
export type MatrixAnswer = Record<string, string | string[]>;

export const matrixAnswerSchema = z.record(z.string(), z.union([z.string(), z.array(z.string())]));

export function isMatrixAnswer(value: unknown): value is MatrixAnswer {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    !isAddressAnswer(value) &&
    !isDateRangeAnswer(value) &&
    matrixAnswerSchema.safeParse(value).success
  );
}

/** "#3a7" or "3A77FF" style input as "#33AA77", or `null` if it is not a colour. */
export function normalizeHexColor(input: string): string | null {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(input.trim());
  if (!match?.[1]) return null;
  const hex = match[1].length === 3 ? match[1].replace(/./g, '$&$&') : match[1];
  return `#${hex.toUpperCase()}`;
}

/**
 * A website address as typed ("example.com/page") made absolute, or `null` if it is not a
 * web address: http(s) only, with a host that has a dot in it.
 */
export function normalizeWebsiteUrl(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed === '' || /\s/.test(trimmed)) return null;
  const withScheme = /^[a-z][a-z\d+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (!url.hostname.includes('.') || url.hostname.endsWith('.')) return null;
    return url.href;
  } catch {
    return null;
  }
}

/** "HH:MM", 24-hour. */
export const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export interface VideoEmbed {
  provider: 'youtube' | 'vimeo';
  id: string;
  /** The privacy-friendly player address. */
  embedUrl: string;
}

/** The player for a YouTube or Vimeo link, or `null` if it is neither. */
export function parseVideoUrl(input: string): VideoEmbed | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  const host = url.hostname.replace(/^(www\.|m\.)/, '');
  const youtubeId = (id: string | null | undefined) =>
    id && /^[\w-]{11}$/.test(id)
      ? {
          provider: 'youtube' as const,
          id,
          embedUrl: `https://www.youtube-nocookie.com/embed/${id}`,
        }
      : null;

  if (host === 'youtu.be') return youtubeId(url.pathname.slice(1).split('/')[0]);
  if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (url.pathname === '/watch') return youtubeId(url.searchParams.get('v'));
    const match = /^\/(embed|shorts|live)\/([\w-]{11})/.exec(url.pathname);
    return youtubeId(match?.[2]);
  }
  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const match = /(?:^|\/)(\d{6,12})(?:$|[/?#])/.exec(url.pathname);
    const id = match?.[1];
    return id
      ? { provider: 'vimeo', id, embedUrl: `https://player.vimeo.com/video/${id}?dnt=1` }
      : null;
  }
  return null;
}
