import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DesignStudio } from './design/design-studio';
import { LogicPanel } from './logic-panel/logic-panel';
import { SettingsPanel } from './settings/settings-panel';

export type SidebarTab = 'settings' | 'logic' | 'design';

interface EditorSidebarProps {
  tab: SidebarTab;
  onTabChange: (tab: SidebarTab) => void;
}

/** The right-hand panel on large screens: settings of the selection, logic, or the Design Studio. */
export function EditorSidebar({ tab, onTabChange }: EditorSidebarProps) {
  return (
    <Tabs
      value={tab}
      onValueChange={(value) => {
        if (value === 'settings' || value === 'logic' || value === 'design') onTabChange(value);
      }}
      className="flex h-full flex-col"
    >
      <div className="shrink-0 border-b px-4">
        <TabsList variant="underline" aria-label="Panel" className="border-b-0">
          <TabsTrigger value="settings">Settings</TabsTrigger>
          <TabsTrigger value="logic">Logic</TabsTrigger>
          <TabsTrigger value="design">Design</TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="settings" className="mt-0 min-h-0 flex-1 overflow-y-auto">
        <SettingsPanel />
      </TabsContent>
      <TabsContent value="logic" className="mt-0 min-h-0 flex-1 overflow-y-auto">
        <LogicPanel />
      </TabsContent>
      <TabsContent value="design" className="mt-0 min-h-0 flex-1">
        <DesignStudio layout="panel" canExpand />
      </TabsContent>
    </Tabs>
  );
}
