import {
  DEFAULT_PHONE_COUNTRY,
  getPhoneCountry,
  isDateRangeAnswer,
  normalizeHexColor,
  splitPhone,
  toE164,
  type FieldOfType,
} from '@formyx/shared';
import { ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { namedCountries } from '../countries';
import { inputRadius, textControl } from '../styles';
import type { ControlProps } from '../types';

const input = cn(textControl, inputRadius, 'h-11');

function text(value: ControlProps['value']): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}

/** A country picker (starting on the question's country) and the number within it. */
function PhoneControl({
  field,
  controlId,
  describedBy,
  invalid,
  value,
  onChange,
}: ControlProps<FieldOfType<'phone'>>) {
  const countries = namedCountries();
  const initial = typeof value === 'string' ? splitPhone(value, field.defaultCountry) : null;
  const fallback = getPhoneCountry(field.defaultCountry) ?? getPhoneCountry(DEFAULT_PHONE_COUNTRY);
  const [countryCode, setCountryCode] = useState(initial?.country.code ?? fallback?.code ?? 'IN');
  const [national, setNational] = useState(initial?.national ?? '');
  // A reset (another response) clears the answer: clear the box too.
  const [shown, setShown] = useState(value);
  if (value !== shown) {
    setShown(value);
    if (value === null || value === undefined) setNational('');
  }
  const country = getPhoneCountry(countryCode) ?? fallback;

  const send = (nextCountry: string, nextNational: string) => {
    const picked = getPhoneCountry(nextCountry);
    if (!picked) return;
    const e164 = toE164(picked, nextNational);
    onChange(e164 === '' ? null : e164);
  };

  return (
    <div className="flex gap-2">
      <div className="relative w-28 shrink-0">
        <select
          aria-label="Country code"
          autoComplete="tel-country-code"
          className={cn(input, 'appearance-none pr-8 tabular-nums')}
          value={countryCode}
          onChange={(event) => {
            setCountryCode(event.target.value);
            send(event.target.value, national);
          }}
        >
          {countries.map((option) => (
            <option key={option.code} value={option.code}>
              {option.name} (+{option.dial})
            </option>
          ))}
        </select>
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-(--form-input-px) flex items-center bg-(--form-input-bg) pr-1 form-text tabular-nums"
        >
          {country ? `${country.code} +${country.dial}` : ''}
        </span>
        <ChevronDown
          aria-hidden
          className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-(--form-muted)"
        />
      </div>
      <input
        id={controlId}
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        className={cn(input, 'min-w-0 flex-1')}
        placeholder={field.placeholder || (country?.code === 'IN' ? '98765 43210' : undefined)}
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
        aria-required={field.required || undefined}
        value={national}
        onChange={(event) => {
          setNational(event.target.value);
          send(countryCode, event.target.value);
        }}
      />
    </div>
  );
}

function TimeControl({
  field,
  controlId,
  describedBy,
  invalid,
  value,
  onChange,
}: ControlProps<FieldOfType<'time'>>) {
  return (
    <input
      id={controlId}
      type="time"
      className={cn(input, 'max-w-48')}
      aria-describedby={describedBy}
      aria-invalid={invalid || undefined}
      aria-required={field.required || undefined}
      value={text(value)}
      onChange={(event) => {
        onChange(event.target.value === '' ? null : event.target.value);
      }}
    />
  );
}

/** Two dates; the end cannot be picked before the start. */
function DateRangeControl({
  field,
  controlId,
  describedBy,
  invalid,
  value,
  onChange,
}: ControlProps<FieldOfType<'date_range'>>) {
  const range = isDateRangeAnswer(value) ? value : { start: '', end: '' };
  const set = (part: 'start' | 'end', date: string) => {
    const next = { ...range, [part]: date };
    onChange(next.start === '' && next.end === '' ? null : next);
  };
  const part = (key: 'start' | 'end', label: string) => {
    const id = key === 'start' ? controlId : `${controlId}-end`;
    return (
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <label htmlFor={id} className="form-text-sm text-(--form-muted)">
          {label}
        </label>
        <input
          id={id}
          type="date"
          className={input}
          min={key === 'end' && range.start ? range.start : undefined}
          max={key === 'start' && range.end ? range.end : undefined}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          aria-required={field.required || undefined}
          value={range[key]}
          onChange={(event) => {
            set(key, event.target.value);
          }}
        />
      </div>
    );
  };
  return (
    <div className="flex flex-col gap-3 @sm:flex-row">
      {part('start', 'From')}
      {part('end', 'To')}
    </div>
  );
}

