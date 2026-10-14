import { FORM_TEMPLATES, THEME_PRESETS, type Field } from '@formyx/shared';
import { ArrowLeft, Check, Eye, Inbox, Pencil, Plug, Send, SlidersHorizontal } from 'lucide-react';
import { m, useReducedMotionConfig } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { FIELD_TYPE_ICONS } from '@/features/form-editor/field-type-meta';
import { FormView } from '@/features/form-renderer/form-view';
import { loadFont } from '@/features/form-renderer/theme/fonts';
import { EASE_STANDARD } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { PresetSwatch } from './preset-swatch';
import { PRODUCT_FRAME_CLASS } from './product-frame-size';
import { useCycle, useOnScreen } from './use-cycle';

/** The looks the hero cycles through: two mesh gradients with texture, a grid and a dark one. */
const HERO_PRESET_IDS = ['sunrise-mesh', 'sea-glass', 'blueprint', 'midnight'] as const;
const HERO_TEMPLATE_ID = 'workshop_signup';
/** How long each look stays, and how long one fades into the next. */
const HERO_INTERVAL_MS = 5000;
const CROSSFADE_S = 0.6;

const HERO_PRESETS = HERO_PRESET_IDS.flatMap((id) =>
  THEME_PRESETS.filter((preset) => preset.id === id),
);

const TABS = [
  { label: 'Edit', icon: Pencil, active: true },
  { label: 'Responses', icon: Inbox },
  { label: 'Integrations', icon: Plug },
  { label: 'Settings', icon: SlidersHorizontal },
];

/** The editor's top bar, as it looks with the form saved. */
function TopBar({ title }: { title: string }) {
  return (
    <div className="flex h-12 shrink-0 items-center gap-3 border-b px-3 text-13">
      <ArrowLeft className="text-muted-foreground" aria-hidden />
      <span className="truncate font-medium">{title}</span>
      <span className="hidden items-center gap-1 text-muted-foreground sm:flex">
        <Check aria-hidden />
        Saved
      </span>
      <div className="mx-auto hidden items-center gap-0.5 rounded-lg border p-0.5 lg:flex">
        {TABS.map(({ label, icon: Icon, active }) => (
          <span
            key={label}
            className={cn(
              'flex h-7 items-center gap-1.5 rounded-md px-2.5',
              active ? 'bg-muted text-foreground' : 'text-muted-foreground',
            )}
          >
            <Icon aria-hidden />
            {label}
          </span>
        ))}
      </div>
      <div className="ml-auto flex items-center gap-2 lg:ml-0">
        <span className="hidden h-8 items-center gap-1.5 rounded-lg border px-3 sm:flex">
          <Eye aria-hidden />
          Preview
        </span>
        <span className="flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 font-medium text-primary-foreground">
          <Send aria-hidden />
          Publish
        </span>
      </div>
    </div>
  );
}

/** The question list down the left, the first one selected. */
function QuestionRail({ fields }: { fields: Field[] }) {
  return (
    <div className="hidden w-56 shrink-0 flex-col gap-1 border-r p-3 text-13 lg:flex">
      <p className="px-2 pb-2 text-12 font-medium text-muted-foreground">Questions</p>
      {fields.map((field, index) => {
        const Icon = FIELD_TYPE_ICONS[field.type];
        return (
          <span
            key={field.id}
            className={cn(
              'flex h-8 items-center gap-2 rounded-md px-2',
              index === 0 ? 'bg-accent-subtle text-foreground' : 'text-muted-foreground',
            )}
          >
            <Icon className="shrink-0" aria-hidden />
            <span className="truncate">{field.label}</span>
          </span>
        );
      })}
    </div>
  );
}

