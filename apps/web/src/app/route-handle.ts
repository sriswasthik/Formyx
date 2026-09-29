/** Data attached to routes via `handle`, read with `useMatches()`. */
export interface RouteHandle {
  /** Page title, shown in the app shell's top bar and the document title. */
  title?: string;
}

function isRouteHandle(value: unknown): value is RouteHandle {
  return (
    typeof value === 'object' &&
    value !== null &&
    'title' in value &&
    typeof value.title === 'string'
  );
}

/** Returns the title of the deepest matched route that declares one. */
export function getRouteTitle(matches: readonly { handle: unknown }[]): string | undefined {
  const match = matches.findLast((m) => isRouteHandle(m.handle));
  return isRouteHandle(match?.handle) ? match.handle.title : undefined;
}

export function formatDocumentTitle(title: string | undefined): string {
  return title ? `${title} · Formyx` : 'Formyx — Forms that feel effortless';
}
