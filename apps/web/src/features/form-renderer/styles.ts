import type { ThemeComponents } from '@formyx/shared';

/**
 * Class recipes for form controls. They only use the `--form-*` variables ThemeRenderer sets,
 * so each control takes the theme's input, choice and button styles.
 */

/** A choice or rating button: a box even when text inputs are underlined. */
export const controlSurface = [
  'rounded-(--form-choice-radius) border border-(--form-choice-border) bg-(--form-choice-bg) text-(--form-fg)',
  'transition-[border-color,background-color,color] duration-150 ease-standard',
  'hover:border-(--form-choice-border-hover) hover:bg-(--form-choice-bg-hover)',
].join(' ');

/** Text inputs, text areas and selects, in the theme's input style. Add a radius class. */
export const textControl = [
  'block w-full min-w-0 form-text text-(--form-fg) placeholder:text-(--form-muted)',
  'border-(length:--form-input-border-width) border-(--form-input-border) bg-(--form-input-bg) px-(--form-input-px)',
  'transition-[border-color,background-color] duration-150 ease-standard',
  'hover:border-(--form-input-border-hover) hover:bg-(--form-input-bg-hover)',
  'focus-visible:border-(--form-accent) focus-visible:bg-(--form-input-bg)',
  'aria-invalid:border-(--form-danger)',
].join(' ');

/** Corners of single-line inputs and selects; text areas use `textareaRadius`. */
export const inputRadius = 'rounded-(--form-input-radius)';
export const textareaRadius = 'rounded-(--form-textarea-radius)';

/**
 * Boxes that are not text fields but sit among them, such as the file drop zone and file
 * rows: the input style's fill and corners, always with a visible edge.
 */
export const boxSurface =
  'rounded-(--form-box-radius) border border-(--form-box-border) bg-(--form-box-bg)';

/** Shows a focused native input's ring on the label that draws it. */
const focusWithin =
  'has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-(--form-accent)';

/** A choice: the native input is visually hidden and the label shows its state. */
const choiceBase = [
  controlSurface,
  'relative flex cursor-pointer items-center form-text',
  focusWithin,
];

/** Picked: the primary colour's tint, or filled with it for button choices. */
const pickedSubtle = 'has-checked:border-(--form-accent) has-checked:bg-(--form-accent-subtle)';
const pickedSolid =
  'has-checked:border-(--form-accent) has-checked:bg-(--form-accent) has-checked:text-(--form-accent-fg)';

export type ChoiceStyle = ThemeComponents['choiceStyle'];

/** How the options are laid out for each choice style. */
export const choiceGroup: Record<ChoiceStyle, string> = {
  list: 'flex flex-col gap-2',
  cards: 'grid grid-cols-1 gap-2.5 @md:grid-cols-2',
  pills: 'flex flex-wrap gap-2',
  buttons: 'flex flex-wrap gap-2',
};

/** One option, for each choice style. */
export const choiceOption: Record<ChoiceStyle, string> = {
  list: [...choiceBase, pickedSubtle, 'gap-3 px-3.5 py-3'].join(' '),
  cards: [...choiceBase, pickedSubtle, 'min-h-14 gap-3 border-[1.5px] px-4 py-4'].join(' '),
  pills: [...choiceBase, pickedSubtle, 'min-h-11 gap-2 px-4 py-2'].join(' '),
  buttons: [...choiceBase, pickedSolid, 'min-h-11 justify-center gap-2 px-4 py-2 font-medium'].join(
    ' ',
  ),
};

/** A rating button: takes the choice style's corners, filled with the primary once picked. */
export const ratingOption = [
  controlSurface,
  'relative flex size-11 cursor-pointer items-center justify-center form-text font-medium tabular-nums',
  pickedSolid,
  focusWithin,
].join(' ');

const BUTTON_SIZES: Record<ThemeComponents['buttonSize'], string> = {
  sm: 'h-9 px-4 form-text-sm',
  md: 'h-11 px-5 form-text',
  lg: 'h-13 px-7 form-text',
};

/** The submit and next buttons, in the theme's button style and size. */
export function formButton({ buttonSize, buttonFullWidth }: ThemeComponents): string {
  return [
    'inline-flex shrink-0 items-center justify-center gap-2 font-medium',
    BUTTON_SIZES[buttonSize],
    buttonFullWidth && 'w-full',
    'rounded-(--form-button-radius) border-[1.5px] border-(--form-button-border)',
    'bg-(--form-button-bg) text-(--form-button-fg)',
    'transition-opacity duration-150 ease-standard',
    'hover:not-disabled:opacity-90 active:not-disabled:opacity-80 disabled:opacity-60',
  ]
    .filter(Boolean)
    .join(' ');
}

/** Quieter buttons beside the main one, such as Back: text in the form's colours. */
export const secondaryButton = [
  'inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-(--form-button-radius) px-3 form-text-sm font-medium text-(--form-muted)',
  'transition-colors duration-150 ease-standard',
  'hover:not-disabled:bg-(--form-hover) hover:not-disabled:text-(--form-fg) disabled:opacity-50',
].join(' ');
