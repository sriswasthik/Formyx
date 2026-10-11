import { PHONE_COUNTRIES, type PhoneCountry } from '@formyx/shared';

export interface NamedCountry extends PhoneCountry {
  /** In English, such as "India". */
  name: string;
}

let countries: readonly NamedCountry[] | null = null;

/** Every country with a calling code, by name. Worked out once, on first use. */
export function namedCountries(): readonly NamedCountry[] {
  if (countries) return countries;
  let regionNames: Intl.DisplayNames | null = null;
  try {
    regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
  } catch {
    // Older browsers show the codes instead.
  }
  countries = PHONE_COUNTRIES.map((country) => ({
    ...country,
    name: regionNames?.of(country.code) ?? country.code,
  })).sort((a, b) => a.name.localeCompare(b.name));
  return countries;
}
