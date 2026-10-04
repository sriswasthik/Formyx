import {
  getTexture,
  type BackgroundLayer,
  type FormTheme,
  type GradientStop,
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
      // Textures are masks: the tint shows through the tile's pattern.
      const texture = getTexture(layer.assetId);
      const mask = cssUrl(publicAsset(texture.file));
      const size = `${Math.round(texture.tileSize * layer.scale)}px`;
      return {
        ...common,
        backgroundColor: layer.tint ?? theme.colors.text,
        maskImage: mask,
        maskSize: size,
        maskRepeat: 'repeat',
        WebkitMaskImage: mask,
        WebkitMaskSize: size,
        WebkitMaskRepeat: 'repeat',
      };
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
