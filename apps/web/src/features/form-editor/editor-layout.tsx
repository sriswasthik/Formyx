import type { FieldType, FormDetail } from '@formyx/shared';
import { Plus } from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';
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
import { cn } from '@/lib/utils';
import { EditorCanvas } from './canvas/editor-canvas';
import { focusQuestion } from './canvas/focus-question';
import { EditorDnd } from './dnd/editor-dnd';
import { useEditorStore } from './editor-store-context';
import { FieldPalette } from './palette/field-palette';
import { EditorPreview } from './preview/editor-preview';
import { DesignStudio } from './design/design-studio';
import { createStudioStore, StudioStoreContext, useStudio } from './design/studio-state';
import { StudioPreview } from './design/studio-preview';
import { EditorSidebar, type SidebarTab } from './editor-sidebar';
import { LogicPanel } from './logic-panel/logic-panel';
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

/** `?panel=design` opens the editor on the Design Studio (the getting-started checklist links there). */
function useOpensOnDesign(): boolean {
  const [searchParams] = useSearchParams();
  return searchParams.get('panel') === 'design';
}

/** Adds a question at the end, then focuses it on the canvas. */
function useAddField() {
  const addField = useEditorStore((state) => state.addField);
  return (type: FieldType) => {
    focusQuestion(addField(type));
  };
}

/** The Design Studio over the whole window: its controls beside a large preview. */
function FullScreenStudio() {
  const fullScreen = useStudio((state) => state.fullScreen);
  const setFullScreen = useStudio((state) => state.setFullScreen);
  return (
    <DialogPrimitive.Root open={fullScreen} onOpenChange={setFullScreen}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Content
          aria-describedby={undefined}
          data-editor-keys
          className="fixed inset-0 z-50 flex bg-background outline-none"
        >
          <DialogPrimitive.Title className="sr-only">Design Studio</DialogPrimitive.Title>
          <div className="w-[26.25rem] shrink-0 border-r">
            <DesignStudio layout="panel" canExpand />
          </div>
          <StudioPreview className="min-w-0 flex-1" />
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/**
 * Palette, canvas and settings side by side; or, while designing, the Studio's live preview
 * beside its wider panel; or the preview.
 */
function DesktopEditor({ status, navigation, actions }: EditorLayoutProps) {
  const theme = useEditorStore((state) => state.theme);
  const selectedId = useEditorStore((state) => state.selectedFieldId);
  const selectField = useEditorStore((state) => state.selectField);
  const [view, setView] = useState<EditorView>('build');
  const opensOnDesign = useOpensOnDesign();
  const [panel, setPanel] = useState<SidebarTab>(opensOnDesign ? 'design' : 'settings');
  const add = useAddField();
  useEditorShortcuts(view === 'build');

  // Picking a question means editing it: show its settings.
  const [shownSelection, setShownSelection] = useState(selectedId);
  if (selectedId !== shownSelection) {
    setShownSelection(selectedId);
    if (selectedId) setPanel('settings');
  }
  const designing = panel === 'design';

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
          <EditorPreview theme={theme} />
        </main>
      ) : (
        <div className="flex min-h-0 flex-1">
          {designing ? (
            <main aria-label="Design preview" className="flex min-w-0 flex-1 flex-col">
              <StudioPreview className="flex-1" />
            </main>
          ) : (
            <>
              <aside
                aria-label="Add questions"
                className="w-60 shrink-0 overflow-y-auto border-r bg-background px-3 py-4"
              >
                <FieldPalette onAdd={add} />
              </aside>
              <main aria-label="Form canvas" className="min-w-0 flex-1 overflow-y-auto">
                <EditorCanvas
                  theme={theme}
                  emptyHint="Drag a question here, or pick one from the list."
                />
              </main>
            </>
          )}
          <aside
            aria-label="Settings and design"
            className={cn(
              'shrink-0 border-l bg-background',
              designing || panel === 'logic' ? 'w-[26.25rem]' : 'w-80',
            )}
          >
            <EditorSidebar
              tab={panel}
              onTabChange={(next) => {
                // Designing hides the questions, so none stays selected for Delete to remove.
                if (next === 'design') selectField(null);
                setPanel(next);
              }}
            />
          </aside>
          {designing && <FullScreenStudio />}
        </div>
      )}
    </div>
  );
}

type MobileTab = 'build' | 'design' | 'logic' | 'settings' | 'preview';

/** Phones and tablets: Build / Design / Logic / Settings / Preview tabs; the palette in a sheet. */
function MobileEditor({ status, navigation, actions }: EditorLayoutProps) {
  const theme = useEditorStore((state) => state.theme);
  const opensOnDesign = useOpensOnDesign();
  const [tab, setTab] = useState<MobileTab>(opensOnDesign ? 'design' : 'build');
  const [paletteOpen, setPaletteOpen] = useState(false);
  const add = useAddField();
  useEditorShortcuts(tab === 'build');

  return (
    <div className="flex h-dvh flex-col bg-surface">
      <EditorTopBar status={status} navigation={navigation} actions={actions} />
      <Tabs
        value={tab}
        onValueChange={(value) => {
          if (
            value === 'build' ||
            value === 'design' ||
            value === 'logic' ||
            value === 'settings' ||
            value === 'preview'
          ) {
            setTab(value);
          }
        }}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="shrink-0 border-b bg-background px-3 py-2">
          <TabsList aria-label="Editor" className="grid w-full grid-cols-5 sm:mx-auto sm:max-w-lg">
            <TabsTrigger value="build">Build</TabsTrigger>
            <TabsTrigger value="design">Design</TabsTrigger>
            <TabsTrigger value="logic">Logic</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
            <TabsTrigger value="preview">Preview</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="build" className="mt-0 flex min-h-0 flex-1 flex-col">
          <main aria-label="Form canvas" className="min-h-0 flex-1 overflow-y-auto">
            <EditorCanvas
              theme={theme}
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

        <TabsContent value="design" className="mt-0 flex min-h-0 flex-1 flex-col bg-background">
          <StudioPreview compact className="h-[42dvh] shrink-0 border-b" />
          <div className="mx-auto flex min-h-0 w-full max-w-xl flex-1 flex-col">
            <DesignStudio layout="stacked" />
          </div>
        </TabsContent>

        <TabsContent value="logic" className="mt-0 min-h-0 flex-1 overflow-y-auto bg-background">
          <div className="mx-auto w-full max-w-xl">
            <LogicPanel />
          </div>
        </TabsContent>

        <TabsContent value="settings" className="mt-0 min-h-0 flex-1 overflow-y-auto bg-background">
          <div className="mx-auto w-full max-w-xl">
            <SettingsPanel />
          </div>
        </TabsContent>

        <TabsContent value="preview" className="mt-0 min-h-0 flex-1 overflow-y-auto">
          <EditorPreview theme={theme} />
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
  // One Studio state for the editor, so the section and layer stay put across screen sizes.
  const [studio] = useState(createStudioStore);
  return (
    <StudioStoreContext.Provider value={studio}>
      <EditorDnd>
        {isDesktop ? <DesktopEditor {...props} /> : <MobileEditor {...props} />}
      </EditorDnd>
    </StudioStoreContext.Provider>
  );
}
