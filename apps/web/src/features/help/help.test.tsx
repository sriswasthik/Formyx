import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { createTestQueryClient, renderWithProviders } from '@/test/session';
import { HELP_ARTICLES, HELP_CATEGORIES, helpArticle, searchHelp } from './articles';
import { HelpArticlePage } from './help-article-page';
import { HelpCentrePage } from './help-centre-page';
import { contextualHelp } from './help-context';
import { HelpMenu } from './help-menu';

function renderAt(path: string) {
  const router = createMemoryRouter(
    [
      { path: 'help', element: <HelpCentrePage /> },
      { path: 'help/:slug', element: <HelpArticlePage /> },
      { path: 'app/forms/:formId/edit', element: <HelpMenu variant="icon" /> },
      { path: 'app/settings/billing', element: <HelpMenu variant="sidebar" /> },
      { path: 'app/*', element: <HelpMenu variant="sidebar" /> },
    ],
    { initialEntries: [path] },
  );
  renderWithProviders(<RouterProvider router={router} />, createTestQueryClient(null));
  return { router, user: userEvent.setup() };
}

describe('the articles', () => {
  it('have unique slugs, a summary that fits search results, and fill every topic', () => {
    expect(new Set(HELP_ARTICLES.map((article) => article.slug)).size).toBe(HELP_ARTICLES.length);
    for (const article of HELP_ARTICLES) {
      expect(article.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(article.summary.length).toBeLessThanOrEqual(160);
      expect(article.body.length).toBeGreaterThan(0);
    }
    for (const category of HELP_CATEGORIES) {
      expect(HELP_ARTICLES.some((article) => article.category === category.id)).toBe(true);
    }
  });

  it('are found by any of their words, titles first', () => {
    expect(searchHelp('embed').map((article) => article.slug)).toContain('publish-and-share');
    expect(searchHelp('google sheets')[0]?.slug).toBe('google-sheets-and-notion');
    expect(searchHelp('QUIZ')[0]?.slug).toBe('quizzes');
    expect(searchHelp('zebra')).toEqual([]);
    expect(searchHelp('  ')).toHaveLength(HELP_ARTICLES.length);
  });

  it('cover every page the "?" menu points to', () => {
    for (const path of [
      '/app/forms',
      '/app/forms/f1/edit',
      '/app/forms/f1/responses',
      '/app/forms/f1/integrations',
      '/app/forms/f1/settings',
      '/app/settings/billing',
      '/app/settings/workspace',
      '/app/settings/referrals',
    ]) {
      const slugs = contextualHelp(path);
      expect(slugs.length).toBeGreaterThan(0);
      for (const slug of slugs) expect(helpArticle(slug)).toBeDefined();
    }
    expect(contextualHelp('/pricing')).toEqual([]);
  });
});

describe('HelpCentrePage', () => {
  it('lists articles by topic, and searches them from the URL', async () => {
    const { router, user } = renderAt('/help');
    expect(screen.getByRole('heading', { level: 1, name: 'Help centre' })).toBeInTheDocument();
    expect(
      within(screen.getByRole('region', { name: 'Integrations' })).getByRole('link', {
        name: /Send responses to Google Sheets or Notion/,
      }),
    ).toHaveAttribute('href', '/help/google-sheets-and-notion');

    await user.type(screen.getByRole('searchbox', { name: 'Search help articles' }), 'quiz');
    expect(router.state.location.search).toBe('?q=quiz');
    expect(screen.getByRole('heading', { name: /articles? for “quiz”/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Make a quiz/ })).toBeInTheDocument();
  });

  it('offers a person when nothing matches', () => {
    renderAt('/help?q=zebra');
    expect(screen.getByText('Nothing matches that')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Contact us' })[0]).toHaveAttribute(
      'href',
      '/contact',
    );
  });
});

describe('HelpArticlePage', () => {
  it('shows the article with its steps and related ones', () => {
    renderAt('/help/publish-and-share');
    expect(
      screen.getByRole('heading', { level: 1, name: 'Publish and share a form' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/press Publish at the top right/)).toBeInTheDocument();
    expect(
      within(screen.getByRole('region', { name: 'Related' })).getAllByRole('link').length,
    ).toBeGreaterThan(0);
  });

  it('is not found for an unknown slug', () => {
    renderAt('/help/nope');
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
  });
});

describe('HelpMenu', () => {
  it('offers the articles for the page in use, the help centre and shortcuts', async () => {
    const { user } = renderAt('/app/forms/f1/edit');
    await user.click(screen.getByRole('button', { name: 'Help' }));
    const menu = await screen.findByRole('menu');
    expect(within(menu).getByRole('menuitem', { name: 'Design your form' })).toHaveAttribute(
      'href',
      '/help/design-studio',
    );
    expect(within(menu).getByRole('menuitem', { name: /Help centre/ })).toHaveAttribute(
      'target',
      '_blank',
    );
    await user.click(within(menu).getByRole('menuitem', { name: 'Keyboard shortcuts' }));
    const dialog = await screen.findByRole('dialog', { name: 'Keyboard shortcuts' });
    expect(within(dialog).getByText('Undo')).toBeInTheDocument();
  });

  it('leaves out page help where there is none', async () => {
    const { user } = renderAt('/app/admin');
    await user.click(screen.getByRole('button', { name: 'Help' }));
    const menu = await screen.findByRole('menu');
    expect(within(menu).queryByText('Help with this page')).not.toBeInTheDocument();
  });
});
