import { Monitor, RotateCcw, Smartphone } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { previewUpload } from '@/features/form-renderer/file-uploads';
import { FormView } from '@/features/form-renderer/form-view';
import { cn } from '@/lib/utils';
import { useEditorStore } from '../editor-store-context';
import { PreviewHandles } from './preview-handles';
import { useStudio } from './studio-state';

/** A phone's width in CSS pixels, for the mobile preview. */
export const PHONE_WIDTH = 390;

interface StudioPreviewProps {
  className?: string;
  /** Shorter toolbar copy, for narrow screens. */
  compact?: boolean;
}

/**
 * The form as respondents get it, drawn by the same ThemeRenderer, updating with every change.
 * Desktop or phone width, with drag handles for the background layer being edited.
 */
export function StudioPreview({ className, compact = false }: StudioPreviewProps) {
  const title = useEditorStore((state) => state.title);
  const schema = useEditorStore((state) => state.schema);
  const theme = useEditorStore((state) => state.theme);
  const device = useStudio((state) => state.device);
  const setDevice = useStudio((state) => state.setDevice);
  const section = useStudio((state) => state.section);
  const frameRef = useRef<HTMLDivElement>(null);
  const [run, setRun] = useState(0);
  const mobile = device === 'mobile';

  // Drift would move the background away from its handles, so it pauses while it is edited.
  const paused = section === 'background' && theme.motion.animatedBackground;
  const shown = useMemo(
    () => (paused ? { ...theme, motion: { ...theme.motion, animatedBackground: false } } : theme),
    [paused, theme],
  );

  return (
    <div className={cn('flex min-h-0 flex-col bg-surface', className)}>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b bg-background px-4 py-2">
        <ToggleGroup
          type="single"
          aria-label="Preview size"
          value={device}
          onValueChange={(value) => {
            if (value === 'desktop' || value === 'mobile') setDevice(value);
          }}
        >
          <ToggleGroupItem value="desktop" aria-label="Desktop">
            <Monitor aria-hidden />
            {!compact && 'Desktop'}
          </ToggleGroupItem>
          <ToggleGroupItem value="mobile" aria-label="Phone">
            <Smartphone aria-hidden />
            {!compact && 'Phone'}
          </ToggleGroupItem>
        </ToggleGroup>
        <div className="flex items-center gap-2 text-12 text-muted-foreground">
          {paused && <span>Drift paused while you edit the background.</span>}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setRun((current) => current + 1);
            }}
          >
            <RotateCcw aria-hidden />
            Restart
          </Button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div
          className={cn(
            'mx-auto',
            mobile
              ? 'my-6 overflow-hidden rounded-[20px] border border-border-strong'
              : 'h-full min-h-full w-full',
          )}
          style={mobile ? { width: PHONE_WIDTH, maxWidth: 'calc(100% - 2rem)' } : undefined}
        >
          <div ref={frameRef} className="relative flex min-h-full flex-col" data-studio-frame>
            {/* A new key starts a fresh, empty response. Answers are never saved. */}
            <FormView
              key={run}
              title={title || 'Untitled form'}
              schema={schema}
              theme={shown}
              titleAs="h2"
              variant="frame"
              uploadFile={previewUpload}
              className={cn('flex-1', mobile && 'min-h-[640px]')}
            />
            <PreviewHandles theme={shown} container={frameRef} mobile={mobile} />
          </div>
        </div>
      </div>
    </div>
  );
}
