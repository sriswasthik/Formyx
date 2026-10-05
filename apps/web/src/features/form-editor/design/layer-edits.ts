import {
  getPalette,
  getTexture,
  MAX_LAYERS,
  meshFromPalette,
  mixHex,
  SCATTER_RECIPES,
  shapesFromRecipe,
  type BackgroundLayer,
  type BackgroundLayerType,
  type FormTheme,
} from '@formyx/shared';

/*
 * Edits to a theme's background layers, as pure functions of the theme so they can be
 * passed straight to `updateTheme` and tested on their own.
 */

export const LAYER_TYPE_LABELS: Record<BackgroundLayerType, string> = {
  solid: 'Solid colour',
  linear: 'Linear gradient',
  radial: 'Radial gradient',
  mesh: 'Mesh gradient',
  texture: 'Texture',
  shapes: 'Shapes',
  image: 'Image',
};

/** How the layer list names a layer. */
export function layerTitle(layer: BackgroundLayer): string {
  switch (layer.type) {
    case 'texture':
      return `Texture · ${getTexture(layer.assetId).name}`;
    case 'shapes':
      return `Shapes · ${layer.items.length}`;
    default:
      return LAYER_TYPE_LABELS[layer.type];
  }
}

/** An id like `mesh-2` that no layer of the theme uses yet. */
export function freeLayerId(theme: FormTheme, type: BackgroundLayerType): string {
  const taken = new Set(theme.background.layers.map((layer) => layer.id));
  for (let index = 1; ; index += 1) {
    const id = index === 1 ? type : `${type}-${index}`;
    if (!taken.has(id)) return id;
  }
}

export function canAddLayer(theme: FormTheme): boolean {
  return theme.background.layers.length < MAX_LAYERS;
}

/** A sensible starting layer of each kind, in the theme's colours. */
export function newLayer(
  theme: FormTheme,
  type: Exclude<BackgroundLayerType, 'image'>,
  seed: number,
): BackgroundLayer {
  const id = freeLayerId(theme, type);
  const common = { id, opacity: 1, blendMode: 'normal' } as const;
  const surface = theme.colors.containerBackground;
  const tint = mixHex(theme.colors.primary, surface, 22);
  switch (type) {
    case 'solid':
      return { ...common, type, color: surface };
    case 'linear':
      return {
        ...common,
        type,
        angle: 180,
        stops: [
          { color: surface, position: 0 },
          { color: tint, position: 100 },
        ],
      };
    case 'radial':
      return {
        ...common,
        type,
        shape: 'ellipse',
        center: { x: 50, y: 0 },
        stops: [
          { color: tint, position: 0 },
          { color: surface, position: 70 },
        ],
      };
    case 'mesh':
      return { ...common, type, points: meshFromPalette(getPalette('soft-pastel').colors, seed) };
    case 'texture':
      return { ...common, type, assetId: 'grain', scale: 1, density: 0.5, opacity: 0.15 };
    case 'shapes':
      return {
        ...shapesFromRecipe(
          SCATTER_RECIPES[1],
          [tint, mixHex(theme.colors.primary, surface, 45)],
          seed,
          id,
        ),
        hideOnMobile: true,
      };
  }
}

export function newImageLayer(theme: FormTheme, url: string): BackgroundLayer {
  return {
    id: freeLayerId(theme, 'image'),
    type: 'image',
    url,
    focalPoint: { x: 50, y: 50 },
    fit: 'cover',
    opacity: 1,
    blendMode: 'normal',
  };
}

function withLayers(theme: FormTheme, layers: BackgroundLayer[]): FormTheme {
  return { ...theme, background: { layers } };
}

/** Adds a layer on top of the others, while there is room. */
export function addLayer(theme: FormTheme, layer: BackgroundLayer): FormTheme {
  if (!canAddLayer(theme)) return theme;
  return withLayers(theme, [...theme.background.layers, layer]);
}

/** Changes one layer. */
export function updateLayer(
  theme: FormTheme,
  id: string,
  update: (layer: BackgroundLayer) => BackgroundLayer,
): FormTheme {
  return withLayers(
    theme,
    theme.background.layers.map((layer) => (layer.id === id ? update(layer) : layer)),
  );
}

/** Removes a layer; the last one stays, since a theme needs a background. */
export function removeLayer(theme: FormTheme, id: string): FormTheme {
  if (theme.background.layers.length <= 1) return theme;
  return withLayers(
    theme,
    theme.background.layers.filter((layer) => layer.id !== id),
  );
}

/** Copies a layer just above itself, with a new id. */
export function duplicateLayer(theme: FormTheme, id: string): { theme: FormTheme; id: string } {
  const index = theme.background.layers.findIndex((layer) => layer.id === id);
  const layer = theme.background.layers[index];
  if (!layer || !canAddLayer(theme)) return { theme, id };
  const copy = { ...structuredClone(layer), id: freeLayerId(theme, layer.type) };
  const layers = [...theme.background.layers];
  layers.splice(index + 1, 0, copy);
  return { theme: withLayers(theme, layers), id: copy.id };
}

/** Moves a layer to `toIndex`, counted bottom first as stored. */
export function moveLayer(theme: FormTheme, id: string, toIndex: number): FormTheme {
  const layers = [...theme.background.layers];
  const from = layers.findIndex((layer) => layer.id === id);
  const [layer] = from === -1 ? [] : layers.splice(from, 1);
  if (!layer) return theme;
  layers.splice(Math.max(0, Math.min(layers.length, toIndex)), 0, layer);
  return withLayers(theme, layers);
}

export function toggleLayerHidden(theme: FormTheme, id: string): FormTheme {
  return updateLayer(theme, id, (layer) => {
    if (layer.hidden) {
      const { hidden: _hidden, ...shown } = layer;
      return shown;
    }
    return { ...layer, hidden: true };
  });
}
