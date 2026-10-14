import { screen, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { createTestQueryClient, renderWithProviders } from '@/test/session';
import { FEATURE_PAGE_LINKS } from './feature-links';
import { DesignStudioPage, IntegrationsPage, LogicPage } from './feature-pages';

function renderPage(page: ReactElement) {
  renderWithProviders(<MemoryRouter>{page}</MemoryRouter>, createTestQueryClient(null));
}

describe('feature pages', () => {
  it('Design Studio has one heading, a working form to restyle, and what it does', async () => {
    renderPage(<DesignStudioPage />);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    const demo = await screen.findByRole('region', { name: 'Try Formyx' });
    expect(within(demo).getByRole('radio', { name: 'Pastel blobs' })).toBeInTheDocument();
    expect(within(demo).queryByRole('radio', { name: 'Confetti party' })).not.toBeInTheDocument();
    const points = screen.getByRole('region', { name: 'Everything the Studio does' });
    // Mesh gradients need Pro, from the entitlement registry.
    const mesh = within(points).getByRole('heading', { name: 'Mesh gradients' }).closest('li');
    expect(mesh).toHaveTextContent('Pro');
    const fonts = within(points).getByRole('heading', { name: 'Fonts that fit' }).closest('li');
    expect(fonts).not.toHaveTextContent('Pro');
  });

  it('Logic shows rules as sentences, marking the paid ones', () => {
    renderPage(<LogicPage />);
    const rules = screen.getByRole('figure');
    const items = within(rules).getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('Show Dietary needs when Staying for dinner? is Yes');
    expect(items[0]).not.toHaveTextContent('Pro');
    expect(items[1]).toHaveTextContent('Pro');
  });

  it('Integrations lists each service, and links to the other feature pages', () => {
    renderPage(<IntegrationsPage />);
    for (const name of ['Google Sheets', 'Notion', 'Slack', 'Discord', 'Webhooks']) {
      expect(screen.getByRole('heading', { name })).toBeInTheDocument();
    }
    const more = screen.getByRole('navigation', { name: 'More features' });
    expect(
      within(more)
        .getAllByRole('link')
        .map((link) => link.getAttribute('href')),
    ).toEqual(
      FEATURE_PAGE_LINKS.filter((link) => link.path !== '/features/integrations').map(
        (link) => link.path,
      ),
    );
  });
});
