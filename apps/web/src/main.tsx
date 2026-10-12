import '@fontsource-variable/inter/wght.css';
import './styles/index.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { z } from 'zod';
import { App } from './app/app';
import { startErrorMonitoring } from './lib/report-error';

// Zod compiles each schema to JavaScript the first time it parses. Pages here parse each schema
// a few times at most, so the compiling costs more than it saves (it was the longest task on a
// public form's first load); it would also need a content security policy that allows eval.
z.config({ jitless: true });

startErrorMonitoring();

const container = document.getElementById('root');
if (!container) throw new Error('Root element #root not found');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
