/**
 * Class recipes for form controls. They only use the `--form-*` variables ThemeRenderer sets,
 * so each control takes the theme's input, choice and button styles.
 */

/** A choice row or rating button: a box even when text inputs are underlined. */
export const controlSurface = [
  'rounded-(--form-choice-radius) border border-(--form-choice-border) bg-(--form-choice-bg) text-(--form-fg)',
  'transition-[border-color,background-color] duration-150 ease-standard',
  'hover:border-(--form-choice-border-hover)',
].join(' ');

/** Text inputs, text areas and selects, in the theme's input style. Add a radius class. */
export const textControl = [
  'block w-full min-w-0 form-text text-(--form-fg) placeholder:text-(--form-muted)',
  'border-(length:--form-input-border-width) border-(--form-input-border) bg-(--form-input-bg) px-(--form-input-px)',
  'transition-[border-color,background-color] duration-150 ease-standard',
  'hover:border-(--form-input-border-hover)',
  'focus-visible:border-(--form-accent)',
  'aria-invalid:border-(--form-danger)',
].join(' ');

/** Corners of single-line inputs and selects; text areas use `textareaRadius`. */
export const inputRadius = 'rounded-(--form-input-radius)';
export const textareaRadius = 'rounded-(--form-textarea-radius)';

/** A choice row: the native input is visually hidden and the row shows its state. */
export const choiceRow = [
  controlSurface,
  'relative flex cursor-pointer items-center gap-3 px-3.5 py-3 form-text',
  'hover:bg-(--form-hover)',
  'has-checked:border-(--form-accent) has-checked:bg-(--form-accent-subtle)',
  'has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-(--form-accent)',
].join(' ');

/** The submit button, in the theme's button style. */
export const submitButton = [
  'inline-flex h-11 items-center justify-center gap-2 px-5 form-text font-medium',
  'rounded-(--form-button-radius) border-[1.5px] border-(--form-button-border)',
  'bg-(--form-button-bg) text-(--form-button-fg)',
  'transition-opacity duration-150 ease-standard',
  'hover:not-disabled:opacity-90 active:not-disabled:opacity-80 disabled:opacity-60',
].join(' ');
