import { LazyMotion } from 'motion/react';
import type * as React from 'react';
import { useLocation } from 'react-router';

/*
 * Components animate with motion's lightweight `m` elements; the animation code itself comes
 * from LazyMotion. Public forms load a smaller set of their own (see form-view.tsx), so what
 * respondents download stays small. Everywhere else gets every feature, loaded as soon as the
 * app starts, alongside the page's own code, so nothing waits for it.
 */

const isPublicFormPath = (pathname: string) => pathname.startsWith('/f/');

type Features = Awaited<ReturnType<typeof importFeatures>>;
const importFeatures = () => import('./app-motion-features').then((module) => module.default);
let appFeatures: Promise<Features> | null = null;

function loadAppFeatures(): Promise<Features> {
  appFeatures ??= importFeatures();
  return appFeatures;
}

if (!isPublicFormPath(window.location.pathname)) void loadAppFeatures();

export function AppMotion({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  if (isPublicFormPath(pathname)) return children;
  return <LazyMotion features={loadAppFeatures}>{children}</LazyMotion>;
}
