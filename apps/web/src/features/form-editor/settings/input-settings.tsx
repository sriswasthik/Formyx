import { VOICE_NOTE_MAX_SECONDS, type FieldOfType } from '@formyx/shared';
import { FormField } from '@/components/form-field';
import { Input } from '@/components/ui/input';
import { SelectItem } from '@/components/ui/select';
import { namedCountries } from '@/features/form-renderer/countries';
import type { FieldPatch } from '../editor-store';
import { NumberInput } from './number-input';
import { compact } from './compact-limits';
import { RangeInputs } from './range-inputs';
import { SelectField } from './select-field';
import { SettingsSection } from './settings-section';

type Update = (patch: FieldPatch, mergeKey?: string) => void;

interface Props<T> {
  field: T;
  issues: Record<string, string>;
  update: Update;
}

export function PhoneSettings({ field, issues, update }: Props<FieldOfType<'phone'>>) {
  const countries = namedCountries();
  return (
    <SettingsSection title="Country">
      <SelectField
        id="setting-phone-country"
        label="Starts on"
        hint="Respondents can pick another country."
        error={issues.defaultCountry}
        value={field.defaultCountry}
        onValueChange={(defaultCountry) => {
          update({ defaultCountry });
        }}
      >
        {countries.map((country) => (
          <SelectItem key={country.code} value={country.code}>
            {country.name} (+{country.dial})
          </SelectItem>
        ))}
      </SelectField>
    </SettingsSection>
  );
}

/** Currencies offered in the picker; a form keeps any other code it already has. */
const CURRENCIES = [
  'INR',
  'USD',
  'EUR',
  'GBP',
  'AED',
  'SGD',
  'AUD',
  'CAD',
  'JPY',
  'CHF',
  'SAR',
  'MYR',
  'NZD',
  'HKD',
  'ZAR',
  'LKR',
  'NPR',
  'BDT',
] as const;

let currencyNames: Intl.DisplayNames | null | undefined;

function currencyName(code: string): string {
  if (currencyNames === undefined) {
    try {
      currencyNames = new Intl.DisplayNames(['en'], { type: 'currency' });
    } catch {
      currencyNames = null;
    }
  }
  const name = currencyNames?.of(code);
  return name && name !== code ? `${name} (${code})` : code;
}

export function CurrencySettings({ field, issues, update }: Props<FieldOfType<'currency'>>) {
  const codes: readonly string[] = (CURRENCIES as readonly string[]).includes(field.currency)
    ? CURRENCIES
    : [field.currency, ...CURRENCIES];
  return (
    <SettingsSection title="Amount">
      <SelectField
        id="setting-currency"
        label="Currency"
        error={issues.currency}
        value={field.currency}
        onValueChange={(currency) => {
          update({ currency });
        }}
      >
        {codes.map((code) => (
          <SelectItem key={code} value={code}>
            {currencyName(code)}
          </SelectItem>
        ))}
      </SelectField>
      <RangeInputs
        id="setting-amount"
        minLabel="Minimum"
        maxLabel="Maximum"
        integer={false}
        min={field.validation?.min}
        max={field.validation?.max}
        errors={{ min: issues['validation.min'], max: issues['validation.max'] }}
        onChange={(range, key) => {
          update({ validation: compact(range) }, `range-${key}`);
        }}
      />
    </SettingsSection>
  );
}

export function HiddenSettings({ field, issues, update }: Props<FieldOfType<'hidden'>>) {
  const name = field.paramName.trim() || 'source';
  return (
    <SettingsSection title="Link parameter">
      <FormField
        id="setting-param"
        label="Parameter name"
        hint={`Add ?${name}=value to the form link to fill it in.`}
        error={issues.paramName}
      >
        <Input
          value={field.paramName}
          maxLength={64}
          autoComplete="off"
          spellCheck={false}
          className="font-mono"
          onChange={(event) => {
            update({ paramName: event.target.value }, 'param');
          }}
        />
      </FormField>
    </SettingsSection>
  );
}

export function VoiceNoteSettings({ field, issues, update }: Props<FieldOfType<'voice_note'>>) {
  return (
    <SettingsSection title="Recording">
      <FormField
        id="setting-voice-max"
        label="Longest recording (seconds)"
        hint={`5 to ${VOICE_NOTE_MAX_SECONDS} seconds.`}
        error={issues.maxDurationSeconds}
      >
        <NumberInput
          integer
          className="w-28"
          value={field.maxDurationSeconds}
          onValueChange={(value) => {
            update({ maxDurationSeconds: value ?? 0 }, 'voice-max');
          }}
        />
      </FormField>
    </SettingsSection>
  );
}
