import type { FormTheme } from '@formyx/shared';
import { useEffect, useState } from 'react';
import type * as ConversationalModule from './conversational-form';

/*
 * The one-question-at-a-time flow is a chunk of its own, so classic forms never download it.
 * Pages that can wait (the public form waits for its fonts anyway) preload it, and once it is
 * here it renders at once, with no placeholder that would move the form about.
 */

let loaded: typeof ConversationalModule | null = null;
let loading: Promise<typeof ConversationalModule> | null = null;

export function loadConversational(): Promise<typeof ConversationalModule> {
  loading ??= import('./conversational-form').then((module) => (loaded = module));
  return loading;
}

/** Loads what drawing a form in `theme` needs beyond the classic layout. Never rejects. */
export async function preloadFormLayout(theme: Pick<FormTheme, 'layout'>): Promise<void> {
  if (theme.layout.mode !== 'conversational') return;
  await loadConversational().catch(() => undefined);
}

/** The conversational flow, once it has loaded; starts loading it when `needed`. */
export function useConversational(needed: boolean): typeof ConversationalModule | null {
  const [module, setModule] = useState(loaded);
  useEffect(() => {
    if (!needed || module) return;
    let current = true;
    void loadConversational().then((next) => {
      if (current) setModule(next);
    });
    return () => {
      current = false;
    };
  }, [needed, module]);
  return module ?? loaded;
}
