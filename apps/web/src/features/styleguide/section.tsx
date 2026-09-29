import type * as React from 'react';
import { cn } from '@/lib/utils';

interface SectionProps {
  id: string;
  title: string;
  description?: string;
  children: React.ReactNode;
}

export function Section({ id, title, description, children }: SectionProps) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-20">
      <h2 id={`${id}-title`} className="text-20 font-semibold tracking-tight">
        {title}
      </h2>
      {description && <p className="mt-1 text-14 text-muted-foreground">{description}</p>}
      <div className="mt-6 flex flex-col gap-8">{children}</div>
    </section>
  );
}

export function Example({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div>
      <h3 className="mb-3 text-13 font-medium text-muted-foreground">{title}</h3>
      <div className={cn('rounded-xl border p-5 md:p-6', className)}>{children}</div>
    </div>
  );
}

/** Props that force a component into a given interaction state for static review. */
export interface ForcedState {
  'data-force-state'?: string;
  disabled?: boolean;
}

const STATES: { label: string; props: ForcedState }[] = [
  { label: 'Default', props: {} },
  { label: 'Hover', props: { 'data-force-state': 'hover' } },
  { label: 'Focus', props: { 'data-force-state': 'focus' } },
  { label: 'Active', props: { 'data-force-state': 'active' } },
  { label: 'Disabled', props: { disabled: true } },
];

/** Renders a component once per interaction state. */
export function StateGrid({ render }: { render: (state: ForcedState) => React.ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3 lg:grid-cols-5">
      {STATES.map(({ label, props }) => (
        <div key={label} className="flex min-w-0 flex-col items-start gap-2">
          <span className="text-12 text-muted-foreground">{label}</span>
          {render(props)}
        </div>
      ))}
    </div>
  );
}
