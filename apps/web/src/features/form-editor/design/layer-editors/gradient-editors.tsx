import { mixHex, type BackgroundLayer, type GradientStop } from '@formyx/shared';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ColorField, SelectField, SliderField } from '../fields';
import type { LayerEditorProps } from './common';

type Solid = Extract<BackgroundLayer, { type: 'solid' }>;
type Linear = Extract<BackgroundLayer, { type: 'linear' }>;
type Radial = Extract<BackgroundLayer, { type: 'radial' }>;

const MAX_STOPS = 6;
const MIN_STOPS = 2;

export function SolidEditor({ layer, onChange }: LayerEditorProps<Solid>) {
  return (
    <ColorField
      label="Colour"
      value={layer.color}
      mergeKey={`solid:${layer.id}`}
      onChange={(color, options) => {
        onChange((current) => ({ ...current, color }), options);
      }}
    />
  );
}

interface StopsEditorProps {
  layerId: string;
  stops: readonly GradientStop[];
  onChange: (
    update: (stops: GradientStop[]) => GradientStop[],
    options?: { mergeKey: string },
  ) => void;
}

/** A gradient's colours and where each one sits along it. */
function StopsEditor({ layerId, stops, onChange }: StopsEditorProps) {
  return (
    <fieldset className="flex flex-col gap-4">
      <legend className="mb-3 text-13 font-medium">Colours</legend>
      {stops.map((stop, index) => (
        // Stops have no ids of their own; their order is what identifies them.
        <div key={index} className="flex flex-col gap-3 rounded-lg border p-3">
          <div className="flex items-end gap-2">
            <ColorField
              className="flex-1"
              label={`Colour ${index + 1}`}
              value={stop.color}
              mergeKey={`stop-color:${layerId}:${index}`}
              onChange={(color, options) => {
                onChange(
                  (current) => current.map((item, i) => (i === index ? { ...item, color } : item)),
                  options,
                );
              }}
            />
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Remove colour ${index + 1}`}
              disabled={stops.length <= MIN_STOPS}
              onClick={() => {
                onChange((current) => current.filter((_, i) => i !== index));
              }}
            >
              <X aria-hidden />
            </Button>
          </div>
          <SliderField
            label="Position"
            value={stop.position}
            min={0}
            max={100}
            format={(value) => `${value}%`}
            mergeKey={`stop-position:${layerId}:${index}`}
            onChange={(position, options) => {
              onChange(
                // Not re-sorted while dragging, so the slider keeps hold of its stop. CSS
                // draws a stop placed before the previous one at the previous one's position.
                (current) => current.map((item, i) => (i === index ? { ...item, position } : item)),
                options,
              );
            }}
          />
        </div>
      ))}
      <div>
        <Button
          variant="secondary"
          size="sm"
          disabled={stops.length >= MAX_STOPS}
          onClick={() => {
            onChange((current) => {
              // Halfway between the two stops furthest apart.
              let gap = 0;
              let widest = -1;
              for (let i = 0; i < current.length - 1; i += 1) {
                const span = (current[i + 1]?.position ?? 0) - (current[i]?.position ?? 0);
                if (span > widest) {
                  widest = span;
                  gap = i;
                }
              }
              const from = current[gap];
              const to = current[gap + 1];
              if (!from || !to) return current;
              const added = {
                color: mixHex(from.color, to.color, 50),
                position: Math.round((from.position + to.position) / 2),
              };
              return [...current.slice(0, gap + 1), added, ...current.slice(gap + 1)];
            });
          }}
        >
          <Plus aria-hidden />
          Add colour
        </Button>
      </div>
    </fieldset>
  );
}

export function LinearEditor({ layer, onChange }: LayerEditorProps<Linear>) {
  return (
    <>
      <SliderField
        label="Angle"
        value={layer.angle}
        min={0}
        max={360}
        format={(value) => `${value}°`}
        mergeKey={`angle:${layer.id}`}
        onChange={(angle, options) => {
          onChange((current) => ({ ...current, angle }), options);
        }}
      />
      <StopsEditor
        layerId={layer.id}
        stops={layer.stops}
        onChange={(update, options) => {
          onChange((current) => ({ ...current, stops: update(current.stops) }), options);
        }}
      />
    </>
  );
}

const SHAPE_OPTIONS = [
  { value: 'ellipse', label: 'Ellipse' },
  { value: 'circle', label: 'Circle' },
] as const;

export function RadialEditor({ layer, onChange }: LayerEditorProps<Radial>) {
  return (
    <>
      <SelectField
        label="Shape"
        value={layer.shape}
        options={SHAPE_OPTIONS}
        onChange={(shape) => {
          onChange((current) => ({ ...current, shape }));
        }}
      />
      <div className="grid grid-cols-2 gap-3">
        <SliderField
          label="Centre across"
          value={layer.center.x}
          min={0}
          max={100}
          format={(value) => `${value}%`}
          mergeKey={`center:${layer.id}`}
          onChange={(x, options) => {
            onChange((current) => ({ ...current, center: { ...current.center, x } }), options);
          }}
        />
        <SliderField
          label="Centre down"
          value={layer.center.y}
          min={0}
          max={100}
          format={(value) => `${value}%`}
          mergeKey={`center:${layer.id}`}
          onChange={(y, options) => {
            onChange((current) => ({ ...current, center: { ...current.center, y } }), options);
          }}
        />
      </div>
      <StopsEditor
        layerId={layer.id}
        stops={layer.stops}
        onChange={(update, options) => {
          onChange((current) => ({ ...current, stops: update(current.stops) }), options);
        }}
      />
    </>
  );
}
