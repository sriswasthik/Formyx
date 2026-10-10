import type { FormTheme, ThemeLayout } from '@formyx/shared';
import { ProBadge } from '@/features/entitlements/pro-badge';
import { cn } from '@/lib/utils';
import { useEditorStore } from '../../editor-store-context';
import { SelectField, SwitchField } from '../fields';
import { OptionCards } from '../option-cards';
import { StudioGroup } from '../studio-group';
import { ThemeImageField } from '../theme-image-field';

const frame = 'relative block h-7 w-11 overflow-hidden rounded-[4px] border border-foreground/40';
const bar = 'block rounded-[1px] bg-foreground/50';

const MODE_OPTIONS = [
  {
    value: 'classic',
    label: 'Classic',
    preview: (
      <span className={cn(frame, 'flex flex-col gap-0.5 p-1')}>
        <span className={cn(bar, 'h-0.5 w-5')} />
        <span className={cn(bar, 'h-0.5 w-7')} />
        <span className={cn(bar, 'h-0.5 w-6')} />
        <span className={cn(bar, 'h-0.5 w-7')} />
      </span>
    ),
  },
  {
    value: 'card',
    label: 'Card',
    preview: (
      <span className={cn(frame, 'flex items-center justify-center bg-foreground/10')}>
        <span className="block h-4 w-6 rounded-[2px] border border-foreground/50 bg-background" />
      </span>
    ),
  },
  {
    value: 'split',
    label: 'Split screen',
    preview: (
      <span className={cn(frame, 'flex')}>
        <span className="block h-full w-1/2 bg-foreground/25" />
        <span className="flex flex-1 flex-col justify-center gap-0.5 p-1">
          <span className={cn(bar, 'h-0.5 w-3')} />
          <span className={cn(bar, 'h-0.5 w-4')} />
        </span>
      </span>
    ),
  },
  {
    value: 'conversational',
    label: 'One at a time',
    badge: <ProBadge />,
    preview: (
      <span className={cn(frame, 'flex flex-col items-center justify-center gap-1')}>
        <span className={cn(bar, 'h-0.5 w-6')} />
        <span className="block h-1.5 w-4 rounded-[1px] bg-foreground/60" />
      </span>
    ),
  },
] as const;

const WIDTH_OPTIONS = [
  { value: 'narrow', label: 'Narrow', preview: <WidthPicture width="w-4" /> },
  { value: 'regular', label: 'Regular', preview: <WidthPicture width="w-6" /> },
  { value: 'wide', label: 'Wide', preview: <WidthPicture width="w-8" /> },
] as const;

function WidthPicture({ width }: { width: string }) {
  return (
    <span className={cn(frame, 'flex justify-center p-1')}>
      <span className={cn('block h-full rounded-[1px] bg-foreground/30', width)} />
    </span>
  );
}

const POSITION_OPTIONS = [
  { value: 'start', label: 'Left', preview: <PositionPicture justify="justify-start" /> },
  { value: 'center', label: 'Centre', preview: <PositionPicture justify="justify-center" /> },
  { value: 'end', label: 'Right', preview: <PositionPicture justify="justify-end" /> },
] as const;

function PositionPicture({ justify }: { justify: string }) {
  return (
    <span className={cn(frame, 'flex p-1', justify)}>
      <span className="block h-full w-4 rounded-[1px] bg-foreground/30" />
    </span>
  );
}

/** In the split layout, `start` puts the form on the left (see ThemeRenderer). */
const SIDE_OPTIONS = [
  { value: 'start', label: 'Form left', preview: <SidePicture formFirst /> },
  { value: 'end', label: 'Form right', preview: <SidePicture formFirst={false} /> },
] as const;

function SidePicture({ formFirst }: { formFirst: boolean }) {
  return (
    <span className={cn(frame, 'flex', !formFirst && 'flex-row-reverse')}>
      <span className="flex flex-1 flex-col justify-center gap-0.5 p-1">
        <span className={cn(bar, 'h-0.5 w-3')} />
        <span className={cn(bar, 'h-0.5 w-4')} />
      </span>
      <span className="block h-full w-1/2 bg-foreground/25" />
    </span>
  );
}

const TRANSITION_OPTIONS = [
  { value: 'none', label: 'None', preview: <span className="text-13">—</span> },
  {
    value: 'fade',
    label: 'Fade',
    preview: <span className="block size-4 rounded-sm bg-foreground/30" />,
  },
  {
    value: 'slide',
    label: 'Slide',
    preview: (
      <span className="flex flex-col items-center gap-0.5">
        <span className="block size-3 rounded-sm bg-foreground/50" />
        <span className="block h-0.5 w-3 rounded-full bg-foreground/20" />
      </span>
    ),
  },
] as const;

const PROGRESS_OPTIONS = [
  { value: 'none', label: 'None', preview: <span className="text-13">—</span> },
  {
    value: 'line',
    label: 'Line',
    preview: (
      <span className="block h-1 w-10 rounded-full bg-foreground/15">
        <span className="block h-full w-1/2 rounded-full bg-foreground/60" />
      </span>
    ),
  },
  {
    value: 'steps',
    label: 'Steps',
    preview: (
      <span className="flex w-10 gap-0.5">
        {[true, true, false, false].map((done, index) => (
          <span
            key={index}
            className={cn(
              'block h-1 flex-1 rounded-full',
              done ? 'bg-foreground/60' : 'bg-foreground/15',
            )}
          />
        ))}
      </span>
    ),
  },
  {
    value: 'percentage',
    label: 'Percent',
    preview: <span className="text-13 tabular-nums">40%</span>,
  },
] as const;

