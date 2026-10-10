import {
  FONT_PAIRINGS,
  fontStack,
  getFont,
  nearestFontWeight,
  pairingTier,
  type FontId,
  type FormTheme,
  type ThemeTypography,
} from '@formyx/shared';
import { useEffect } from 'react';
import { ProBadge } from '@/features/entitlements/pro-badge';
import { loadFont } from '@/features/form-renderer/theme/fonts';
import { useEditorStore } from '../../editor-store-context';
import { SelectField, SliderField } from '../fields';
import { FontPicker } from '../font-picker';
import { OptionCards } from '../option-cards';
import { StudioGroup } from '../studio-group';

const WEIGHT_NAMES: Record<number, string> = {
  100: 'Thin',
  200: 'Extra light',
  300: 'Light',
  400: 'Regular',
  500: 'Medium',
  600: 'Semibold',
  700: 'Bold',
  800: 'Extra bold',
  900: 'Black',
};

const pairingOptions = FONT_PAIRINGS.map((pairing) => ({
  value: pairing.id,
  label: pairing.name,
  badge: pairingTier(pairing) === 'pro' ? <ProBadge /> : undefined,
  preview: (
    <span className="flex items-baseline gap-1">
      <span
        className="text-20 leading-none"
        style={{ fontFamily: fontStack(pairing.headingFont), fontWeight: pairing.headingWeight }}
      >
        Ag
      </span>
      <span className="text-12 leading-none" style={{ fontFamily: fontStack(pairing.bodyFont) }}>
        text
      </span>
    </span>
  ),
}));

const ALIGN_OPTIONS = [
  { value: 'left', label: 'Left', preview: <AlignPicture center={false} /> },
  { value: 'center', label: 'Centre', preview: <AlignPicture center /> },
] as const;

function AlignPicture({ center }: { center: boolean }) {
  return (
    <span className={`flex w-9 flex-col gap-1 ${center ? 'items-center' : 'items-start'}`}>
      <span className="block h-1 w-8 rounded-full bg-foreground/70" />
      <span className="block h-1 w-5 rounded-full bg-foreground/40" />
    </span>
  );
}

const NUMBERING_OPTIONS = [
  { value: 'none', label: 'None', preview: <span className="text-13">Name</span> },
  { value: 'number', label: 'Numbers', preview: <span className="text-13">1. Name</span> },
  { value: 'letter', label: 'Letters', preview: <span className="text-13">A. Name</span> },
] as const;

/** The pairing a theme's fonts make, if they make one. */
function currentPairing(typography: ThemeTypography) {
  return (
    FONT_PAIRINGS.find(
      (pairing) =>
        pairing.headingFont === typography.headingFont && pairing.bodyFont === typography.bodyFont,
    )?.id ?? null
  );
}

/** A new heading font keeps the heading weight where the font has it, or the nearest one. */
function withHeadingFont(theme: FormTheme, headingFont: FontId): FormTheme {
  return {
    ...theme,
    typography: {
      ...theme.typography,
      headingFont,
      headingWeight: nearestFontWeight(headingFont, theme.typography.headingWeight),
    },
  };
}

/** Fonts, pairings, sizes and how questions are set. */
export function TypographySection() {
  const typography = useEditorStore((state) => state.theme.typography);
  const updateTheme = useEditorStore((state) => state.updateTheme);
  const setTypography = (patch: Partial<ThemeTypography>, options?: { mergeKey: string }) => {
    updateTheme(
      (current) => ({ ...current, typography: { ...current.typography, ...patch } }),
      options,
    );
  };

  // The pairing cards are drawn in their fonts.
  useEffect(() => {
    for (const pairing of FONT_PAIRINGS) {
      void loadFont(pairing.headingFont);
      void loadFont(pairing.bodyFont);
    }
  }, []);

  const weights = getFont(typography.headingFont).weights.filter((weight) => weight >= 300);

  return (
    <>
      <StudioGroup title="Pairings" description="Heading and text fonts that go well together.">
        <OptionCards
          label="Font pairing"
          value={currentPairing(typography)}
          options={pairingOptions}
          columns={2}
          onChange={(id) => {
            const pairing = FONT_PAIRINGS.find((candidate) => candidate.id === id);
            if (!pairing) return;
            setTypography({
              headingFont: pairing.headingFont,
              bodyFont: pairing.bodyFont,
              headingWeight: pairing.headingWeight,
            });
          }}
        />
      </StudioGroup>
      <StudioGroup title="Fonts">
        <FontPicker
          label="Headings"
          value={typography.headingFont}
          onChange={(headingFont) => {
            updateTheme((current) => withHeadingFont(current, headingFont));
          }}
        />
        <FontPicker
          label="Text"
          value={typography.bodyFont}
          onChange={(bodyFont) => {
            setTypography({ bodyFont });
          }}
        />
        <SelectField
          label="Heading weight"
          value={String(nearestFontWeight(typography.headingFont, typography.headingWeight))}
          options={weights.map((weight) => ({
            value: String(weight),
            label: `${WEIGHT_NAMES[weight] ?? weight} (${weight})`,
          }))}
          onChange={(value) => {
            setTypography({ headingWeight: Number(value) });
          }}
        />
      </StudioGroup>
      <StudioGroup title="Size and spacing">
        <SliderField
          label="Text size"
          value={typography.baseSize}
          min={14}
          max={20}
          format={(value) => `${value}px`}
          mergeKey="typography.baseSize"
          onChange={(baseSize, options) => {
            setTypography({ baseSize }, options);
          }}
        />
        <SliderField
          label="Letter spacing"
          value={typography.letterSpacing}
          min={-0.05}
          max={0.1}
          step={0.005}
          format={(value) => `${value > 0 ? '+' : ''}${value.toFixed(3)} em`}
          mergeKey="typography.letterSpacing"
          onChange={(letterSpacing, options) => {
            setTypography({ letterSpacing: Number(letterSpacing.toFixed(3)) }, options);
          }}
        />
      </StudioGroup>
      <StudioGroup title="Questions">
        <OptionCards
          label="Text alignment"
          showLabel
          value={typography.textAlign}
          options={ALIGN_OPTIONS}
          onChange={(textAlign) => {
            setTypography({ textAlign });
          }}
        />
        <OptionCards
          label="Question numbers"
          showLabel
          value={typography.questionNumbering}
          options={NUMBERING_OPTIONS}
          onChange={(questionNumbering) => {
            setTypography({ questionNumbering });
          }}
        />
      </StudioGroup>
    </>
  );
}
