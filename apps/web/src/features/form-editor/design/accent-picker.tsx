import {
  ACCENT_PRESETS,
  readableTextColor,
  themeReadabilityIssues,
  UI_MIN_CONTRAST,
  type FormTheme,
} from '@formyx/shared';
import { Check, TriangleAlert } from 'lucide-react';
import { RadioGroup as RadioGroupPrimitive } from 'radix-ui';
import { useId, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { parseHexInput } from './hex';

interface AccentPickerProps {
  theme: FormTheme;
  onChange: (accentColor: string, options?: { mergeKey: string }) => void;
}

/** One of the eight presets, or any colour by hex, with a warning when it is hard to see. */
export function AccentPicker({ theme, onChange }: AccentPickerProps) {
  const id = useId();
  const accent = theme.colors.primary;
  const preset = ACCENT_PRESETS.find((option) => option.color === accent);
  // The weakest contrast against anything the form sits on.
  const lowContrast = themeReadabilityIssues(theme)
    .filter((issue) => issue.part === 'primary')
    .sort((a, b) => a.ratio - b.ratio)[0];

  // The hex box shows what is being typed; it follows the accent when that changes elsewhere.
  const [text, setText] = useState(accent);
  const [shownAccent, setShownAccent] = useState(accent);
  const [touched, setTouched] = useState(false);
  if (accent !== shownAccent) {
    setShownAccent(accent);
    setText(accent);
    setTouched(false);
  }
  const invalid = touched && parseHexInput(text) === null;

  return (
    <div className="flex flex-col gap-3">
      <RadioGroupPrimitive.Root
        aria-label="Accent colour"
        value={preset?.color ?? ''}
        onValueChange={(color) => {
          onChange(color);
        }}
        className="grid grid-cols-8 gap-2"
      >
        {ACCENT_PRESETS.map((option) => (
          <RadioGroupPrimitive.Item
            key={option.id}
            value={option.color}
            aria-label={option.label}
            title={option.label}
            className={cn(
              'flex aspect-square w-full items-center justify-center rounded-full',
              'ring-offset-2 ring-offset-background transition-shadow duration-150 ease-standard',
              'hover:ring-2 hover:ring-border-strong data-[state=checked]:ring-2 data-[state=checked]:ring-foreground',
            )}
            style={{ backgroundColor: option.color }}
          >
            <RadioGroupPrimitive.Indicator>
              <Check
                aria-hidden
                className="size-3.5"
                strokeWidth={2.5}
                style={{ color: readableTextColor(option.color) }}
              />
            </RadioGroupPrimitive.Indicator>
          </RadioGroupPrimitive.Item>
        ))}
      </RadioGroupPrimitive.Root>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-hex`}>Custom colour</Label>
        <div className="flex gap-2">
          <label
            className="relative size-9 shrink-0 cursor-pointer overflow-hidden rounded-lg border border-input transition-colors duration-150 hover:border-control has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring"
            style={{ backgroundColor: accent }}
          >
            <span className="sr-only">Pick a colour</span>
            <input
              type="color"
              value={accent.toLowerCase()}
              className="absolute inset-0 cursor-pointer opacity-0"
              onChange={(event) => {
                onChange(event.target.value.toUpperCase(), { mergeKey: 'accent' });
              }}
            />
          </label>
          <Input
            id={`${id}-hex`}
            value={text}
            spellCheck={false}
            autoComplete="off"
            maxLength={7}
            aria-invalid={invalid || undefined}
            aria-describedby={`${id}-hint`}
            className="font-mono uppercase"
            onChange={(event) => {
              setText(event.target.value);
              const parsed = parseHexInput(event.target.value);
              if (parsed) onChange(parsed, { mergeKey: 'accent' });
            }}
            onBlur={() => {
              setTouched(true);
            }}
          />
        </div>
        <p
          id={`${id}-hint`}
          className={cn('text-13', invalid ? 'text-danger-text' : 'text-muted-foreground')}
        >
          {invalid ? 'Use six hex digits, such as 4370BD.' : 'A hex colour, such as 4370BD.'}
        </p>
      </div>

      {lowContrast && (
        <p role="status" className="flex gap-2 text-13 text-warning-text">
          <TriangleAlert aria-hidden className="mt-0.5 shrink-0" />
          <span>
            Low contrast: {lowContrast.ratio.toFixed(1)}:1 against this background. Buttons and
            focus rings need at least {UI_MIN_CONTRAST}:1 to stand out (WCAG AA).
          </span>
        </p>
      )}
    </div>
  );
}
