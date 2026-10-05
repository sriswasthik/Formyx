import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DesignStudio } from './design/design-studio';
import { SettingsPanel } from './settings/settings-panel';

export type SidebarTab = 'settings' | 'design';

interface EditorSidebarProps {
  tab: SidebarTab;
  onTabChange: (tab: SidebarTab) => void;
}

/** The right-hand panel on large screens: settings of the selection, or the Design Studio. */
export function EditorSidebar({ tab, onTabChange }: EditorSidebarProps) {
  return (
    <Tabs
      value={tab}
      onValueChange={(value) => {
        if (value === 'settings' || value === 'design') onTabChange(value);
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
      <TabsContent value="design" className="mt-0 min-h-0 flex-1">
        <DesignStudio layout="panel" canExpand />
      </TabsContent>
    </Tabs>
  );
}
