import { render, screen, within } from '@testing-library/react';
import { createMemoryRouter, MemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { LATEST_CHANGELOG_TITLE } from '@/features/changelog/latest';
import { Hero } from './hero';
import { LandingPage } from './landing-page';

/** The landing page, once every section has come in (they follow the hero one by one). */
async function renderLanding() {
  const router = createMemoryRouter([{ path: '/', element: <LandingPage /> }]);
  render(
    <TooltipProvider>
      <RouterProvider router={router} />
    </TooltipProvider>,
  );
  await screen.findByRole('contentinfo');
}

describe('LandingPage', () => {
  it('has one primary heading, the promise', async () => {
    await renderLanding();
    const headings = screen.getAllByRole('heading', { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent('Build forms people actually enjoy filling in.');
  });

  it('announces the newest changelog entry', async () => {
    await renderLanding();
    expect(screen.getByRole('link', { name: `New ${LATEST_CHANGELOG_TITLE}` })).toHaveAttribute(
      'href',
      '/changelog',
    );
  });

  it('leads to sign-up, templates and log-in', async () => {
    await renderLanding();
    for (const link of screen.getAllByRole('link', { name: 'Start for free' })) {
      expect(link).toHaveAttribute('href', '/signup');
    }
    expect(screen.getAllByRole('link', { name: 'Start for free' })).toHaveLength(2);
    expect(screen.getByRole('link', { name: 'Get started' })).toHaveAttribute('href', '/signup');
    expect(screen.getByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/login');
    expect(screen.getByRole('link', { name: 'Browse templates' })).toHaveAttribute(
      'href',
      '/templates',
    );
    expect(screen.getByText('No credit card required.')).toBeInTheDocument();
  });

  it('says what the trial is, without calling the product free for a month', async () => {
    await renderLanding();
    expect(screen.getByText(/Free to start, with 30 days of Pro\./)).toBeInTheDocument();
  });

  it('shows the editor with a real form in it', async () => {
    await renderLanding();
    // Lazily loaded after the hero: slow on a busy machine.
    expect(
      await screen.findByRole(
        'img',
        { name: 'The Formyx editor, with the Workshop sign-up form in the Sunrise mesh look' },
        { timeout: 10_000 },
      ),
    ).toBeInTheDocument();
  });

  it('holds the editor’s place in the build’s copy of the hero, at its size', () => {
    render(
      <MemoryRouter>
        <Hero framePlaceholder />
      </MemoryRouter>,
    );
    expect(screen.getByRole('status', { name: 'Loading the editor preview' })).toHaveClass(
      'h-[460px]',
    );
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('lists use cases, not customers, each leading to its templates', async () => {
    await renderLanding();
    const strip = screen.getByRole('region', { name: 'Built for' });
    expect(within(strip).getAllByRole('link')).toHaveLength(6);
    expect(within(strip).getByRole('link', { name: 'Job applications' })).toHaveAttribute(
      'href',
      '/templates?category=hr',
    );
  });

  it('lists six features, linking to the ones with their own page', async () => {
    await renderLanding();
    const features = screen.getByRole('region', { name: 'Everything a good form needs' });
    expect(features).toHaveAttribute('id', 'features');
    expect(within(features).getAllByRole('heading', { level: 3 })).toHaveLength(6);
    expect(
      within(features).getByRole('link', { name: 'More about Design Studio' }),
    ).toHaveAttribute('href', '/features/design-studio');
    // Nothing that isn't built.
    expect(features).not.toHaveTextContent(/\bAI\b/);
  });

  it('explains how it works in three steps', async () => {
    await renderLanding();
    const steps = screen.getByRole('region', { name: 'How it works' });
    expect(
      within(steps)
        .getAllByRole('heading', { level: 3 })
        .map((h) => h.textContent),
    ).toEqual(['1Build', '2Share', '3Understand']);
  });

  it('leads to every template', async () => {
    await renderLanding();
    const templates = screen.getByRole('region', { name: 'Start from a template' });
    expect(within(templates).getByRole('link', { name: 'View all templates' })).toHaveAttribute(
      'href',
      '/templates',
    );
    // Six places held while the row loads.
    expect(within(templates).getAllByRole('listitem')).toHaveLength(6);
  });

  it('ends with the footer columns, the legal pages and a theme switch', async () => {
    await renderLanding();
    const footer = screen.getByRole('contentinfo');
    for (const column of ['Product', 'Resources', 'Legal']) {
      expect(within(footer).getByRole('navigation', { name: column })).toBeInTheDocument();
    }
    const legal = within(footer).getByRole('navigation', { name: 'Legal' });
    for (const [name, href] of [
      ['Terms', '/terms'],
      ['Privacy', '/privacy'],
      ['Refund policy', '/refunds'],
      ['Shipping policy', '/shipping'],
    ]) {
      expect(within(legal).getByRole('link', { name })).toHaveAttribute('href', href);
    }
    expect(within(footer).getByRole('radiogroup', { name: 'Theme' })).toBeInTheDocument();
    expect(footer).toHaveTextContent(`© ${String(new Date().getFullYear())} Formyx`);
  });
});