/** The Design tab, with the current look picked. */
function DesignPanel({ active }: { active: string }) {
  return (
    <div className="hidden w-60 shrink-0 flex-col border-l text-13 md:flex">
      <div className="flex h-11 items-center gap-4 border-b px-4">
        <span className="text-muted-foreground">Settings</span>
        <span className="text-muted-foreground">Logic</span>
        <span className="relative font-medium after:absolute after:inset-x-0 after:-bottom-3 after:h-0.5 after:bg-foreground">
          Design
        </span>
      </div>
      <div className="flex flex-col gap-3 p-4">
        <p className="text-12 font-medium text-muted-foreground">Looks</p>
        <div className="grid grid-cols-2 gap-2">
          {HERO_PRESETS.map((preset) => (
            <span
              key={preset.id}
              className={cn(
                'flex flex-col gap-1.5 rounded-lg border p-1.5 transition-colors duration-200 ease-standard',
                preset.id === active && 'border-accent ring-1 ring-accent',
              )}
            >
              <PresetSwatch preset={preset} />
              <span className="truncate px-0.5 text-12">{preset.name}</span>
            </span>
          ))}
        </div>
        <p className="mt-2 text-12 font-medium text-muted-foreground">Typography</p>
        <span className="flex h-8 items-center justify-between rounded-lg border px-2.5">
          Heading
          <span className="text-muted-foreground">Theme</span>
        </span>
        <span className="flex h-8 items-center justify-between rounded-lg border px-2.5">
          Corners
          <span className="text-muted-foreground">Rounded</span>
        </span>
      </div>
    </div>
  );
}

/** The looks on screen: the current one, and the one it is fading in over. */
function useCrossfade(index: number): number[] {
  const [shown, setShown] = useState<{ current: number; previous: number | null }>({
    current: index,
    previous: null,
  });
  // A new look: the old one stays beneath it until the fade is over.
  if (shown.current !== index) setShown({ current: index, previous: shown.current });
  useEffect(() => {
    if (shown.previous === null) return;
    const settled = window.setTimeout(
      () => {
        setShown((state) => ({ ...state, previous: null }));
      },
      CROSSFADE_S * 1000 + 100,
    );
    return () => {
      window.clearTimeout(settled);
    };
  }, [shown]);
  return shown.previous === null ? [shown.current] : [shown.previous, shown.current];
}

/**
 * The editor as a picture: its top bar, questions and Design tab around a real form, drawn by
 * the renderer respondents get, whose look fades to the next preset every few seconds. It holds
 * on the first look with reduced motion, and while off-screen or in a background tab.
 */
export function ProductFrame() {
  const template = FORM_TEMPLATES.find((candidate) => candidate.id === HERO_TEMPLATE_ID);
  const [schema] = useState(() => template?.build());
  // The frame shows the first few questions; drawing the rest would be work nobody sees.
  const [shown] = useState(() => schema && { ...schema, fields: schema.fields.slice(0, 4) });
  const [frame, setFrame] = useState<HTMLDivElement | null>(null);
  const onScreen = useOnScreen(frame);
  const reduce = useReducedMotionConfig() ?? false;
  const index = useCycle({
    count: HERO_PRESETS.length,
    interval: HERO_INTERVAL_MS,
    paused: reduce || !onScreen,
  });
  const layers = useCrossfade(index);
  const canvas = useRef<HTMLDivElement>(null);

  // The canvas is a picture: nothing in it takes focus or clicks.
  useEffect(() => {
    if (canvas.current) canvas.current.inert = true;
  }, []);

  // The next look's fonts, ahead of time, so it fades in already in them.
  useEffect(() => {
    const next = HERO_PRESETS[(index + 1) % HERO_PRESETS.length];
    if (!next || reduce) return;
    void loadFont(next.theme.typography.headingFont);
    void loadFont(next.theme.typography.bodyFont);
  }, [index, reduce]);

  const current = HERO_PRESETS[index];
  if (!template || !schema || !current) return null;

  return (
    <div
      ref={setFrame}
      role="img"
      aria-label={`The Formyx editor, with the ${template.defaultTitle} form in the ${current.name} look`}
      className={PRODUCT_FRAME_CLASS}
    >
      <TopBar title={template.defaultTitle} />
      <div className="flex min-h-0 flex-1" aria-hidden>
        <QuestionRail fields={schema.fields} />
        <div ref={canvas} data-canvas className="relative min-w-0 flex-1 bg-muted p-3 sm:p-6">
          <div className="relative h-full overflow-hidden rounded-xl border">
            {layers.map((layerIndex, position) => {
              const preset = HERO_PRESETS[layerIndex];
              if (!preset) return null;
              return (
                <m.div
                  key={preset.id}
                  className="absolute inset-0 overflow-hidden"
                  initial={position === 0 ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: CROSSFADE_S, ease: EASE_STANDARD }}
                >
                  <FormView
                    title={template.defaultTitle}
                    titleAs="h2"
                    schema={shown ?? schema}
                    theme={preset.theme}
                    variant="frame"
                    className="min-h-full"
                  />
                </m.div>
              );
            })}
          </div>
        </div>
        <DesignPanel active={current.id} />
      </div>
    </div>
  );
}
