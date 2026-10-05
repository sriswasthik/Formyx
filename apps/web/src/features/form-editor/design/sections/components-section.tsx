import { cn } from '@/lib/utils';
import { useEditorStore } from '../../editor-store-context';
import { OptionCards } from '../option-cards';
import { StudioGroup } from '../studio-group';

const RADII = [
  { value: 'sharp', label: 'Sharp', px: 0 },
  { value: 'rounded', label: 'Rounded', px: 10 },
] as const;

const radiusOptions = RADII.map(({ value, label }) => ({
  value,
  label,
  preview: (
    <span
      className={cn(
        'block h-6 w-9 border-2 border-foreground/70',
        value === 'rounded' ? 'rounded-[7px]' : 'rounded-none',
      )}
    />
  ),
}));

/** How fields and buttons are drawn. */
export function ComponentsSection() {
  const radius = useEditorStore((state) => state.theme.components.radius);
  const updateTheme = useEditorStore((state) => state.updateTheme);
  return (
    <StudioGroup title="Corners">
      <OptionCards
        label="Corners"
        value={RADII.find((option) => option.px === radius)?.value ?? null}
        options={radiusOptions}
        onChange={(value) => {
          const px = RADII.find((option) => option.value === value)?.px ?? 10;
          updateTheme((current) => ({
            ...current,
            components: { ...current.components, radius: px },
          }));
        }}
      />
    </StudioGroup>
  );
}
