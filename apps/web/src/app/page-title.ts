import { useEffect } from 'react';
import { useMatches } from 'react-router';
import { create } from 'zustand';
import { getBreadcrumbs, getRouteTitle, type Breadcrumb } from './route-handle';

const usePageTitleStore = create<{ title: string | null }>()(() => ({ title: null }));

/**
 * Overrides the route's static title (shown in the app shell and the browser tab) while the
 * calling page is mounted, e.g. with the name of the form being viewed.
 */
export function usePageTitle(title: string | undefined): void {
  useEffect(() => {
    if (!title) return;
    usePageTitleStore.setState({ title });
    return () => {
      usePageTitleStore.setState({ title: null });
    };
  }, [title]);
}

/** The trail to the current page, its last step named by the page's own title if it set one. */
export function useBreadcrumbs(): Breadcrumb[] {
  const override = usePageTitleStore((state) => state.title);
  return getBreadcrumbs(useMatches(), override ?? undefined);
}

/** The page's own title if it set one, otherwise the deepest route's `handle.title`. */
export function useCurrentTitle(): string | undefined {
  const override = usePageTitleStore((state) => state.title);
  const routeTitle = getRouteTitle(useMatches());
  return override ?? routeTitle;
}
