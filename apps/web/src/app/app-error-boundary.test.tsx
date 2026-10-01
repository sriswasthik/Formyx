import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AppErrorBoundary } from './app-error-boundary';
import { isStaleBuildError } from './stale-build';

function Throws({ error }: { error: Error }): never {
  throw error;
}

function renderCrash(error: Error) {
  // React and the boundary report the error to the console; the screen is what matters here.
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  render(
    <AppErrorBoundary>
      <Throws error={error} />
    </AppErrorBoundary>,
  );
}

describe('AppErrorBoundary', () => {
  it('replaces a crashed page with a way out', () => {
    renderCrash(new Error('Cannot read properties of undefined'));

    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong');
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go home' })).toHaveAttribute('href', '/');
  });

  it('says so when a new version replaced the page’s code', () => {
    renderCrash(
      new TypeError(
        'Failed to fetch dynamically imported module: https://formyx.app/assets/editor-page-Ab12.js',
      ),
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Formyx has been updated');
    expect(screen.getByRole('alert')).toHaveTextContent(/everything you saved is safe/);
  });
});

describe('isStaleBuildError', () => {
  it.each([
    'Failed to fetch dynamically imported module: /assets/x.js',
    'Importing a module script failed.',
    'error loading dynamically imported module: /assets/x.js',
    'Unable to preload CSS for /assets/x.css',
  ])('recognises %j', (message) => {
    expect(isStaleBuildError(new Error(message))).toBe(true);
  });

  it('leaves other errors alone', () => {
    expect(isStaleBuildError(new Error('Network request failed'))).toBe(false);
    expect(isStaleBuildError('Failed to fetch dynamically imported module')).toBe(false);
  });
});
