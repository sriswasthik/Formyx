import type * as React from 'react';
import { ProBadge } from '@/features/entitlements/pro-badge';
import { cn } from '@/lib/utils';
import { settingAnchor } from './settings-index';

interface SettingRowProps {
  /** From the settings index: what search and deep links find. */
  id: string;
  label: string;
  description?: React.ReactNode;
  /** The control's id, so the label clicks through to it. */
  controlId?: string;
  /** A Pro feature on a plan without it. */
  pro?: boolean;
  /** Part of the form's draft or look: goes live with the next publish. */
  published?: boolean;
  /** Under the label rather than beside it: wide controls (lists, editors). */
  stacked?: boolean;
  /** A small control (a switch): beside the label at every width, at the row's end. */
  compact?: boolean;
  children: React.ReactNode;
}

/**
 * One setting: its name and what it does on the left, its control on the right (or under it
 * for wide controls, and always on phones).
 */
export function SettingRow({
  id,
  label,
  description,
  controlId,
  pro = false,
  published = false,
  stacked = false,
  compact = false,
  children,
}: SettingRowProps) {
  const labelId = `${settingAnchor(id)}-label`;
  return (
    <div
      id={settingAnchor(id)}
      className={cn(
        'scroll-mt-24 rounded-lg px-5 py-4 transition-colors duration-250 ease-standard sm:px-6',
        'data-[highlight=true]:bg-accent-subtle',
        stacked
          ? 'flex flex-col gap-3'
          : compact
            ? 'flex items-start justify-between gap-4 md:gap-8'
            : 'flex flex-col gap-3 md:flex-row md:items-start md:gap-8',
      )}
    >
      <div className={cn('flex min-w-0 flex-col gap-1', !stacked && 'flex-1')}>
        <div className="flex flex-wrap items-center gap-2">
          {controlId ? (
            <label id={labelId} htmlFor={controlId} className="text-14 font-medium">
              {label}
            </label>
          ) : (
            <h3 id={labelId} className="text-14 font-medium">
              {label}
            </h3>
          )}
          {pro && <ProBadge />}
          {published && (
            <span className="rounded-md border px-1.5 py-0.5 text-12 text-muted-foreground">
              Goes live when you publish
            </span>
          )}
        </div>
        {description && <div className="text-13 text-muted-foreground">{description}</div>}
      </div>
      <div
        className={cn('min-w-0', compact ? 'shrink-0 pt-0.5' : !stacked && 'md:w-80 md:shrink-0')}
      >
        {children}
      </div>
    </div>
  );
}

/** A section's settings, divided by thin lines, in one card. */
export function SettingGroup({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2" aria-label={title}>
      {title && (
        <h3 className="px-1 text-12 font-medium tracking-wide text-muted-foreground uppercase">
          {title}
        </h3>
      )}
      <div className="divide-y rounded-xl border bg-card">{children}</div>
    </section>
  );
}
