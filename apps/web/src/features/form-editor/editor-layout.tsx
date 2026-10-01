import type { FieldType, FormDetail } from '@formyx/shared';
import { Plus } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useMediaQuery } from '@/lib/use-media-query';
import { EditorCanvas } from './canvas/editor-canvas';
import { focusQuestion } from './canvas/focus-question';
import { EditorDnd } from './dnd/editor-dnd';
import { useEditorStore } from './editor-store-context';
import { FieldPalette } from './palette/field-palette';
import { EditorPreview } from './preview/editor-preview';
import { SettingsPanel } from './settings/settings-panel';
import { EditorTopBar, type EditorView } from './top-bar/editor-top-bar';
import { useEditorShortcuts } from './use-editor-shortcuts';

export const DESKTOP_EDITOR_QUERY = '(min-width: 1024px)';

interface EditorLayoutProps {
  form: FormDetail;
  status: ReactNode;
  /** The form's sections, for the top bar. */
  navigation?: ReactNode;
  /** Publishing controls for the top bar. */
  actions?: ReactNode;
}

/** Adds a question at the end, then focuses it on the canvas. */
function useAddField() {
  const addField = useEditorStore((state) => state.addField);
  return (type: FieldType) => {
    focusQuestion(addField(type));
  };
}

/** Palette, canvas and settings side by side, or the preview. */
function DesktopEditor({ form, status, navigation, actions }: EditorLayoutProps) {
  const [view, setView] = useState<EditorView>('build');
  const add = useAddField();
  useEditorShortcuts(view === 'build');

  return (
    <div className="flex h-dvh flex-col bg-surface">
      <EditorTopBar
        status={status}
        navigation={navigation}
        actions={actions}
        view={view}
        onViewChange={setView}
      />

      {view === 'preview' ? (
        <main aria-label="Preview" className="min-h-0 flex-1 overflow-y-auto">
          <EditorPreview theme={form.theme} />
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
  );
}

type MobileTab = 'build' | 'settings' | 'preview';

/** Phones and tablets: Build / Settings / Preview tabs, and the palette in a bottom sheet. */
function MobileEditor({ form, status, navigation, actions }: EditorLayoutProps) {
  const [tab, setTab] = useState<MobileTab>('build');
  const [paletteOpen, setPaletteOpen] = useState(false);
  const add = useAddField();
  useEditorShortcuts(tab === 'build');

  return (
    <div className="flex h-dvh flex-col bg-surface">
      <EditorTopBar status={status} navigation={navigation} actions={actions} />
      <Tabs
        value={tab}
        onValueChange={(value) => {
          if (value === 'build' || value === 'settings' || value === 'preview') setTab(value);
        }}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="shrink-0 border-b bg-background px-3 py-2">
          <TabsList aria-label="Editor" className="grid w-full grid-cols-3 sm:mx-auto sm:max-w-md">
            <TabsTrigger value="build">Build</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
            <TabsTrigger value="preview">Preview</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="build" className="mt-0 flex min-h-0 flex-1 flex-col">
          <main aria-label="Form canvas" className="min-h-0 flex-1 overflow-y-auto">
            <EditorCanvas
              theme={form.theme}
              emptyHint="Tap Add question to get started."
              onOpenSettings={() => {
                setTab('settings');
              }}
            />
          </main>
          <div className="shrink-0 border-t bg-background p-3">
            <Button
              className="w-full"
              onClick={() => {
                setPaletteOpen(true);
              }}
            >
              <Plus aria-hidden />
              Add question
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="settings" className="mt-0 min-h-0 flex-1 overflow-y-auto bg-background">
          <div className="mx-auto w-full max-w-xl">
            <SettingsPanel />
          </div>
        </TabsContent>

        <TabsContent value="preview" className="mt-0 min-h-0 flex-1 overflow-y-auto">
          <EditorPreview theme={form.theme} />
        </TabsContent>
      </Tabs>

      <Sheet open={paletteOpen} onOpenChange={setPaletteOpen}>
        <SheetContent side="bottom" className="max-h-[80dvh] overflow-y-auto rounded-t-xl">
          <SheetHeader>
            <SheetTitle>Add a question</SheetTitle>
            <SheetDescription>It goes at the end of the form.</SheetDescription>
          </SheetHeader>
          <FieldPalette
            draggable={false}
            className="grid gap-x-4 gap-y-5 px-4 pb-6 sm:grid-cols-3"
            onAdd={(type) => {
              setPaletteOpen(false);
              add(type);
            }}
          />
        </SheetContent>
      </Sheet>
    </div>
  );
}

/** The editor's layout for the current screen size, with drag and drop around it all. */
export function EditorLayout(props: EditorLayoutProps) {
  const isDesktop = useMediaQuery(DESKTOP_EDITOR_QUERY);
  return (
    <EditorDnd>{isDesktop ? <DesktopEditor {...props} /> : <MobileEditor {...props} />}</EditorDnd>
  );
}
