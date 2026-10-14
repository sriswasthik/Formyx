import { LucideProvider } from 'lucide-react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { Hero } from './hero';
import { LandingShell } from './landing-shell';

/**
 * The top of the home page as HTML, for the build to put in its copy of index.html (see
 * build/static-pages.ts): the header and hero paint as soon as the HTML and stylesheet arrive,
 * before any script runs. The app draws the same elements over them once it has loaded.
 * Only the build imports this file.
 */
export function renderHomeShell(): string {
  return renderToString(
    // As the app sets icons up (app.tsx), so they come out the same size.
    <LucideProvider size={16} strokeWidth={1.75}>
      <MemoryRouter>
        <LandingShell>
          <Hero framePlaceholder />
        </LandingShell>
      </MemoryRouter>
    </LucideProvider>,
  );
}
