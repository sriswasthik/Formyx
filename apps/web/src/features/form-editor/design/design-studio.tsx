import { FEATURES, requiredFeatures, type FormTheme } from '@formyx/shared';
import {
  Droplet,
  Layers,
  LayoutTemplate,
  Maximize2,
  Minimize2,
  PanelsTopLeft,
  RectangleHorizontal,
  Type,
  type LucideIcon,
} from 'lucide-react';
import { Tabs as TabsPrimitive } from 'radix-ui';
import { Fragment, useDeferredValue } from 'react';
import type * as React from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useEditorEntitlements } from '../editor-entitlements';
import { useEditorStore } from '../editor-store-context';
import { ReadabilityCallout } from './readability-callout';
import { BackgroundSection } from './sections/background-section';
import { ColorsSection } from './sections/colors-section';
import { ComponentsSection } from './sections/components-section';
import { LayoutSection } from './sections/layout-section';
import { PresetsSection } from './sections/presets-section';
import { TypographySection } from './sections/typography-section';
import { STUDIO_SECTIONS, useStudio, type StudioSection } from './studio-state';

const SECTIONS: Record<
  StudioSection,
  { label: string; icon: LucideIcon; content: () => React.ReactNode }
> = {
  presets: { label: 'Presets', icon: LayoutTemplate, content: () => <PresetsSection /> },
  background: { label: 'Background', icon: Layers, content: () => <BackgroundSection /> },
  colors: { label: 'Colours', icon: Droplet, content: () => <ColorsSection /> },
  typography: { label: 'Typography', icon: Type, content: () => <TypographySection /> },
  components: {
    label: 'Components',
    icon: RectangleHorizontal,
    content: () => <ComponentsSection />,
  },
  layout: { label: 'Layout', icon: PanelsTopLeft, content: () => <LayoutSection /> },
};

/** Says how Pro styles stand for this workspace: free in the beta, or what publishing needs. */
function PlanNote({ theme }: { theme: FormTheme }) {
  const { entitlements, enforced, missing } = useEditorEntitlements();
  if (!entitlements) return null;
  if (!enforced) {
    return (
      <p className="text-12 text-muted-foreground">
        Styles marked Pro are included free during the beta.
      </p>
    );
  }
  const locked = missing(requiredFeatures(theme));
  if (locked.length === 0) return null;
  return (
    <p role="status" className="text-12 text-warning-text">
      Uses Pro styles ({locked.map((featureId) => FEATURES[featureId].name).join(', ')}). Try them
      here; publishing them needs a Pro plan.
    </p>
  );
}

/**
 * `panel`: beside the preview, sections in a rail of icons. `stacked`: under the preview on
 * phones and tablets, sections in a row of tabs.
 */
export type StudioLayout = 'panel' | 'stacked';

interface DesignStudioProps {
  layout: StudioLayout;
  /** Offers full screen, where there is room for it. */
  canExpand?: boolean;
}

/**
 * The Design Studio's controls: how the form looks to respondents. Changes show in the
 * preview at once; respondents see them once they are published.
 */
export function DesignStudio({ layout, canExpand = false }: DesignStudioProps) {
  const theme = useEditorStore((state) => state.theme);
  // The readability check runs a little behind fast edits such as drags.
  const checkedTheme = useDeferredValue(theme);
  const section = useStudio((state) => state.section);
  const setSection = useStudio((state) => state.setSection);
  const fullScreen = useStudio((state) => state.fullScreen);
  const setFullScreen = useStudio((state) => state.setFullScreen);
  const stacked = layout === 'stacked';

  return (
    <div className="@container flex h-full min-h-0 flex-col bg-background">
      <header className="flex flex-col gap-3 border-b px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h2 className="text-14 font-medium">Design</h2>
            <p className="text-12 text-muted-foreground">
              Respondents see changes once you publish them.
            </p>
          </div>
          {canExpand && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={fullScreen ? 'Exit full screen' : 'Full screen'}
                  onClick={() => {
                    setFullScreen(!fullScreen);
                  }}
                >
                  {fullScreen ? <Minimize2 aria-hidden /> : <Maximize2 aria-hidden />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{fullScreen ? 'Exit full screen' : 'Full screen'}</TooltipContent>
            </Tooltip>
          )}
        </div>
        <PlanNote theme={theme} />
        <ReadabilityCallout theme={checkedTheme} />
      </header>

      <TabsPrimitive.Root
        value={section}
        onValueChange={(value) => {
          const next = STUDIO_SECTIONS.find((candidate) => candidate === value);
          if (next) setSection(next);
        }}
        orientation={stacked ? 'horizontal' : 'vertical'}
        className={cn('flex min-h-0 flex-1', stacked ? 'flex-col' : 'flex-row')}
      >
        <TabsPrimitive.List
          aria-label="Design sections"
          className={cn(
            'flex shrink-0 gap-1 bg-background',
            stacked
              ? 'overflow-x-auto border-b px-3 py-2'
              : 'w-13 flex-col items-center border-r py-3',
          )}
        >
          {STUDIO_SECTIONS.map((id) => {
            const { label, icon: Icon } = SECTIONS[id];
            const trigger = (
              <TabsPrimitive.Trigger
                value={id}
                className={cn(
                  'flex shrink-0 items-center justify-center gap-1.5 rounded-lg text-13 font-medium text-muted-foreground',
                  'transition-colors duration-150 ease-standard',
                  'hover:bg-hover hover:text-foreground active:bg-pressed',
                  'data-[state=active]:bg-pressed data-[state=active]:text-foreground',
                  stacked ? 'h-8 px-2.5' : 'size-9',
                )}
              >
                <Icon aria-hidden />
                <span className={cn(!stacked && 'sr-only')}>{label}</span>
              </TabsPrimitive.Trigger>
            );
            return stacked ? (
              <Fragment key={id}>{trigger}</Fragment>
            ) : (
              <Tooltip key={id}>
                <TooltipTrigger asChild>{trigger}</TooltipTrigger>
                <TooltipContent side="right">{label}</TooltipContent>
              </Tooltip>
            );
          })}
        </TabsPrimitive.List>
        {STUDIO_SECTIONS.map((id) => (
          <TabsPrimitive.Content
            key={id}
            value={id}
            className="min-h-0 min-w-0 flex-1 overflow-y-auto"
          >
            {SECTIONS[id].content()}
          </TabsPrimitive.Content>
        ))}
      </TabsPrimitive.Root>
    </div>
  );
}
