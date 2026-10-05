import {
  getTexture,
  isPatternTexture,
  textureTile,
  type BackgroundLayer,
  type FormTheme,
  type GradientStop,
  type TextureId,
} from '@formyx/shared';
import type * as React from 'react';

/** A CSS `url()` for a link; quotes and backslashes are percent-encoded so it cannot break out. */
export function cssUrl(url: string): string {
  return `url("${url.replace(/["\\\n\r]/g, (char) => encodeURIComponent(char))}")`;
}

/** Where the app serves a file from its `public/` folder. */
export function publicAsset(file: string): string {
  return `${import.meta.env.BASE_URL}${file}`;
}

const tileUrls = new Map<string, string>();

/**
 * The mask image of a texture at a density: a data URL of its code-drawn SVG tile (built once
 * per texture and density), or its WebP file.
 */
export function textureMaskUrl(id: TextureId, density?: number): string {
  if (!isPatternTexture(id)) {
    const { draw } = getTexture(id);
    return cssUrl(publicAsset(draw.kind === 'photo' ? draw.file : ''));
  }
  const key = `${id}:${density ?? ''}`;
  let url = tileUrls.get(key);
  if (!url) {
    url = `url("data:image/svg+xml,${encodeURIComponent(textureTile(id, density).svg)}")`;
    tileUrls.set(key, url);
  }
  return url;
}

function stopList(stops: readonly GradientStop[]): string {
  return stops.map((stop) => `${stop.color} ${stop.position}%`).join(', ');
}

/** Layers that drift slowly when the theme animates its background. */
export function isAnimatableLayer(layer: BackgroundLayer): boolean {
  return (
    layer.type === 'linear' ||
    layer.type === 'radial' ||
    layer.type === 'mesh' ||
    layer.type === 'shapes'
  );
}

/**
 * How a layer is painted, for every kind but shapes (which are elements of their own). Each
 * layer fills its box; opacity and blend mode apply to the whole layer.
 */
export function layerStyle(layer: BackgroundLayer, theme: FormTheme): React.CSSProperties {
  const common: React.CSSProperties = {
    opacity: layer.opacity,
    ...(layer.blendMode !== 'normal' && { mixBlendMode: layer.blendMode }),
  };

  switch (layer.type) {
    case 'solid':
      return { ...common, backgroundColor: layer.color };
    case 'linear':
      return {
        ...common,
        backgroundImage: `linear-gradient(${layer.angle}deg, ${stopList(layer.stops)})`,
      };
    case 'radial':
      return {
        ...common,
        backgroundImage: `radial-gradient(${layer.shape} at ${layer.center.x}% ${layer.center.y}%, ${stopList(layer.stops)})`,
      };
    case 'mesh':
      // One soft ellipse of colour per point; together they blend like a mesh gradient.
      return {
        ...common,
        backgroundImage: layer.points
          .map(
            (point) =>
              `radial-gradient(${point.spread}% ${point.spread}% at ${point.x}% ${point.y}%, ${point.color} 0%, transparent 100%)`,
          )
          .join(', '),
      };
    case 'texture': {
      // Textures are masks: the tint shows through the tile's pattern. Code-drawn tiles mask
      // by alpha; photo tiles are greyscale and mask by luminance.
      const texture = getTexture(layer.assetId);
      const mask = textureMaskUrl(layer.assetId, layer.density);
      const size = `${Math.round(texture.tileSize * layer.scale)}px`;
      const mode = texture.draw.kind === 'photo' ? 'luminance' : 'alpha';
      return {
        ...common,
        backgroundColor: layer.tint ?? theme.colors.text,
        maskImage: mask,
        maskSize: size,
        maskRepeat: 'repeat',
        maskMode: mode,
        WebkitMaskImage: mask,
        WebkitMaskSize: size,
        WebkitMaskRepeat: 'repeat',
        // Safari's prefixed equivalent of mask-mode.
        WebkitMaskSourceType: mode,
      } as React.CSSProperties;
    }
    case 'image':
      return {
        ...common,
        backgroundImage: cssUrl(layer.url),
        backgroundSize: layer.fit,
        backgroundPosition: `${layer.focalPoint.x}% ${layer.focalPoint.y}%`,
        backgroundRepeat: 'no-repeat',
      };
    case 'shapes':
      return common;
  }
}
