import type * as React from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { formatShortcut, type Shortcut } from '@/lib/shortcuts';

interface ActionTooltipProps {
  label: string;
  shortcut?: Shortcut;
  side?: 'top' | 'right' | 'bottom' | 'left';
  /** A single element that can hold focus (the tooltip also opens on focus). */
  children: React.ReactElement;
}

/** Names an action, with its keyboard shortcut when there is one. */
export function ActionTooltip({ label, shortcut, side, children }: ActionTooltipProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side} className="flex items-center gap-2">
        <span>{label}</span>
        {shortcut && (
          <kbd className="font-sans text-12 tracking-wide opacity-60">
            {formatShortcut(shortcut)}
          </kbd>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
