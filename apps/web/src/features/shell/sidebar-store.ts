import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export const SIDEBAR_STORAGE_KEY = 'formyx-sidebar';

/** The sidebar's widths in px: open, and collapsed to a rail of icons. */
export const SIDEBAR_WIDTH = 248;
export const SIDEBAR_RAIL_WIDTH = 64;

interface SidebarState {
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
  toggle: () => void;
}

/** Whether the desktop sidebar is collapsed to its rail, remembered per browser. */
export const useSidebarStore = create<SidebarState>()(
  persist(
    (set) => ({
      collapsed: false,
      setCollapsed: (collapsed) => {
        set({ collapsed });
      },
      toggle: () => {
        set((state) => ({ collapsed: !state.collapsed }));
      },
    }),
    {
      name: SIDEBAR_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: ({ collapsed }) => ({ collapsed }),
    },
  ),
);
