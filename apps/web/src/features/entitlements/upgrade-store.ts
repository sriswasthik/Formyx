import type { FeatureId } from '@formyx/shared';
import { create } from 'zustand';

/** The app-wide upgrade dialog, opened from a Pro badge (see UpgradeDialogHost). */
interface UpgradeState {
  /** The features it is about; `null` when closed. */
  features: FeatureId[] | null;
  openUpgrade: (features: FeatureId[]) => void;
  closeUpgrade: () => void;
}

export const useUpgradeStore = create<UpgradeState>((set) => ({
  features: null,
  openUpgrade: (features) => {
    set({ features });
  },
  closeUpgrade: () => {
    set({ features: null });
  },
}));
