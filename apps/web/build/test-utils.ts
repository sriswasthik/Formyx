/**
 * Runs a script index.html would inline, in the test's window. (A script element would run in
 * jsdom's own context, which cannot see what a test puts on `window`.)
 */
export function runInlineScript(source: string): void {
  // eslint-disable-next-line @typescript-eslint/no-implied-eval -- the script is ours, built for index.html
  const run = new Function(source) as () => void;
  run();
}
