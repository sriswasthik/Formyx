import { PHONE_COUNTRY_TABLE } from './phone-countries.js';
import { compactPhone, DEFAULT_PHONE_COUNTRY, type PhoneCountry } from './phone.js';

/* Phone countries by code and calling code: for pickers and for showing numbers. */

export const PHONE_COUNTRIES: readonly PhoneCountry[] = PHONE_COUNTRY_TABLE.map(
  ([code, dial, minLength, maxLength]) => ({ code, dial, minLength, maxLength }),
);

export function getPhoneCountry(code: string): PhoneCountry | undefined {
  return PHONE_COUNTRIES.find((country) => country.code === code);
}

/**
 * Which country an E.164 number belongs to and its national part. Several countries share a
 * calling code (+1); `preferred` decides between them when it fits.
 */
export function splitPhone(
  e164: string,
  preferred: string = DEFAULT_PHONE_COUNTRY,
): { country: PhoneCountry; national: string } | null {
  const phone = compactPhone(e164);
  if (!phone.startsWith('+')) return null;
  const digits = phone.slice(1);
  const matches = PHONE_COUNTRIES.filter((country) => digits.startsWith(country.dial)).sort(
    (a, b) =>
      b.dial.length - a.dial.length || Number(b.code === preferred) - Number(a.code === preferred),
  );
  const country = matches[0];
  return country ? { country, national: digits.slice(country.dial.length) } : null;
}

/** "+91 98765 43210" for India, "+1 2025550123" style elsewhere. */
export function formatPhone(e164: string): string {
  const parts = splitPhone(e164);
  if (!parts) return e164;
  const { country, national } = parts;
  if (country.code === 'IN' && national.length === 10) {
    return `+91 ${national.slice(0, 5)} ${national.slice(5)}`;
  }
  return `+${country.dial} ${national}`;
}
