import type { FormTheme } from '@formyx/shared';
import { Eye, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { previewUpload } from '@/features/form-renderer/file-uploads';
import { FormView } from '@/features/form-renderer/form-view';
import { useEditorStore } from '../editor-store-context';

/** The form exactly as respondents get it, with working inputs and logic. Nothing is saved. */
export function EditorPreview({ theme }: { theme: FormTheme }) {
  const title = useEditorStore((state) => state.title);
  const schema = useEditorStore((state) => state.schema);
  const [run, setRun] = useState(0);

  return (
    <div className="flex min-h-full flex-col">
      <div className="sticky top-0 z-10 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b bg-background px-4 py-2 text-13 text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Eye aria-hidden />
          This is how respondents see your form. Answers are not saved.
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
      {/* A new key starts a fresh, empty response. */}
      <FormView
        key={run}
        title={title || 'Untitled form'}
        schema={schema}
        theme={theme}
        titleAs="h2"
        uploadFile={previewUpload}
        className="flex-1"
      />
    </div>
  );
}
