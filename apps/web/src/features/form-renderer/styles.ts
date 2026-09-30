/** Class recipes for form controls. They only use the `--form-*` theme variables. */

export const controlSurface = [
  'rounded-(--form-radius) border border-(--form-border-strong) bg-(--form-bg) text-(--form-fg)',
  'transition-[border-color,background-color] duration-150 ease-standard',
  'hover:border-(--form-muted)',
].join(' ');

export const textControl = [
  controlSurface,
  'block w-full min-w-0 px-3.5 text-16 placeholder:text-(--form-muted)',
  'focus-visible:border-(--form-accent)',
  'aria-invalid:border-(--form-danger)',
].join(' ');

/** A choice row: the native input is visually hidden and the row shows its state. */
export const choiceRow = [
  controlSurface,
  'relative flex cursor-pointer items-center gap-3 px-3.5 py-3 text-16',
  'hover:bg-(--form-hover)',
  'has-checked:border-(--form-accent) has-checked:bg-(--form-accent-subtle)',
  'has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-(--form-accent)',
].join(' ');
