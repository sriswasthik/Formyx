import { useEffect, useState } from 'react';

/*
 * Parts of a form only some respondents need (the end screen, saving for later) live in
 * chunks of their own. Each loads once; after that it renders at once.
 */

export interface LazyModule<T> {
  load: () => Promise<T>;
  /** The module once it has loaded. */
  current: () => T | null;
}

export function lazyModule<T>(load: () => Promise<T>): LazyModule<T> {
  let loaded: T | null = null;
  let loading: Promise<T> | null = null;
  return {
    load: () => {
      loading ??= load().then((module) => (loaded = module));
      return loading;
    },
    current: () => loaded,
  };
}

/** `lazy`'s module once it has loaded; starts loading it when `needed`. */
export function useLazyModule<T>(lazy: LazyModule<T>, needed: boolean): T | null {
  const [module, setModule] = useState(lazy.current);
  useEffect(() => {
    if (!needed || module) return;
    let current = true;
    lazy.load().then(
      (next) => {
        if (current) setModule(() => next);
      },
      () => undefined,
    );
    return () => {
      current = false;
    };
  }, [lazy, needed, module]);
  return module ?? lazy.current();
}

export const endScreenModule = lazyModule(() => import('./end-screen'));
export const saveForLaterModule = lazyModule(() => import('./save-for-later'));
