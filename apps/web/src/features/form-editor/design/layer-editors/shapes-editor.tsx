import {
  getShape,
  MAX_SHAPES,
  randomSeed,
  SCATTER_RECIPES,
  scatterLayer,
  SHAPES,
  shapesFromRecipe,
  withShapeCount,
  type BackgroundLayer,
  type ThemeShape,
} from '@formyx/shared';
import { Shuffle, Trash2 } from 'lucide-react';
import { useId } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { ColorField, SelectField, SliderField } from '../fields';
import { percent } from '../format';
import { useStudio } from '../studio-state';
import type { LayerEditorProps } from './common';

type Shapes = Extract<BackgroundLayer, { type: 'shapes' }>;

const SHAPE_OPTIONS = SHAPES.map((shape) => ({
  value: shape.id,
  label: shape.tier === 'pro' ? `${shape.name} (Pro)` : shape.name,
}));

/** The layer's colours, so a new set of shapes keeps the look. */
function layerColors(layer: Shapes): string[] {
  return [...new Set(layer.items.map((item) => item.color))].slice(0, 6);
}

/** One shape's look and place; its place can also be dragged on the preview. */
function ShapeControls({
  layer,
  shape,
  onChange,
}: LayerEditorProps<Shapes> & { shape: ThemeShape }) {
  const selectItem = useStudio((state) => state.selectItem);
  const update = (patch: Partial<ThemeShape>, options?: { mergeKey: string }) => {
    onChange(
      (current) => ({
        ...current,
        items: current.items.map((item) => (item.id === shape.id ? { ...item, ...patch } : item)),
      }),
      options,
    );
  };
  const key = (name: string) => `shape-${name}:${layer.id}:${shape.id}`;

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-3">
      <SelectField
        label="Shape"
        value={shape.type}
        options={SHAPE_OPTIONS}
        onChange={(type) => {
          update(
            type === 'blob' && shape.seed === undefined ? { type, seed: randomSeed() } : { type },
          );
        }}
      />
      <ColorField
        label="Colour"
        value={shape.color}
        mergeKey={key('color')}
        onChange={(color, options) => {
          update({ color }, options);
        }}
      />
      <div className="grid grid-cols-2 gap-3">
        <SliderField
          label="Size"
          value={shape.size}
          min={2}
          max={100}
          format={(value) => `${value}%`}
          mergeKey={key('size')}
          onChange={(size, options) => {
            update({ size }, options);
          }}
        />
        <SliderField
          label="Rotation"
          value={shape.rotation}
          min={-180}
          max={180}
          format={(value) => `${value}°`}
          mergeKey={key('rotation')}
          onChange={(rotation, options) => {
            update({ rotation }, options);
          }}
        />
        <SliderField
          label="Opacity"
          value={shape.opacity}
          min={0}
          max={1}
          step={0.01}
          format={percent}
          mergeKey={key('opacity')}
          onChange={(opacity, options) => {
            update({ opacity }, options);
          }}
        />
        <SliderField
          label="Blur"
          value={shape.blur}
          min={0}
          max={64}
          format={(value) => `${value}px`}
          mergeKey={key('blur')}
          onChange={(blur, options) => {
            update({ blur }, options);
          }}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        {shape.type === 'blob' && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              update({ seed: randomSeed() });
            }}
          >
            <Shuffle aria-hidden />
            New blob
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          disabled={layer.items.length <= 1}
          onClick={() => {
            onChange((current) => ({
              ...current,
              items: current.items.filter((item) => item.id !== shape.id),
            }));
            selectItem(null);
          }}
        >
          <Trash2 aria-hidden />
          Remove shape
        </Button>
      </div>
    </div>
  );
}

export function ShapesEditor({ layer, onChange }: LayerEditorProps<Shapes>) {
  const itemId = useStudio((state) => state.itemId);
  const selectItem = useStudio((state) => state.selectItem);
  const mobileId = useId();
  const recipesId = useId();
  const shape = layer.items.find((item) => item.id === itemId) ?? null;

  return (
    <>
      <div className="flex flex-col gap-2">
        <p id={recipesId} className="text-13 font-medium">
          Start from a set
        </p>
        <ul aria-labelledby={recipesId} className="flex flex-wrap gap-2">
          {SCATTER_RECIPES.map((recipe) => (
            <li key={recipe.id}>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  onChange((current) => ({
                    ...shapesFromRecipe(recipe, layerColors(current), randomSeed(), current.id),
                    opacity: current.opacity,
                    blendMode: current.blendMode,
                    ...(current.hidden && { hidden: true }),
                    ...(current.hideOnMobile && { hideOnMobile: true }),
                  }));
                  selectItem(null);
                }}
              >
                {recipe.name}
              </Button>
            </li>
          ))}
        </ul>
        <p className="text-12 text-muted-foreground">
          Blobs, stars, arches, waves and squiggles are Pro shapes.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-40 flex-1">
          <SliderField
            label="Number of shapes"
            value={layer.items.length}
            min={1}
            max={MAX_SHAPES}
            mergeKey={`shape-count:${layer.id}`}
            onChange={(count, options) => {
              onChange((current) => withShapeCount(current, count), options);
            }}
          />
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            onChange((current) => scatterLayer(current, randomSeed()));
          }}
        >
          <Shuffle aria-hidden />
          Scatter
        </Button>
      </div>

      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor={mobileId}>Hide on phones</Label>
          <p id={`${mobileId}-hint`} className="text-12 text-muted-foreground">
            On narrow screens the form covers the page, so shapes would sit behind the text.
          </p>
        </div>
        <Switch
          id={mobileId}
          aria-describedby={`${mobileId}-hint`}
          checked={layer.hideOnMobile ?? false}
          onCheckedChange={(hideOnMobile) => {
            onChange((current) => {
              const { hideOnMobile: _previous, ...rest } = current;
              return hideOnMobile ? { ...rest, hideOnMobile } : rest;
            });
          }}
        />
      </div>

      <div className="flex flex-col gap-3">
        <SelectField
          label="Edit a shape"
          value={shape?.id ?? ''}
          placeholder="Choose a shape"
          options={layer.items.map((item, index) => ({
            value: item.id,
            label: `${index + 1}. ${getShape(item.type).name}`,
          }))}
          onChange={selectItem}
        />
        <p className={cn('text-12 text-muted-foreground', shape && 'sr-only')}>
          Or click a shape on the preview. Drag shapes there to move them.
        </p>
        {shape && <ShapeControls layer={layer} shape={shape} onChange={onChange} />}
      </div>
    </>
  );
}
