/** Class recipes shared by several primitives. */

/** Floating surfaces: menus, select lists, popovers. */
export const popoverSurface =
  'z-50 overflow-hidden rounded-lg border bg-popover p-1 text-popover-foreground shadow-popover';

/** Enter/exit for floating surfaces: fade + scale from 0.98 + 4px slide away from the trigger. */
export const popoverMotion = [
  'duration-150 ease-standard',
  'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-98',
  'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-98',
  'data-[side=bottom]:slide-in-from-top-1 data-[side=top]:slide-in-from-bottom-1',
  'data-[side=left]:slide-in-from-right-1 data-[side=right]:slide-in-from-left-1',
].join(' ');

/** Rows inside menus and select lists. Keyboard focus is shown by the highlight, not a ring. */
export const menuItem = [
  'relative flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-14 outline-none select-none',
  'transition-colors duration-150 ease-standard',
  'data-[highlighted]:bg-hover data-[state=open]:bg-hover',
  'data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50',
  '[&_svg]:shrink-0 [&_svg]:text-muted-foreground',
].join(' ');

/** Text fields: input, textarea, select trigger. 16px on mobile prevents iOS zoom on focus. */
export const fieldBase = [
  'w-full min-w-0 rounded-lg border border-input bg-background text-16 text-foreground md:text-14',
  'transition-[border-color] duration-150 ease-standard',
  'hover:not-disabled:border-control',
  'placeholder:text-muted-foreground',
  'disabled:bg-muted disabled:opacity-60',
  'aria-invalid:border-danger aria-invalid:outline-danger',
].join(' ');

/** Full-screen overlay behind dialogs and sheets. */
export const overlay = [
  'fixed inset-0 z-50 bg-overlay',
  'duration-200 ease-standard',
  'data-[state=open]:animate-in data-[state=open]:fade-in-0',
  'data-[state=closed]:animate-out data-[state=closed]:fade-out-0',
].join(' ');
