import { useId } from 'react';
import type * as React from 'react';

interface StudioGroupProps {
  title: string;
  description?: string;
  /** A button beside the title, such as "Add layer". */
  action?: React.ReactNode;
  children: React.ReactNode;
}

/** A titled group of controls in a Design Studio section. */
export function StudioGroup({ title, description, action, children }: StudioGroupProps) {
  const id = useId();
  return (
    <section
      aria-labelledby={id}
      className="flex flex-col gap-4 border-b px-4 py-5 last:border-b-0"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h3 id={id} className="text-13 font-medium">
            {title}
          </h3>
          {description && <p className="text-12 text-muted-foreground">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
