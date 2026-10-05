import {
  applyPreset,
  createDefaultTheme,
  MAX_LAYERS,
  THEME_PRESETS,
  formThemeSchema,
} from '@formyx/shared';
import { describe, expect, it } from 'vitest';
import {
  addLayer,
  duplicateLayer,
  freeLayerId,
  layerTitle,
  moveLayer,
  newImageLayer,
  newLayer,
  removeLayer,
  toggleLayerHidden,
} from './layer-edits';

const studio = THEME_PRESETS.find((preset) => preset.id === 'studio');
if (!studio) throw new Error('No Studio preset');
// Layers bottom first: base, paper, shapes.
const theme = applyPreset(createDefaultTheme(), studio);
const ids = (next: typeof theme) => next.background.layers.map((layer) => layer.id);

describe('layer edits', () => {
  it.each(['solid', 'linear', 'radial', 'mesh', 'texture', 'shapes'] as const)(
    'starts a valid %s layer with a free id',
    (type) => {
      const layer = newLayer(theme, type, 7);
      const next = addLayer(theme, layer);
      expect(formThemeSchema.parse(next)).toEqual(next);
      expect(ids(next).at(-1)).toBe(layer.id);
      expect(new Set(ids(next)).size).toBe(ids(next).length);
    },
  );

  it('starts an image layer from an uploaded image, centred', () => {
    const layer = newImageLayer(theme, 'https://res.cloudinary.com/demo/bg.jpg');
    expect(layer).toMatchObject({ id: 'image', fit: 'cover', focalPoint: { x: 50, y: 50 } });
  });

  it('numbers ids that are taken', () => {
    expect(freeLayerId(theme, 'shapes')).toBe('shapes-2');
    expect(freeLayerId(theme, 'mesh')).toBe('mesh');
  });

  it('adds no more than the limit', () => {
    let full = theme;
    for (let index = 0; index < MAX_LAYERS; index += 1) {
      full = addLayer(full, newLayer(full, 'solid', index));
    }
    expect(full.background.layers).toHaveLength(MAX_LAYERS);
  });

  it('moves a layer to a place counted bottom first', () => {
    expect(ids(moveLayer(theme, 'shapes', 0))).toEqual(['shapes', 'base', 'paper']);
    expect(ids(moveLayer(theme, 'base', 2))).toEqual(['paper', 'shapes', 'base']);
    expect(ids(moveLayer(theme, 'base', 99))).toEqual(['paper', 'shapes', 'base']);
    expect(moveLayer(theme, 'missing', 0)).toBe(theme);
  });

  it('duplicates just above, with a new id', () => {
    const { theme: next, id } = duplicateLayer(theme, 'paper');
    expect(id).toBe('texture');
    expect(ids(next)).toEqual(['base', 'paper', 'texture', 'shapes']);
    expect(next.background.layers[2]).toMatchObject({ type: 'texture', assetId: 'paper' });
  });

  it('removes layers but always keeps one', () => {
    expect(ids(removeLayer(theme, 'paper'))).toEqual(['base', 'shapes']);
    const single = { ...theme, background: { layers: theme.background.layers.slice(0, 1) } };
    expect(removeLayer(single, 'base')).toBe(single);
  });

  it('hides and shows a layer, leaving no flag behind', () => {
    const hidden = toggleLayerHidden(theme, 'paper');
    expect(hidden.background.layers[1]?.hidden).toBe(true);
    expect(toggleLayerHidden(hidden, 'paper')).toEqual(theme);
  });

  it('names layers for the list', () => {
    expect(theme.background.layers.map(layerTitle)).toEqual([
      'Solid colour',
      'Texture · Paper',
      'Shapes · 3',
    ]);
  });
});
