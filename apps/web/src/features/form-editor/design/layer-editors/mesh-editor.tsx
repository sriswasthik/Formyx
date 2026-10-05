import {
  CURATED_PALETTE_IDS,
  getPalette,
  MESH_MAX_POINTS,
  MESH_MIN_POINTS,
  meshFromPalette,
  mixHex,
  randomSeed,
  shuffleMesh,
  withAddedMeshPoint,
  type BackgroundLayer,
  type FormTheme,
} from '@formyx/shared';
import { Plus, Shuffle, Trash2 } from 'lucide-react';
import { RadioGroup as RadioGroupPrimitive } from 'radix-ui';
import { useId } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { useEditorStore } from '../../editor-store-context';
import { ColorField, SliderField } from '../fields';
import { useStudio } from '../studio-state';
import type { LayerEditorProps } from './common';

type Mesh = Extract<BackgroundLayer, { type: 'mesh' }>;

/** Soft colours from the theme itself: its surface tinted with the accent. */
function themePalette(theme: FormTheme): string[] {
  const { primary, containerBackground } = theme.colors;
  return [8, 22, 34, 14, 28].map((amount) => mixHex(primary, containerBackground, amount));
}

function PaletteStrip({ colors }: { colors: readonly string[] }) {
  return (
    <span aria-hidden className="flex h-6 w-full overflow-hidden rounded-md border">
      {colors.map((color, index) => (
        // Colours may repeat, so their place in the strip is the key.
        <span key={`${index}-${color}`} className="flex-1" style={{ backgroundColor: color }} />
      ))}
    </span>
  );
}

/** Palettes that replace the mesh's colours, laid out afresh. */
function PalettePicker({
  theme,
  onPick,
}: {
  theme: FormTheme;
  onPick: (colors: readonly string[]) => void;
}) {
  const titleId = useId();
  const palettes = [
    { id: 'theme', name: 'Theme', colors: themePalette(theme) },
    ...CURATED_PALETTE_IDS.map((id) => getPalette(id)),
  ];
  return (
    <div className="flex flex-col gap-2">
      <p className="text-13 font-medium" id={titleId}>
        Generate from a palette
      </p>
      <ul aria-labelledby={titleId} className="grid grid-cols-2 gap-2">
        {palettes.map((palette) => (
          <li key={palette.id}>
            <button
              type="button"
              aria-label={`Generate from ${palette.name}`}
              onClick={() => {
                onPick(palette.colors);
              }}
              className={cn(
                'flex w-full flex-col gap-1.5 rounded-lg border bg-background p-1.5 text-left text-12',
                'transition-colors duration-150 ease-standard hover:border-border-strong active:bg-pressed',
              )}
            >
              <PaletteStrip colors={palette.colors} />
              <span className="px-0.5 text-muted-foreground">{palette.name}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A mesh gradient: colour points (also draggable on the preview), palettes and drift. */
export function MeshEditor({ layer, onChange }: LayerEditorProps<Mesh>) {
  const theme = useEditorStore((state) => state.theme);
  const updateTheme = useEditorStore((state) => state.updateTheme);
  const itemId = useStudio((state) => state.itemId);
  const selectItem = useStudio((state) => state.selectItem);
  const driftId = useId();
  const selectedIndex = itemId === null ? 0 : Math.min(Number(itemId), layer.points.length - 1);
  const point = layer.points[selectedIndex];

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            onChange((current) => ({
              ...current,
              points: shuffleMesh(current.points, randomSeed()),
            }));
          }}
        >
          <Shuffle aria-hidden />
          Shuffle
        </Button>
      </div>

      <PalettePicker
        theme={theme}
        onPick={(colors) => {
          onChange((current) => ({
            ...current,
            points: meshFromPalette(
              colors,
              randomSeed(),
              Math.max(MESH_MIN_POINTS, current.points.length),
            ),
          }));
        }}
      />

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-13 font-medium">Colour points</legend>
        <p className="text-12 text-muted-foreground">
          Drag the points on the preview to move them.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <RadioGroupPrimitive.Root
            aria-label="Colour point"
            value={String(selectedIndex)}
            onValueChange={selectItem}
            className="flex flex-wrap gap-2"
          >
            {layer.points.map((candidate, index) => (
              <RadioGroupPrimitive.Item
                // Points have no ids; their order is what the preview handles use too.
                key={index}
                value={String(index)}
                aria-label={`Point ${index + 1}`}
                className={cn(
                  'size-8 rounded-full border border-border-strong ring-offset-2 ring-offset-background',
                  'transition-shadow duration-150 ease-standard hover:ring-2 hover:ring-border-strong',
                  'data-[state=checked]:ring-2 data-[state=checked]:ring-foreground',
                )}
                style={{ backgroundColor: candidate.color }}
              />
            ))}
          </RadioGroupPrimitive.Root>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Add a colour point"
            disabled={layer.points.length >= MESH_MAX_POINTS}
            onClick={() => {
              onChange((current) => ({
                ...current,
                points: withAddedMeshPoint(
                  current.points,
                  current.points.at(-1)?.color ?? '#FFFFFF',
                ),
              }));
              selectItem(String(layer.points.length));
            }}
          >
            <Plus aria-hidden />
          </Button>
        </div>

        {point && (
          <div className="flex flex-col gap-3 rounded-lg border p-3">
            <ColorField
              label={`Point ${selectedIndex + 1} colour`}
              value={point.color}
              mergeKey={`mesh-color:${layer.id}:${selectedIndex}`}
              onChange={(color, options) => {
                onChange(
                  (current) => ({
                    ...current,
                    points: current.points.map((item, i) =>
                      i === selectedIndex ? { ...item, color } : item,
                    ),
                  }),
                  options,
                );
              }}
            />
            <SliderField
              label="Spread"
              value={point.spread}
              min={10}
              max={100}
              format={(value) => `${value}%`}
              mergeKey={`mesh-spread:${layer.id}:${selectedIndex}`}
              onChange={(spread, options) => {
                onChange(
                  (current) => ({
                    ...current,
                    points: current.points.map((item, i) =>
                      i === selectedIndex ? { ...item, spread } : item,
                    ),
                  }),
                  options,
                );
              }}
            />
            <div>
              <Button
                variant="ghost"
                size="sm"
                disabled={layer.points.length <= MESH_MIN_POINTS}
                onClick={() => {
                  onChange((current) => ({
                    ...current,
                    points: current.points.filter((_, i) => i !== selectedIndex),
                  }));
                  selectItem(String(Math.max(0, selectedIndex - 1)));
                }}
              >
                <Trash2 aria-hidden />
                Remove point
              </Button>
            </div>
          </div>
        )}
      </fieldset>

      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor={driftId}>Slow drift</Label>
          <p id={`${driftId}-hint`} className="text-12 text-muted-foreground">
            Gradients and shapes move gently. Always still for people who ask for less motion.
          </p>
        </div>
        <Switch
          id={driftId}
          aria-describedby={`${driftId}-hint`}
          checked={theme.motion.animatedBackground}
          onCheckedChange={(animatedBackground) => {
            updateTheme((current) => ({
              ...current,
              motion: { ...current.motion, animatedBackground },
            }));
          }}
        />
      </div>
    </>
  );
}
