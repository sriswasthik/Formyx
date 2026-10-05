import { type BackgroundLayer, type FormTheme, type ThemePoint } from '@formyx/shared';
import { useLayoutEffect, useRef, useState } from 'react';
import type * as React from 'react';
import { cn } from '@/lib/utils';
import { useEditorStore } from '../editor-store-context';
import { updateLayer } from './layer-edits';
import { editedLayer, useStudio } from './studio-state';

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Where the theme's background sits inside `wrapper`, kept up to date as either resizes. */
function useBackgroundBox(wrapper: React.RefObject<HTMLElement | null>): Box | null {
  const [box, setBox] = useState<Box | null>(null);
  useLayoutEffect(() => {
    const root = wrapper.current;
    if (!root) return;
    const measure = () => {
      const background = root.querySelector('[data-theme-background]');
      if (!background) {
        setBox(null);
        return;
      }
      const outer = root.getBoundingClientRect();
      const inner = background.getBoundingClientRect();
      setBox((previous) => {
        const next = {
          left: inner.left - outer.left,
          top: inner.top - outer.top,
          width: inner.width,
          height: inner.height,
        };
        const same =
          previous?.left === next.left &&
          previous.top === next.top &&
          previous.width === next.width &&
          previous.height === next.height;
        return same ? previous : next;
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    const background = root.querySelector('[data-theme-background]');
    if (background) observer.observe(background);
    return () => {
      observer.disconnect();
    };
  });
  return box;
}

const clampPercent = (value: number) => Math.round(Math.min(100, Math.max(0, value)) * 10) / 10;

interface HandleProps {
  label: string;
  at: ThemePoint;
  box: Box;
  selected: boolean;
  /** Fills the handle, for colour points. */
  color?: string;
  variant?: 'dot' | 'crosshair';
  onSelect: () => void;
  onMove: (to: ThemePoint) => void;
}

/**
 * A point on the preview to drag with a pointer, or move with the arrow keys (Shift for
 * bigger steps). Positions are percentages of the background.
 */
function Handle({
  label,
  at,
  box,
  selected,
  color,
  variant = 'dot',
  onSelect,
  onMove,
}: HandleProps) {
  const dragging = useRef(false);
  const toPercent = (event: React.PointerEvent<HTMLButtonElement>) => {
    const parent = event.currentTarget.parentElement?.getBoundingClientRect();
    if (!parent) return at;
    return {
      x: clampPercent(((event.clientX - parent.left) / parent.width) * 100),
      y: clampPercent(((event.clientY - parent.top) / parent.height) * 100),
    };
  };

  return (
    <button
      type="button"
      aria-label={`${label}, ${Math.round(at.x)}% across, ${Math.round(at.y)}% down`}
      aria-pressed={selected}
      className={cn(
        'pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none rounded-full active:cursor-grabbing',
        'transition-[width,height,box-shadow] duration-150 ease-standard',
        variant === 'dot'
          ? cn(
              'border-2 border-white shadow-[0_0_0_1px_rgb(0_0_0/0.45),0_1px_3px_rgb(0_0_0/0.3)]',
              selected ? 'size-5 ring-2 ring-accent ring-offset-1' : 'size-4',
            )
          : 'flex size-7 items-center justify-center border-2 border-white bg-black/30 shadow-[0_0_0_1px_rgb(0_0_0/0.45)]',
      )}
      style={{
        left: `${(at.x / 100) * box.width}px`,
        top: `${(at.y / 100) * box.height}px`,
        ...(color && { backgroundColor: color }),
      }}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        dragging.current = true;
        onSelect();
      }}
      onPointerMove={(event) => {
        if (dragging.current) onMove(toPercent(event));
      }}
      onPointerUp={(event) => {
        dragging.current = false;
        event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onPointerCancel={() => {
        dragging.current = false;
      }}
      onFocus={onSelect}
      onKeyDown={(event) => {
        const step = event.shiftKey ? 5 : 1;
        const moves: Record<string, ThemePoint> = {
          ArrowLeft: { x: at.x - step, y: at.y },
          ArrowRight: { x: at.x + step, y: at.y },
          ArrowUp: { x: at.x, y: at.y - step },
          ArrowDown: { x: at.x, y: at.y + step },
        };
        const to = moves[event.key];
        if (!to) return;
        event.preventDefault();
        onMove({ x: clampPercent(to.x), y: clampPercent(to.y) });
      }}
    >
      {variant === 'crosshair' && (
        <span aria-hidden className="relative block size-3">
          <span className="absolute top-1/2 left-0 h-px w-full -translate-y-1/2 bg-white" />
          <span className="absolute top-0 left-1/2 h-full w-px -translate-x-1/2 bg-white" />
        </span>
      )}
    </button>
  );
}

interface LayerHandlesProps {
  layer: BackgroundLayer;
  box: Box;
  mobile: boolean;
}

/** Handles for the parts of a layer that have a place: colour points, shapes, centres. */
function LayerHandles({ layer, box, mobile }: LayerHandlesProps) {
  const updateTheme = useEditorStore((state) => state.updateTheme);
  const itemId = useStudio((state) => state.itemId);
  const selectItem = useStudio((state) => state.selectItem);
  const change = (key: string, update: (layer: BackgroundLayer) => BackgroundLayer) => {
    updateTheme((theme) => updateLayer(theme, layer.id, update), {
      mergeKey: `drag:${layer.id}:${key}`,
    });
  };

  switch (layer.type) {
    case 'mesh':
      return layer.points.map((point, index) => (
        <Handle
          // Points have no ids; their order is what the panel uses too.
          key={index}
          label={`Colour point ${index + 1}`}
          at={point}
          box={box}
          color={point.color}
          selected={String(index) === (itemId ?? '0')}
          onSelect={() => {
            selectItem(String(index));
          }}
          onMove={(to) => {
            change(String(index), (current) =>
              current.type === 'mesh'
                ? {
                    ...current,
                    points: current.points.map((item, i) =>
                      i === index ? { ...item, ...to } : item,
                    ),
                  }
                : current,
            );
          }}
        />
      ));
    case 'shapes':
      if (mobile && layer.hideOnMobile) return null;
      return layer.items.map((item, index) => (
        <Handle
          key={item.id}
          label={`Shape ${index + 1}`}
          at={item}
          box={box}
          selected={item.id === itemId}
          onSelect={() => {
            selectItem(item.id);
          }}
          onMove={(to) => {
            change(item.id, (current) =>
              current.type === 'shapes'
                ? {
                    ...current,
                    items: current.items.map((shape) =>
                      shape.id === item.id ? { ...shape, ...to } : shape,
                    ),
                  }
                : current,
            );
          }}
        />
      ));
    case 'radial':
      return (
        <Handle
          label="Gradient centre"
          at={layer.center}
          box={box}
          variant="crosshair"
          selected
          onSelect={() => undefined}
          onMove={(to) => {
            change('center', (current) =>
              current.type === 'radial' ? { ...current, center: to } : current,
            );
          }}
        />
      );
    case 'image':
      return (
        <Handle
          label="Focal point"
          at={layer.focalPoint}
          box={box}
          variant="crosshair"
          selected
          onSelect={() => undefined}
          onMove={(to) => {
            change('focal', (current) =>
              current.type === 'image' ? { ...current, focalPoint: to } : current,
            );
          }}
        />
      );
    default:
      return null;
  }
}

interface PreviewHandlesProps {
  theme: FormTheme;
  /** The element the themed form is drawn in. */
  container: React.RefObject<HTMLElement | null>;
  mobile: boolean;
}

/**
 * Drag handles over the preview for the layer being edited in the Background section. They
 * sit above the form, and only the handles themselves take the pointer.
 */
export function PreviewHandles({ theme, container, mobile }: PreviewHandlesProps) {
  const section = useStudio((state) => state.section);
  const layerId = useStudio((state) => state.layerId);
  const box = useBackgroundBox(container);
  const layer = editedLayer(theme.background.layers, layerId);
  if (section !== 'background' || !box || !layer || layer.hidden) return null;

  return (
    <div
      role="group"
      aria-label="Background handles"
      className="pointer-events-none absolute z-20"
      style={{ left: box.left, top: box.top, width: box.width, height: box.height }}
    >
      <LayerHandles layer={layer} box={box} mobile={mobile} />
    </div>
  );
}