const PROGRESS_POSITION_OPTIONS = [
  { value: 'top', label: 'Top', preview: <EdgePicture top /> },
  { value: 'bottom', label: 'Bottom', preview: <EdgePicture top={false} /> },
] as const;

function EdgePicture({ top }: { top: boolean }) {
  return (
    <span className={cn(frame, 'flex flex-col p-0.5', top ? 'justify-start' : 'justify-end')}>
      <span className="block h-0.5 w-full rounded-full bg-foreground/60" />
    </span>
  );
}

const LOGO_POSITIONS = [
  { value: 'above_title', label: 'Above the title' },
  { value: 'top_left', label: 'Top left of the page' },
  { value: 'top_center', label: 'Top centre of the page' },
] as const;

/** The layout, its progress bar and motion, the logo, the cover image and "Made with Formyx". */
export function LayoutSection() {
  const theme = useEditorStore((state) => state.theme);
  const updateTheme = useEditorStore((state) => state.updateTheme);
  const setLayout = (patch: Partial<ThemeLayout>) => {
    updateTheme((current) => ({ ...current, layout: { ...current.layout, ...patch } }));
  };
  const setMotion = (patch: Partial<FormTheme['motion']>) => {
    updateTheme((current) => ({ ...current, motion: { ...current.motion, ...patch } }));
  };
  const { layout } = theme;
  const split = layout.mode === 'split';

  return (
    <>
      <StudioGroup title="Layout">
        <OptionCards
          label="Layout"
          value={layout.mode}
          options={MODE_OPTIONS}
          onChange={(mode) => {
            setLayout({ mode });
          }}
        />
        <OptionCards
          label="Form width"
          showLabel
          value={layout.width}
          options={WIDTH_OPTIONS}
          onChange={(width) => {
            setLayout({ width });
          }}
        />
        {split ? (
          <OptionCards
            label="Sides"
            showLabel
            value={layout.alignment === 'start' ? 'start' : 'end'}
            options={SIDE_OPTIONS}
            onChange={(alignment) => {
              setLayout({ alignment });
            }}
          />
        ) : (
          <OptionCards
            label="Position on wide screens"
            showLabel
            value={layout.alignment}
            options={POSITION_OPTIONS}
            onChange={(alignment) => {
              setLayout({ alignment });
            }}
          />
        )}
        {split && (
          <p className="text-12 text-muted-foreground">
            The other side shows the cover image if there is one, or the background. On phones it
            sits above the form.
          </p>
        )}
      </StudioGroup>
      <StudioGroup title="Progress" description="How far along respondents are.">
        <OptionCards
          label="Progress bar"
          value={layout.progress.style}
          options={PROGRESS_OPTIONS}
          columns={4}
          onChange={(style) => {
            setLayout({ progress: { ...layout.progress, style } });
          }}
        />
        {layout.progress.style !== 'none' && (
          <OptionCards
            label="Progress bar position"
            showLabel
            value={layout.progress.position}
            options={PROGRESS_POSITION_OPTIONS}
            onChange={(position) => {
              setLayout({ progress: { ...layout.progress, position } });
            }}
          />
        )}
      </StudioGroup>
      <StudioGroup
        title="Motion"
        description="Always off for people who ask their device for less motion."
      >
        <OptionCards
          label={layout.mode === 'conversational' ? 'Between questions' : 'Thank-you message'}
          showLabel
          value={theme.motion.pageTransition}
          options={TRANSITION_OPTIONS}
          onChange={(pageTransition) => {
            setMotion({ pageTransition });
          }}
        />
        {layout.mode === 'conversational' && (
          <SwitchField
            label="Move on after a single choice"
            description="Single choices, ratings and dropdowns continue once picked."
            checked={layout.autoAdvance}
            onChange={(autoAdvance) => {
              setLayout({ autoAdvance });
            }}
          />
        )}
      </StudioGroup>
      <StudioGroup title="Logo">
        <ThemeImageField
          kind="logo"
          url={theme.branding.logoUrl}
          onChange={(logoUrl) => {
            updateTheme((current) => {
              const { logoUrl: _previous, ...branding } = current.branding;
              return { ...current, branding: logoUrl ? { ...branding, logoUrl } : branding };
            });
          }}
        />
        {theme.branding.logoUrl && (
          <SelectField
            label="Logo position"
            value={layout.logoPosition}
            options={LOGO_POSITIONS}
            onChange={(logoPosition) => {
              setLayout({ logoPosition });
            }}
          />
        )}
      </StudioGroup>
      <StudioGroup title="Cover image">
        <ThemeImageField
          kind="cover"
          url={layout.coverImage?.url}
          onChange={(url) => {
            updateTheme((current) => {
              const { coverImage: _previous, ...rest } = current.layout;
              return {
                ...current,
                layout: url ? { ...rest, coverImage: { url, focalPoint: { x: 50, y: 50 } } } : rest,
              };
            });
          }}
        />
      </StudioGroup>
      <StudioGroup title="Branding">
        <SwitchField
          label="Show “Made with Formyx”"
          description={
            <>
              <ProBadge /> Hiding it is a Pro feature.
            </>
          }
          checked={theme.branding.showFormyxBadge}
          onChange={(showFormyxBadge) => {
            updateTheme((current) => ({
              ...current,
              branding: { ...current.branding, showFormyxBadge },
            }));
          }}
        />
      </StudioGroup>
    </>
  );
}
