import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { FormSort } from './forms-view';

export type FormsView = 'grid' | 'list';

export const FORMS_VIEW_STORAGE_KEY = 'formyx-forms-view';

interface FormsViewState {
  view: FormsView;
  sort: FormSort;
  setView: (view: FormsView) => void;
  setSort: (sort: FormSort) => void;
}

/** Grid or list, and the order, remembered per browser. */
export const useFormsViewStore = create<FormsViewState>()(
  persist(
    (set) => ({
      view: 'grid',
      sort: 'edited',
      setView: (view) => {
        set({ view });
      },
      setSort: (sort) => {
        set({ sort });
      },
    }),
    {
      name: FORMS_VIEW_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: ({ view, sort }) => ({ view, sort }),
    },
  ),
);
