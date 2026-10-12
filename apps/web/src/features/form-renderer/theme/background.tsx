import {
  getShape,
  hexToRgb,
  SHAPE_VIEWBOX,
  shapeItemPath,
  type BackgroundLayer,
  type FormTheme,
} from '@formyx/shared';
import { cx } from '@/lib/cx';
import { isAnimatableLayer, layerStyle } from './layer-styles';

type ShapesLayer = Extract<BackgroundLayer, { type: 'shapes' }>;

function Shapes({ layer }: { layer: ShapesLayer }) {
  return layer.items.map((item) => {
    const shape = getShape(item.type);
    const path = shapeItemPath(item);
    return (
      <svg
        key={item.id}
        data-shape={item.type}
        viewBox={SHAPE_VIEWBOX}
        className="absolute h-auto overflow-visible"
        style={{
          left: `${item.x}%`,
          top: `${item.y}%`,
          width: `${item.size}%`,
          aspectRatio: '1',
          transform: `translate(-50%, -50%) rotate(${item.rotation}deg)`,
          opacity: item.opacity,
          color: item.color,
          ...(item.blur > 0 && { filter: `blur(${item.blur}px)` }),
        }}
      >
        {shape.draw.kind === 'stroke' ? (
          <path
            d={path}
            fill="none"
            stroke="currentColor"
            strokeWidth={shape.draw.width}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : (
          <path d={path} fill="currentColor" fillRule={shape.draw.fillRule} />
        )}
      </svg>
    );
  });
}

function Layer({
  layer,
  theme,
  animate,
}: {
  layer: BackgroundLayer;
  theme: FormTheme;
  animate: boolean;
}) {
  const drifts = animate && isAnimatableLayer(layer);
  return (
    <div
      data-layer={layer.type}
      className={cx(
        'absolute',
        // A drifting layer is a little larger than its area, so its edges never show.
        drifts ? '-inset-[6%] motion-safe:animate-form-drift' : 'inset-0',
        // Narrow forms put shapes behind the text, so creators can leave them out there.
        layer.type === 'shapes' && layer.hideOnMobile && '@max-xl:hidden',
      )}
      style={layerStyle(layer, theme)}
    >
      {layer.type === 'shapes' && <Shapes layer={layer} />}
    </div>
  );
}

/** The overlay colour at its opacity, so the backdrop blur under it stays at full strength. */
function overlayColor({ color, opacity }: FormTheme['overlay']): string {
  const [r, g, b] = hexToRgb(color);
  return `rgb(${r} ${g} ${b} / ${opacity})`;
}

interface BackgroundProps {
  theme: FormTheme;
  /** Stays in view while a long page scrolls, like a fixed background. */
  sticky?: boolean;
  className?: string;
}

/**
 * A theme's background layers, bottom first, and its overlay. Purely decorative: hidden from
 * assistive technology and from the pointer.
 */
export function ThemeBackground({ theme, sticky = false, className }: BackgroundProps) {
  const { overlay } = theme;
  const showOverlay = overlay.opacity > 0 || overlay.blur > 0;

  return (
    <div
      aria-hidden
      data-theme-background
      // `clip` rather than `hidden`, which would stop the sticky layer inside from sticking.
      className={cx('pointer-events-none absolute inset-0 -z-10 overflow-clip', className)}
    >
      <div
        className={cx('w-full overflow-clip', sticky ? 'sticky top-0 h-dvh' : 'relative h-full')}
      >
        {theme.background.layers.map((layer) =>
          layer.hidden ? null : (
            <Layer
              key={layer.id}
              layer={layer}
              theme={theme}
              animate={theme.motion.animatedBackground}
            />
          ),
        )}
        {showOverlay && (
          <div
            data-overlay
            className="absolute inset-0"
            style={{
              backgroundColor: overlayColor(overlay),
              ...(overlay.blur > 0 && {
                backdropFilter: `blur(${overlay.blur}px)`,
                WebkitBackdropFilter: `blur(${overlay.blur}px)`,
              }),
            }}
          />
        )}
      </div>
    </div>
  );
}
