import { BLEND_MODES, type BackgroundLayer, type BlendMode } from '@formyx/shared';
import { SelectField, SliderField } from '../fields';
import { percent } from '../format';

/** Changes the layer being edited. Live edits (drags) pass a merge key, as in the store. */
export type LayerChange<L extends BackgroundLayer = BackgroundLayer> = (
  update: (layer: L) => L,
  options?: { mergeKey: string },
) => void;

export interface LayerEditorProps<L extends BackgroundLayer> {
  layer: L;
  onChange: LayerChange<L>;
}

const BLEND_LABELS: Record<BlendMode, string> = {
  normal: 'Normal',
  multiply: 'Multiply',
  screen: 'Screen',
  overlay: 'Overlay',
  darken: 'Darken',
  lighten: 'Lighten',
  'color-dodge': 'Colour dodge',
  'color-burn': 'Colour burn',
  'hard-light': 'Hard light',
  'soft-light': 'Soft light',
  difference: 'Difference',
  exclusion: 'Exclusion',
  hue: 'Hue',
  saturation: 'Saturation',
  color: 'Colour',
  luminosity: 'Luminosity',
};

const BLEND_OPTIONS = BLEND_MODES.map((mode) => ({ value: mode, label: BLEND_LABELS[mode] }));

/** What every layer has: how strongly it shows and how it mixes with the layers below. */
export function LayerBasics({ layer, onChange }: LayerEditorProps<BackgroundLayer>) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <SliderField
        label="Opacity"
        value={layer.opacity}
        min={0}
        max={1}
        step={0.01}
        format={percent}
        mergeKey={`layer-opacity:${layer.id}`}
        onChange={(opacity, options) => {
          onChange((current) => ({ ...current, opacity }), options);
        }}
      />
      <SelectField
        label="Blend"
        value={layer.blendMode}
        options={BLEND_OPTIONS}
        onChange={(blendMode) => {
          onChange((current) => ({ ...current, blendMode }));
        }}
      />
    </div>
  );
}
