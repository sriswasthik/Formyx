import { cn } from '@/lib/utils';

/**
 * A sidebar row: 32px tall, 16px icon, 8px to its label. Muted until hovered; the current
 * page has a stronger background and full-contrast text. In the rail it is the icon alone,
 * named by its tooltip.
 */
export const sidebarRowClass = (active: boolean, collapsed: boolean) =>
  cn(
    'flex h-8 items-center gap-2 rounded-md text-14 transition-colors duration-150 ease-standard',
    collapsed ? 'w-8 justify-center' : 'w-full px-2',
    active
      ? 'bg-pressed font-medium text-foreground'
      : 'text-muted-foreground hover:bg-hover hover:text-foreground active:bg-pressed',
  );
