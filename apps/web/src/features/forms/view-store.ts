import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type FormsView = 'grid' | 'list';

export const FORMS_VIEW_STORAGE_KEY = 'formyx-forms-view';

interface FormsViewState {
  view: FormsView;
  setView: (view: FormsView) => void;
}

/** Grid or list, remembered per browser. */
export const useFormsViewStore = create<FormsViewState>()(
  persist(
    (set) => ({
      view: 'grid',
      setView: (view) => {
        set({ view });
      },
    }),
    {
      name: FORMS_VIEW_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: ({ view }) => ({ view }),
    },
  ),
);
