/**
 * Whether a page's code failed to load because the site was redeployed since the app opened:
 * the old chunk file is gone. (Browsers word it differently; these are Chrome, Safari and
 * Firefox, and Vite's CSS preload.)
 */
export function isStaleBuildError(error: unknown): boolean {
  return (
    error instanceof Error &&
    /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS/i.test(
      error.message,
    )
  );
}
