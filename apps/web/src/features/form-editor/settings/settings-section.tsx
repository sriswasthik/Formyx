import type * as React from 'react';

export function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4 border-b px-4 py-5 last:border-b-0">
      <h3 className="text-13 font-medium text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}
