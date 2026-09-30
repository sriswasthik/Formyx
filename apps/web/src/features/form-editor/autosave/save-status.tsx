import { Check, CircleAlert, LoaderCircle, WifiOff } from 'lucide-react';
import type * as React from 'react';
import { cn } from '@/lib/utils';
import type { SaveState } from './autosaver';

interface SaveStatusProps {
  state: SaveState;
  onRetry: () => void;
  onReload: () => void;
  onShowIssues: () => void;
}

function Action({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-sm font-medium text-accent underline-offset-4 transition-colors duration-150 hover:underline"
    >
      {children}
    </button>
  );
}

/**
 * "Saved", "Saving…" or what went wrong, with a way to fix it. Only problems are announced
 * to screen readers; routine saves every few seconds would be noise.
 */
export function SaveStatus({ state, onRetry, onReload, onShowIssues }: SaveStatusProps) {
  let icon: React.ReactNode;
  let text: string;
  let action: React.ReactNode = null;
  let tone = 'text-muted-foreground';

  switch (state.kind) {
    case 'saved':
      icon = <Check aria-hidden />;
      text = 'Saved';
      break;
    case 'saving':
      icon = <LoaderCircle aria-hidden className="motion-safe:animate-spin" />;
      text = 'Saving…';
      break;
    case 'unsaved':
      icon = <span aria-hidden className="mx-1 size-1.5 rounded-full bg-muted-foreground" />;
      text = 'Unsaved changes';
      break;
    case 'invalid':
      icon = <CircleAlert aria-hidden />;
      tone = 'text-warning-text';
      text = state.issues === 1 ? '1 issue to fix' : `${state.issues} issues to fix`;
      action = <Action onClick={onShowIssues}>Show</Action>;
      break;
    case 'offline':
      icon = <WifiOff aria-hidden />;
      tone = 'text-warning-text';
      text = 'Offline, retrying';
      action = <Action onClick={onRetry}>Retry now</Action>;
      break;
    case 'error':
      icon = <CircleAlert aria-hidden />;
      tone = 'text-danger-text';
      text = 'Could not save, retrying';
      action = <Action onClick={onRetry}>Retry now</Action>;
      break;
    case 'conflict':
      icon = <CircleAlert aria-hidden />;
      tone = 'text-danger-text';
      text = 'Not saved: changed elsewhere';
      action = <Action onClick={onReload}>Reload</Action>;
      break;
  }

  const problem = action !== null;

  return (
    <div className="flex items-center gap-1.5 text-13 whitespace-nowrap">
      <span className={cn('flex items-center gap-1.5', tone)}>
        {icon}
        <span className={cn(!problem && 'sr-only md:not-sr-only')}>{text}</span>
      </span>
      {action}
      <span role="status" className="sr-only">
        {problem ? text : ''}
      </span>
    </div>
  );
}
