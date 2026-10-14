/*
 * The hero's product frame: its box, shared by the frame and the placeholder that holds its
 * place while it loads, so nothing below it moves. Kept apart so the hero can use it without
 * loading the frame.
 */

export const PRODUCT_FRAME_CLASS =
  'flex h-[460px] flex-col overflow-hidden rounded-xl border bg-background shadow-popover md:h-[540px] lg:h-[600px]';
