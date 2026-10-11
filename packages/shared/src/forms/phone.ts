/*
 * Phone numbers are stored in E.164 form: "+" then the calling code and the national number,
 * digits only (+919876543210). The country picker and per-country lengths come from a small
 * generated table (phone-lookup.ts); the validator itself needs none of it, so forms that
 * only check numbers never load it.
 */

export interface PhoneCountry {
  /** ISO 3166-1 alpha-2, such as IN. */
  code: string;
  /** The calling code without "+", such as 91. */
  dial: string;
  minLength: number;
  maxLength: number;
}

export const DEFAULT_PHONE_COUNTRY = 'IN';

const E164 = /^\+[1-9]\d{6,14}$/;
/** Indian mobile and landline numbers: ten digits, mobiles starting 6 to 9. */
const INDIAN_NUMBER = /^[6-9]\d{9}$/;

/** Spaces, dashes, dots and brackets dropped: "+91 98765-43210" -> "+919876543210". */
export function compactPhone(input: string): string {
  return input.trim().replace(/[\s().-]/g, '');
}

/** What is wrong with an E.164 number, or `null` if it looks right. */
export function phoneNumberProblem(input: string): string | null {
  const phone = compactPhone(input);
  if (!E164.test(phone)) return 'Enter a valid phone number with its country code';
  if (phone.startsWith('+91') && !INDIAN_NUMBER.test(phone.slice(3))) {
    return 'Enter a 10-digit Indian number';
  }
  return null;
}

/** An E.164 number in `country`, from what was typed in its national part. */
export function toE164(country: PhoneCountry, national: string): string {
  // A leading trunk 0 (as in 098765 43210) is not part of the international number.
  const digits = national.replace(/\D/g, '').replace(/^0+/, '');
  return digits === '' ? '' : `+${country.dial}${digits}`;
}

/** Whether `national` has a length numbers in `country` come in. */
export function fitsCountry(country: PhoneCountry, national: string): boolean {
  const length = national.replace(/\D/g, '').replace(/^0+/, '').length;
  return length >= country.minLength && length <= country.maxLength;
}
