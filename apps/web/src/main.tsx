import '@fontsource-variable/inter/wght.css';
import './styles/index.css';
import { startTransition, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { z } from 'zod';
import { App } from './app/app';
import { whenRouterReady } from './app/router';
import { startErrorMonitoring } from './lib/report-error';

// Zod compiles each schema to JavaScript the first time it parses. Pages here parse each schema
// a few times at most, so the compiling costs more than it saves (it was the longest task on a
// public form's first load); it would also need a content security policy that allows eval.
z.config({ jitless: true });

startErrorMonitoring();

const container = document.getElementById('root');
if (!container) throw new Error('Root element #root not found');

const app = (
  <StrictMode>
    <App />
  </StrictMode>
);

// The home page's HTML comes with its header and hero drawn in (build/static-pages.ts). They
// stay on screen until the page's code has loaded, then the app draws over them in one go,
// rather than blanking them while it loads. Its first render is a transition, so React draws
// the page in small slices instead of one long task, with the HTML on screen meanwhile.
if (container.hasAttribute('data-prerendered')) {
  void whenRouterReady().then(() => {
    const root = createRoot(container);
    startTransition(() => {
      root.render(app);
    });
  });
} else {
  createRoot(container).render(app);
}
