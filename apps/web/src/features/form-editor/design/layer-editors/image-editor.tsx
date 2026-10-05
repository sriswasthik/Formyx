import type { BackgroundLayer } from '@formyx/shared';
import { useEditorStore } from '../../editor-store-context';
import { SelectField, SliderField } from '../fields';
import { removeLayer } from '../layer-edits';
import { useStudio } from '../studio-state';
import { ThemeImageField } from '../theme-image-field';
import type { LayerEditorProps } from './common';

type ImageLayer = Extract<BackgroundLayer, { type: 'image' }>;

const FIT_OPTIONS = [
  { value: 'cover', label: 'Fill the page (crop)' },
  { value: 'contain', label: 'Show it all' },
] as const;

/** An uploaded image: replace it, choose how it fits and which part stays in view. */
export function ImageEditor({ layer, onChange }: LayerEditorProps<ImageLayer>) {
  const updateTheme = useEditorStore((state) => state.updateTheme);
  const selectLayer = useStudio((state) => state.selectLayer);

  return (
    <>
      <ThemeImageField
        kind="background"
        url={layer.url}
        onChange={(url) => {
          if (url) {
            onChange((current) => ({ ...current, url }));
          } else {
            updateTheme((current) => removeLayer(current, layer.id));
            selectLayer(null);
          }
        }}
      />
      <SelectField
        label="Fit"
        value={layer.fit}
        options={FIT_OPTIONS}
        onChange={(fit) => {
          onChange((current) => ({ ...current, fit }));
        }}
      />
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-13 font-medium">Focal point</legend>
        <p className="text-12 text-muted-foreground">
          The part kept in view when the image is cropped. Drag the crosshair on the preview, or set
          it here.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <SliderField
            label="Across"
            value={layer.focalPoint.x}
            min={0}
            max={100}
            format={(value) => `${value}%`}
            mergeKey={`focal:${layer.id}`}
            onChange={(x, options) => {
              onChange(
                (current) => ({ ...current, focalPoint: { ...current.focalPoint, x } }),
                options,
              );
            }}
          />
          <SliderField
            label="Down"
            value={layer.focalPoint.y}
            min={0}
            max={100}
            format={(value) => `${value}%`}
            mergeKey={`focal:${layer.id}`}
            onChange={(y, options) => {
              onChange(
                (current) => ({ ...current, focalPoint: { ...current.focalPoint, y } }),
                options,
              );
            }}
          />
        </div>
      </fieldset>
    </>
  );
}
