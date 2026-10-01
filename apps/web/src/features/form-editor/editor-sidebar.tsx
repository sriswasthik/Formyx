import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DesignPanel } from './design/design-panel';
import { useEditorStore } from './editor-store-context';
import { SettingsPanel } from './settings/settings-panel';

type SidebarTab = 'settings' | 'design';

/** The right-hand panel on large screens: settings of the selection, or the form's design. */
export function EditorSidebar() {
  const [tab, setTab] = useState<SidebarTab>('settings');
  const selectedId = useEditorStore((state) => state.selectedFieldId);

  // Picking a question means editing it: show its settings.
  const [shownSelection, setShownSelection] = useState(selectedId);
  if (selectedId !== shownSelection) {
    setShownSelection(selectedId);
    if (selectedId) setTab('settings');
  }

  return (
    <Tabs
      value={tab}
      onValueChange={(value) => {
        if (value === 'settings' || value === 'design') setTab(value);
      }}
      className="flex h-full flex-col"
    >
      <div className="shrink-0 border-b px-4">
        <TabsList variant="underline" aria-label="Panel" className="border-b-0">
          <TabsTrigger value="settings">Settings</TabsTrigger>
          <TabsTrigger value="design">Design</TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="settings" className="mt-0 min-h-0 flex-1 overflow-y-auto">
        <SettingsPanel />
      </TabsContent>
      <TabsContent value="design" className="mt-0 min-h-0 flex-1 overflow-y-auto">
        <DesignPanel />
      </TabsContent>
    </Tabs>
  );
}
