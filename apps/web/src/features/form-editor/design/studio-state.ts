import type { BackgroundLayer } from '@formyx/shared';
import { createContext, useContext } from 'react';
import { createStore, useStore, type StoreApi } from 'zustand';

export const STUDIO_SECTIONS = [
  'presets',
  'background',
  'colors',
  'typography',
  'components',
  'layout',
] as const;
export type StudioSection = (typeof STUDIO_SECTIONS)[number];

export type PreviewDevice = 'desktop' | 'mobile';

/**
 * What the Design Studio is showing, shared by its panel and its preview (which sit apart in
 * the editor's layout). Not part of the form, so not undone or saved.
 */
export interface StudioState {
  section: StudioSection;
  device: PreviewDevice;
  fullScreen: boolean;
  /** The background layer being edited. */
  layerId: string | null;
  /** Inside the selected layer: a mesh point's index or a shape's id. */
  itemId: string | null;
  setSection: (section: StudioSection) => void;
  setDevice: (device: PreviewDevice) => void;
  setFullScreen: (fullScreen: boolean) => void;
  selectLayer: (layerId: string | null) => void;
  selectItem: (itemId: string | null) => void;
}

export type StudioStore = StoreApi<StudioState>;

export function createStudioStore(): StudioStore {
  return createStore<StudioState>()((set) => ({
    section: 'presets',
    device: 'desktop',
    fullScreen: false,
    layerId: null,
    itemId: null,
    setSection: (section) => {
      set({ section });
    },
    setDevice: (device) => {
      set({ device });
    },
    setFullScreen: (fullScreen) => {
      set({ fullScreen });
    },
    selectLayer: (layerId) => {
      set({ layerId, itemId: null });
    },
    selectItem: (itemId) => {
      set({ itemId });
    },
  }));
}

export const StudioStoreContext = createContext<StudioStore | null>(null);

export function useStudio<T>(selector: (state: StudioState) => T): T {
  const store = useContext(StudioStoreContext);
  if (!store) throw new Error('Studio hooks must be used inside <StudioStoreContext>');
  return useStore(store, selector);
}

/** The layer the Background section edits: the chosen one, or the top one until one is chosen. */
export function editedLayer(
  layers: readonly BackgroundLayer[],
  layerId: string | null,
): BackgroundLayer | null {
  return layers.find((layer) => layer.id === layerId) ?? layers.at(-1) ?? null;
}
