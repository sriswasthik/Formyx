import { FORM_TEMPLATES, THEME_PRESETS, type FormTemplateId } from '@formyx/shared';
import { Eye, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { previewUpload } from '@/features/form-renderer/file-uploads';
import { FormView } from '@/features/form-renderer/form-view';
import { cn } from '@/lib/utils';

/** Looks that show the range: gradient, plain, patterned, dark, illustrated, playful. */
const PLAYGROUND_PRESETS = [
  'sunrise-mesh',
  'minimal',
  'blueprint',
  'midnight',
  'botanical',
  'confetti-party',
] as const;

interface LookPlaygroundProps {
  templateId: FormTemplateId;
  presetIds?: readonly string[];
  /** The frame's height; the form scrolls inside it. */
  className?: string;
}

/**
 * A real form, drawn by the same renderer respondents get, in a look the visitor picks. It
 * works (questions, logic, validation) but nothing is sent.
 */
export function LookPlayground({
  templateId,
  presetIds = PLAYGROUND_PRESETS,
  className,
}: LookPlaygroundProps) {
  const template = FORM_TEMPLATES.find((candidate) => candidate.id === templateId);
  // One schema per visit: its ids must stay the same while someone answers it.
  const [schema] = useState(() => template?.build());
  const presets = presetIds.flatMap((id) => THEME_PRESETS.filter((preset) => preset.id === id));
  const [presetId, setPresetId] = useState(presets[0]?.id ?? '');
  const [run, setRun] = useState(0);
  const preset = presets.find((candidate) => candidate.id === presetId) ?? presets[0];
  if (!template || !schema || !preset) return null;

  return (
    <section aria-label="Try Formyx" className="overflow-hidden rounded-xl border bg-background">
      <div className="flex flex-col gap-2 border-b px-3 py-2 md:flex-row md:items-center md:justify-between">
        <ToggleGroup
          type="single"
          aria-label="Look"
          value={preset.id}
          onValueChange={(value) => {
            // Clicking the chosen look again keeps it chosen.
            if (value) setPresetId(value);
          }}
          className="flex h-auto flex-wrap justify-start border-0 p-0"
        >
          {presets.map(({ id, name }) => (
            <ToggleGroupItem key={id} value={id} className="h-8 border">
              {name}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <div className="flex items-center justify-between gap-3 text-13 text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Eye aria-hidden />
            Try it: nothing is sent
          </span>
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
      <div className={cn('flex h-[min(38rem,72dvh)] flex-col overflow-y-auto', className)}>
        {/* A new key starts a fresh, empty response; a new look keeps the answers. */}
        <FormView
          key={run}
          title={template.defaultTitle}
          schema={schema}
          theme={preset.theme}
          titleAs="h2"
          variant="frame"
          uploadFile={previewUpload}
          className="flex-1"
        />
      </div>
    </section>
  );
}
