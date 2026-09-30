import type { FormDetail, FieldType } from '@formyx/shared';
import { useState, type ReactNode } from 'react';
import { FormView } from '@/features/form-renderer/form-view';
import { EditorCanvas } from './canvas/editor-canvas';
import { focusQuestion } from './canvas/focus-question';
import { EditorDnd } from './dnd/editor-dnd';
import { useEditorStore } from './editor-store-context';
import { FieldPalette } from './palette/field-palette';
import { SettingsPanel } from './settings/settings-panel';
import { EditorTopBar, type EditorView } from './top-bar/editor-top-bar';

interface EditorLayoutProps {
  form: FormDetail;
  status: ReactNode;
}

/** Palette, canvas and settings side by side, or the live preview. */
export function EditorLayout({ form, status }: EditorLayoutProps) {
  const [view, setView] = useState<EditorView>('build');
  const addField = useEditorStore((state) => state.addField);
  const title = useEditorStore((state) => state.title);
  const schema = useEditorStore((state) => state.schema);

  const add = (type: FieldType) => {
    focusQuestion(addField(type));
  };

  return (
    <EditorDnd>
      <div className="flex h-dvh flex-col bg-surface">
        <EditorTopBar status={status} view={view} onViewChange={setView} />

        {view === 'preview' ? (
          <main aria-label="Preview" className="min-h-0 flex-1 overflow-y-auto">
            <FormView title={title} schema={schema} theme={form.theme} titleAs="h2" />
          </main>
        ) : (
          <div className="flex min-h-0 flex-1">
            <aside
              aria-label="Add questions"
              className="w-60 shrink-0 overflow-y-auto border-r bg-background px-3 py-4"
            >
              <FieldPalette onAdd={add} />
            </aside>
            <main aria-label="Form canvas" className="min-w-0 flex-1 overflow-y-auto">
              <EditorCanvas
                theme={form.theme}
                emptyHint="Drag a question here, or pick one from the list."
              />
            </main>
            <aside
              aria-label="Settings"
              className="w-80 shrink-0 overflow-y-auto border-l bg-background"
            >
              <SettingsPanel />
            </aside>
          </div>
        )}
      </div>
    </EditorDnd>
  );
}
