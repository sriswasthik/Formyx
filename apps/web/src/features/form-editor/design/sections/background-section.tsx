import { MAX_LAYERS, randomSeed, type BackgroundLayerType } from '@formyx/shared';
import { Plus, X } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ProBadge } from '@/features/entitlements/pro-badge';
import { useEditorStore } from '../../editor-store-context';
import { ColorField, SliderField } from '../fields';
import { percent } from '../format';
import { LayerEditor } from '../layer-editors/layer-editor';
import {
  addLayer,
  canAddLayer,
  duplicateLayer,
  LAYER_TYPE_LABELS,
  moveLayer,
  newImageLayer,
  newLayer,
  removeLayer,
  toggleLayerHidden,
} from '../layer-edits';
import { LAYER_ICONS, LayerList } from '../layer-list';
import { StudioGroup } from '../studio-group';
import { editedLayer, useStudio } from '../studio-state';
import { ThemeImageField } from '../theme-image-field';

const ADDABLE: readonly BackgroundLayerType[] = [
  'solid',
  'linear',
  'radial',
  'mesh',
  'texture',
  'shapes',
  'image',
];

/** Layer kinds that use a Pro feature as they start. */
const PRO_KINDS = new Set<BackgroundLayerType>(['mesh']);

/** The background's layers and the overlay that keeps text readable over them. */
export function BackgroundSection() {
  const theme = useEditorStore((state) => state.theme);
  const updateTheme = useEditorStore((state) => state.updateTheme);
  const layerId = useStudio((state) => state.layerId);
  const selectLayer = useStudio((state) => state.selectLayer);
  const [addingImage, setAddingImage] = useState(false);
  const { layers } = theme.background;
  const selected = editedLayer(layers, layerId);
  const room = canAddLayer(theme);

  return (
    <>
      <StudioGroup
        title="Layers"
        action={
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary" size="sm" disabled={!room}>
                <Plus aria-hidden />
                Add layer
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {ADDABLE.map((type) => {
                const Icon = LAYER_ICONS[type];
                return (
                  <DropdownMenuItem
                    key={type}
                    onSelect={() => {
                      if (type === 'image') {
                        setAddingImage(true);
                        return;
                      }
                      const layer = newLayer(theme, type, randomSeed());
                      updateTheme((current) => addLayer(current, layer));
                      selectLayer(layer.id);
                    }}
                  >
                    <Icon aria-hidden />
                    {LAYER_TYPE_LABELS[type]}
                    {PRO_KINDS.has(type) && <ProBadge className="ml-auto" />}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        }
      >
        <LayerList
          layers={layers}
          selectedId={selected?.id ?? null}
          canDuplicate={room}
          onSelect={selectLayer}
          onMove={(id, toIndex) => {
            updateTheme((current) => moveLayer(current, id, toIndex));
          }}
          onToggleHidden={(id) => {
            updateTheme((current) => toggleLayerHidden(current, id));
          }}
          onDuplicate={(id) => {
            const { theme: next, id: copyId } = duplicateLayer(theme, id);
            updateTheme(() => next);
            selectLayer(copyId);
          }}
          onRemove={(id) => {
            updateTheme((current) => removeLayer(current, id));
            if (id === selected?.id) selectLayer(null);
          }}
        />
        {!room && (
          <p className="text-12 text-muted-foreground">
            A background holds up to {MAX_LAYERS} layers.
          </p>
        )}
        {addingImage && (
          <div className="flex flex-col gap-3 rounded-lg border p-3">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-13 font-medium">New image layer</h4>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Cancel the image layer"
                onClick={() => {
                  setAddingImage(false);
                }}
              >
                <X aria-hidden />
              </Button>
            </div>
            <ThemeImageField
              kind="background"
              url={undefined}
              onChange={(url) => {
                if (!url) return;
                const layer = newImageLayer(theme, url);
                updateTheme((current) => addLayer(current, layer));
                selectLayer(layer.id);
                setAddingImage(false);
              }}
            />
          </div>
        )}
      </StudioGroup>

      {selected && (
        <StudioGroup title={LAYER_TYPE_LABELS[selected.type]} key={selected.id}>
          <LayerEditor layer={selected} />
        </StudioGroup>
      )}

      <StudioGroup
        title="Overlay"
        description="A wash over the whole background, so text reads over busy layers."
      >
        <ColorField
          label="Colour"
          value={theme.overlay.color}
          mergeKey="overlay-color"
          onChange={(color, options) => {
            updateTheme(
              (current) => ({ ...current, overlay: { ...current.overlay, color } }),
              options,
            );
          }}
        />
        <div className="grid grid-cols-2 gap-3">
          <SliderField
            label="Opacity"
            value={theme.overlay.opacity}
            min={0}
            max={1}
            step={0.01}
            format={percent}
            mergeKey="overlay-opacity"
            onChange={(opacity, options) => {
              updateTheme(
                (current) => ({ ...current, overlay: { ...current.overlay, opacity } }),
                options,
              );
            }}
          />
          <SliderField
            label="Blur"
            value={theme.overlay.blur}
            min={0}
            max={24}
            format={(value) => `${value}px`}
            mergeKey="overlay-blur"
            onChange={(blur, options) => {
              updateTheme(
                (current) => ({ ...current, overlay: { ...current.overlay, blur } }),
                options,
              );
            }}
          />
        </div>
      </StudioGroup>
    </>
  );
}
