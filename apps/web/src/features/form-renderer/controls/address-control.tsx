import {
  ADDRESS_PART_LABELS,
  isAddressAnswer,
  PIN_CODE_PATTERN,
  pinCodeLookupSchema,
  type AddressAnswer,
  type AddressPart,
  type FieldOfType,
} from '@formyx/shared';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ApiRequestError, apiRequest } from '@/lib/api';
import { cn } from '@/lib/utils';
import { inputRadius, textControl } from '../styles';
import type { ControlProps } from '../types';

/** States and union territories, offered as suggestions for the state box. */
const STATES = [
  'Andaman and Nicobar Islands',
  'Andhra Pradesh',
  'Arunachal Pradesh',
  'Assam',
  'Bihar',
  'Chandigarh',
  'Chhattisgarh',
  'Dadra and Nagar Haveli and Daman and Diu',
  'Delhi',
  'Goa',
  'Gujarat',
  'Haryana',
  'Himachal Pradesh',
  'Jammu and Kashmir',
  'Jharkhand',
  'Karnataka',
  'Kerala',
  'Ladakh',
  'Lakshadweep',
  'Madhya Pradesh',
  'Maharashtra',
  'Manipur',
  'Meghalaya',
  'Mizoram',
  'Nagaland',
  'Odisha',
  'Puducherry',
  'Punjab',
  'Rajasthan',
  'Sikkim',
  'Tamil Nadu',
  'Telangana',
  'Tripura',
  'Uttar Pradesh',
  'Uttarakhand',
  'West Bengal',
];

const AUTOCOMPLETE: Record<AddressPart, string> = {
  line1: 'address-line1',
  line2: 'address-line2',
  pin: 'postal-code',
  city: 'address-level2',
  state: 'address-level1',
};

const EMPTY: AddressAnswer = { line1: '', line2: '', pin: '', city: '', state: '' };

type Lookup =
  | { state: 'idle' }
  | { state: 'looking' }
  | { state: 'found'; city: string; place: string }
  | { state: 'unknown' }
  | { state: 'failed' };

/**
 * An Indian address in five boxes. Typing a PIN code looks it up and fills in city and state
 * (when they are empty, or were filled by an earlier lookup); they stay editable.
 */
function AddressControl({
  field,
  controlId,
  describedBy,
  invalid,
  value,
  onChange,
}: ControlProps<FieldOfType<'address'>>) {
  const address = isAddressAnswer(value) ? { ...EMPTY, ...value } : EMPTY;
  const pin = address.pin.trim();
  const complete = PIN_CODE_PATTERN.test(pin);
  // The last lookup's outcome, for the PIN it was for; a new PIN is "looking" until it ends.
  const [result, setResult] = useState<{ pin: string; lookup: Lookup } | null>(null);
  const lookup: Lookup = !complete
    ? { state: 'idle' }
    : result?.pin === pin
      ? result.lookup
      : { state: 'looking' };
  // What the last lookup filled in, so a new PIN can replace it but not what was typed.
  const filled = useRef<{ city: string; state: string } | null>(null);
  const latest = useRef(address);
  useLayoutEffect(() => {
    latest.current = address;
  });

  const set = (part: AddressPart, text: string) => {
    const next = { ...latest.current, [part]: text };
    const blank = Object.values(next).every((piece) => piece.trim() === '');
    onChange(blank ? null : next);
  };

  useEffect(() => {
    if (!complete) return;
    let current = true;
    apiRequest(`/public/pincodes/${pin}`, pinCodeLookupSchema)
      .then((found) => {
        if (!current) return;
        const now = latest.current;
        const replaceable = (part: 'city' | 'state') =>
          now[part].trim() === '' || now[part] === filled.current?.[part];
        const next = {
          ...now,
          ...(replaceable('city') && { city: found.city }),
          ...(replaceable('state') && { state: found.state }),
        };
        filled.current = { city: found.city, state: found.state };
        onChange(next);
        setResult({
          pin,
          lookup: { state: 'found', city: found.city, place: `${found.city}, ${found.state}` },
        });
      })
      .catch((error: unknown) => {
        if (!current) return;
        const unknown = error instanceof ApiRequestError && error.status === 404;
        setResult({ pin, lookup: { state: unknown ? 'unknown' : 'failed' } });
      });
    return () => {
      current = false;
    };
    // Only a new PIN code is looked up.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin, complete]);

  const box = (part: AddressPart, className?: string) => {
    const id = part === 'line1' ? controlId : `${controlId}-${part}`;
    const optional = part === 'line2';
    return (
      <div className={cn('flex min-w-0 flex-col gap-1', className)}>
        <label htmlFor={id} className="form-text-sm text-(--form-muted)">
          {ADDRESS_PART_LABELS[part]}
          {optional && ' (optional)'}
        </label>
        <input
          id={id}
          type="text"
          inputMode={part === 'pin' ? 'numeric' : undefined}
          maxLength={part === 'pin' ? 6 : 200}
          autoComplete={AUTOCOMPLETE[part]}
          list={part === 'state' ? `${controlId}-states` : undefined}
          className={cn(textControl, inputRadius, 'h-11')}
          value={address[part] ?? ''}
          aria-describedby={
            part === 'pin' ? `${controlId}-pin-status ${describedBy ?? ''}`.trim() : describedBy
          }
          aria-invalid={invalid || undefined}
          aria-required={(field.required && !optional) || undefined}
          onChange={(event) => {
            set(part, part === 'pin' ? event.target.value.replace(/\D/g, '') : event.target.value);
          }}
        />
      </div>
    );
  };

  return (
    <div className="grid grid-cols-1 gap-3 @md:grid-cols-6">
      {box('line1', '@md:col-span-6')}
      {box('line2', '@md:col-span-6')}
      {box('pin', '@md:col-span-2')}
      {box('city', '@md:col-span-2')}
      {box('state', '@md:col-span-2')}
      <datalist id={`${controlId}-states`}>
        {STATES.map((state) => (
          <option key={state} value={state} />
        ))}
      </datalist>
      <p
        id={`${controlId}-pin-status`}
        role="status"
        className="form-text-sm text-(--form-muted) empty:hidden @md:col-span-6"
      >
        {lookup.state === 'looking' && 'Looking up the PIN code…'}
        {lookup.state === 'found' && `PIN code found: ${lookup.place}`}
        {lookup.state === 'unknown' &&
          'We could not find this PIN code. Check it, or type the city and state.'}
        {lookup.state === 'failed' && 'Type the city and state.'}
      </p>
    </div>
  );
}

export function Control(props: ControlProps) {
  return props.field.type === 'address' ? <AddressControl {...props} field={props.field} /> : null;
}
