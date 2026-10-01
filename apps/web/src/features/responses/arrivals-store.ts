import { create } from 'zustand';

/** How long a response that just arrived stays highlighted. */
export const HIGHLIGHT_MS = 2400;

interface ArrivalsState {
  /** Responses that arrived live a moment ago, to highlight in the table. */
  highlighted: ReadonlySet<string>;
  /** Live arrivals so far, for the screen reader announcement. */
  count: number;
  arrive: (id: string) => void;
}

/** Responses arriving live: briefly highlighted, and announced to screen readers. */
export const useArrivals = create<ArrivalsState>()((set) => ({
  highlighted: new Set(),
  count: 0,
  arrive: (id) => {
    set((state) => ({ highlighted: new Set(state.highlighted).add(id), count: state.count + 1 }));
    setTimeout(() => {
      set((state) => {
        const highlighted = new Set(state.highlighted);
        highlighted.delete(id);
        return { highlighted };
      });
    }, HIGHLIGHT_MS);
  },
}));
