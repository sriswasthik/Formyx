import {
  DEFAULT_TEXTURE_DENSITY,
  getTexture,
  isPatternTexture,
  TEXTURES,
  type BackgroundLayer,
  type TextureId,
} from '@formyx/shared';
import { RadioGroup as RadioGroupPrimitive } from 'radix-ui';
import type * as React from 'react';
import { Button } from '@/components/ui/button';
import { ProBadge } from '@/features/entitlements/pro-badge';
import { textureMaskUrl } from '@/features/form-renderer/theme/layer-styles';
import { cn } from '@/lib/utils';
import { useEditorStore } from '../../editor-store-context';
import { ColorField, SliderField } from '../fields';
import { percent } from '../format';
import type { LayerEditorProps } from './common';

type Texture = Extract<BackgroundLayer, { type: 'texture' }>;

/** A small square of the texture in its picker colours. */
function TextureSwatch({ id }: { id: TextureId }) {
  const texture = getTexture(id);
  const mask = textureMaskUrl(id);
  const mode = texture.draw.kind === 'photo' ? 'luminance' : 'alpha';
  // Shown a little smaller than full size, so a few tiles fit.
  const size = `${Math.min(48, Math.round(texture.tileSize * 0.5))}px`;
  return (
    <span
      aria-hidden
      className="relative block aspect-square w-full overflow-hidden rounded-md border"
      style={{ backgroundColor: texture.swatch.background }}
    >
      <span
        className="absolute inset-0"
        style={
          {
            backgroundColor: texture.swatch.tint,
            opacity: 0.7,
            maskImage: mask,
            maskSize: size,
            maskMode: mode,
            WebkitMaskImage: mask,
            WebkitMaskSize: size,
            WebkitMaskSourceType: mode,
          } as React.CSSProperties
        }
      />
    </span>
  );
}

export function TextureEditor({ layer, onChange }: LayerEditorProps<Texture>) {
  const textColor = useEditorStore((state) => state.theme.colors.text);
  const pattern = isPatternTexture(layer.assetId);

  return (
    <>
      <RadioGroupPrimitive.Root
        aria-label="Texture"
        value={layer.assetId}
        onValueChange={(id) => {
          const texture = TEXTURES.find((candidate) => candidate.id === id);
          if (texture) onChange((current) => ({ ...current, assetId: texture.id }));
        }}
        className="grid grid-cols-4 gap-2"
      >
        {TEXTURES.map((texture) => (
          <RadioGroupPrimitive.Item
            key={texture.id}
            value={texture.id}
            className={cn(
              'flex flex-col gap-1 rounded-lg border bg-background p-1 text-left text-12',
              'transition-colors duration-150 ease-standard hover:border-border-strong active:bg-pressed',
              'data-[state=checked]:border-accent data-[state=checked]:bg-accent-subtle',
            )}
          >
            <TextureSwatch id={texture.id} />
            <span className="flex min-h-4 items-center gap-1 px-0.5 leading-tight">
              <span className="truncate">{texture.name}</span>
              {texture.tier === 'pro' && <ProBadge />}
            </span>
          </RadioGroupPrimitive.Item>
        ))}
      </RadioGroupPrimitive.Root>

      <div className="grid grid-cols-2 gap-3">
        <SliderField
          label="Scale"
          value={layer.scale}
          min={0.25}
          max={4}
          step={0.05}
          format={(value) => `${value.toFixed(2)}×`}
          mergeKey={`texture-scale:${layer.id}`}
          onChange={(scale, options) => {
            onChange((current) => ({ ...current, scale }), options);
          }}
        />
        <SliderField
          label="Density"
          value={layer.density ?? DEFAULT_TEXTURE_DENSITY}
          min={0}
          max={1}
          step={0.05}
          format={percent}
          disabled={!pattern}
          mergeKey={`texture-density:${layer.id}`}
          onChange={(density, options) => {
            onChange((current) => ({ ...current, density }), options);
          }}
        />
      </div>
      {!pattern && (
        <p className="-mt-2 text-12 text-muted-foreground">
          Photo textures have a fixed density; use opacity to soften them.
        </p>
      )}

      <div className="flex flex-col gap-2">
        <ColorField
          label="Colour"
          value={layer.tint ?? textColor}
          mergeKey={`texture-tint:${layer.id}`}
          onChange={(tint, options) => {
            onChange((current) => ({ ...current, tint }), options);
          }}
        />
        {layer.tint !== undefined && (
          <div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                onChange((current) => {
                  const { tint: _tint, ...rest } = current;
                  return rest;
                });
              }}
            >
              Use the text colour
            </Button>
          </div>
        )}
      </div>
    </>
  );
}
