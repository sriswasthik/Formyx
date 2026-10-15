/** Data attached to routes via `handle`, read with `useMatches()`. */
export interface RouteHandle {
  /** Page title, shown in the app shell's breadcrumbs and the document title. */
  title?: string;
  /** A page above this one that is not its parent route, for the breadcrumbs (e.g. Forms). */
  parent?: { title: string; to: string };
}

/** One step of the breadcrumbs: the page's title and where it is. */
export interface Breadcrumb {
  label: string;
  to: string;
}

/**
 * The trail to the current page, from the matched routes' titles (and the deepest one's
 * `parent`). `current`, when given, names the last step instead (a form's own title).
 */
export function getBreadcrumbs(
  matches: readonly { handle: unknown; pathname: string }[],
  current?: string,
): Breadcrumb[] {
  const titled = matches.filter((match) => isRouteHandle(match.handle));
  const crumbs = titled.map((match) => ({
    label: (match.handle as RouteHandle).title ?? '',
    to: match.pathname,
  }));
  const parent = (titled.at(-1)?.handle as RouteHandle | undefined)?.parent;
  if (parent) crumbs.unshift({ label: parent.title, to: parent.to });
  const last = crumbs.at(-1);
  if (last && current) last.label = current;
  return crumbs;
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
  // The home page: the same as index.html's <title>.
  return title ? `${title} · Formyx` : 'Formyx: build forms people actually enjoy filling in';
}