function UrlControl({
  field,
  controlId,
  describedBy,
  invalid,
  value,
  onChange,
}: ControlProps<FieldOfType<'url'>>) {
  return (
    <input
      id={controlId}
      type="url"
      inputMode="url"
      autoComplete="url"
      spellCheck={false}
      className={input}
      placeholder={field.placeholder || 'example.com'}
      aria-describedby={describedBy}
      aria-invalid={invalid || undefined}
      aria-required={field.required || undefined}
      value={text(value)}
      onChange={(event) => {
        onChange(event.target.value === '' ? null : event.target.value);
      }}
    />
  );
}

/** The currency's symbol, such as ₹ for INR. */
function currencySymbol(currency: string): string {
  try {
    return (
      new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en', {
        style: 'currency',
        currency,
        currencyDisplay: 'narrowSymbol',
      })
        .formatToParts(0)
        .find((part) => part.type === 'currency')?.value ?? currency
    );
  } catch {
    return currency;
  }
}

/** An amount after the currency's symbol. Typed text goes as it is; the validator reads it. */
function CurrencyControl({
  field,
  controlId,
  describedBy,
  invalid,
  value,
  onChange,
}: ControlProps<FieldOfType<'currency'>>) {
  const symbol = currencySymbol(field.currency);
  return (
    <div className="relative max-w-64">
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-(--form-input-px) flex items-center form-text text-(--form-muted)"
      >
        {symbol}
      </span>
      <input
        id={controlId}
        type="text"
        inputMode="decimal"
        className={cn(input, 'tabular-nums')}
        style={{ paddingLeft: `calc(var(--form-input-px) + ${symbol.length + 0.75}ch)` }}
        aria-label={undefined}
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
        aria-required={field.required || undefined}
        value={text(value)}
        onChange={(event) => {
          onChange(event.target.value === '' ? null : event.target.value);
        }}
      />
      <span className="sr-only">in {field.currency}</span>
    </div>
  );
}

/** The system colour picker beside a hex box; either sets the colour. */
function ColorControl({
  field,
  controlId,
  describedBy,
  invalid,
  value,
  onChange,
}: ControlProps<FieldOfType<'color'>>) {
  const typed = text(value);
  const color = normalizeHexColor(typed);
  return (
    <div className="flex items-center gap-2">
      <label
        className={cn(
          'relative size-11 shrink-0 cursor-pointer overflow-hidden rounded-(--form-input-radius) border border-(--form-border-strong)',
          'has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-(--form-accent)',
        )}
        style={{ backgroundColor: color ?? 'transparent' }}
      >
        <span className="sr-only">Pick a colour</span>
        <input
          type="color"
          value={(color ?? '#000000').toLowerCase()}
          className="absolute inset-0 cursor-pointer opacity-0"
          onChange={(event) => {
            onChange(event.target.value.toUpperCase());
          }}
        />
      </label>
      <input
        id={controlId}
        type="text"
        maxLength={7}
        spellCheck={false}
        autoComplete="off"
        placeholder="#2E5AAC"
        className={cn(input, 'max-w-36 font-mono uppercase')}
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
        aria-required={field.required || undefined}
        value={typed}
        onChange={(event) => {
          onChange(event.target.value === '' ? null : event.target.value);
        }}
      />
    </div>
  );
}

export function Control(props: ControlProps) {
  const { field } = props;
  switch (field.type) {
    case 'phone':
      return <PhoneControl {...props} field={field} />;
    case 'time':
      return <TimeControl {...props} field={field} />;
    case 'date_range':
      return <DateRangeControl {...props} field={field} />;
    case 'url':
      return <UrlControl {...props} field={field} />;
    case 'currency':
      return <CurrencyControl {...props} field={field} />;
    case 'color':
      return <ColorControl {...props} field={field} />;
    default:
      return null;
  }
}
