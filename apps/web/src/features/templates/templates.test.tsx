import { TEMPLATE_CATEGORIES } from '@formyx/shared';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router';
import { describe, expect, it } from 'vitest';
import { createTestQueryClient, renderWithProviders } from '@/test/session';
import { GALLERY, gallerySlug, templateAppPath } from './gallery';
import { TemplatePage } from './template-page';
import { TemplatesPage } from './templates-page';

function SignupStub() {
  const state: unknown = useLocation().state;
  return <p>Sign up, then {JSON.stringify(state)}</p>;
}

function renderAt(path: string) {
  const router = createMemoryRouter(
    [
      { path: 'templates', element: <TemplatesPage /> },
      { path: 'templates/:slug', element: <TemplatePage /> },
      { path: 'signup', element: <SignupStub /> },
    ],
    { initialEntries: [path] },
  );
  renderWithProviders(<RouterProvider router={router} />, createTestQueryClient(null));
  return { router, user: userEvent.setup() };
}

describe('the gallery data', () => {
  it('has 30 or more templates, each with a unique slug, a category and questions', () => {
    expect(GALLERY.length).toBeGreaterThanOrEqual(30);
    expect(new Set(GALLERY.map((template) => template.slug)).size).toBe(GALLERY.length);
    for (const template of GALLERY) {
      expect(template.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(template.category).not.toBeNull();
      expect(template.questions.length).toBeGreaterThan(0);
      // Search results show about 155 characters.
      expect(template.seoDescription.length).toBeLessThanOrEqual(160);
    }
  });

  it('fills every category', () => {
    for (const category of TEMPLATE_CATEGORIES) {
      expect(GALLERY.some((template) => template.category === category)).toBe(true);
    }
  });

  it('finds templates by slug, and leads into the app to use them', () => {
    expect(gallerySlug('wedding-rsvp')?.id).toBe('wedding_rsvp');
    expect(gallerySlug('nope')).toBeUndefined();
    expect(templateAppPath({ id: 'wedding_rsvp' })).toBe('/app/forms?template=wedding_rsvp');
  });
});

/** The category sections shown, by id. */
const categoryRegions = () =>
  screen
    .getAllByRole('region')
    .map((region) => region.getAttribute('aria-labelledby'))
    .filter((id) => id?.startsWith('category-'));

describe('TemplatesPage', () => {
  it('lists every template under its category, each linking to its own page', () => {
    renderAt('/templates');
    expect(screen.getByRole('heading', { level: 1, name: 'Form templates' })).toBeVisible();
    const events = screen.getByRole('region', { name: 'Events' });
    expect(within(events).getByRole('link', { name: 'Wedding RSVP' })).toHaveAttribute(
      'href',
      '/templates/wedding-rsvp',
    );
    expect(screen.getAllByRole('listitem').length).toBeGreaterThanOrEqual(GALLERY.length);
  });

  it('shows one category from the URL, and marks it', async () => {
    const { user } = renderAt('/templates?category=quizzes');
    expect(categoryRegions()).toEqual(['category-quizzes']);
    const categories = screen.getByRole('navigation', { name: 'Categories' });
    expect(within(categories).getByRole('link', { name: 'Quizzes' })).toHaveAttribute(
      'aria-current',
      'page',
    );

    await user.click(within(categories).getByRole('link', { name: 'All' }));
    expect(screen.getByRole('region', { name: 'Events' })).toBeVisible();
  });

  it('ignores a category it does not know', () => {
    renderAt('/templates?category=nope');
    expect(categoryRegions()).toHaveLength(TEMPLATE_CATEGORIES.length);
  });
});

describe('TemplatePage', () => {
  it('shows the template’s questions and a working preview', async () => {
    const { user } = renderAt('/templates/wedding-rsvp');
    expect(screen.getByRole('heading', { level: 1, name: 'Wedding RSVP template' })).toBeVisible();
    const template = gallerySlug('wedding-rsvp');
    const inside = screen.getByRole('heading', { name: /What’s inside/ });
    expect(inside).toHaveTextContent(`(${template?.questions.length})`);

    const preview = screen.getByRole('region', { name: 'Live preview' });
    expect(within(preview).getByRole('heading', { level: 2 })).toBeVisible();
    await user.click(within(preview).getByRole('button', { name: 'Restart' }));
    expect(within(preview).getByRole('heading', { level: 2 })).toBeVisible();
  });

  it('leads to sign-up, then on to making the form', async () => {
    const { user } = renderAt('/templates/wedding-rsvp');
    await user.click(screen.getByRole('link', { name: 'Use this template' }));
    expect(
      await screen.findByText('Sign up, then {"from":"/app/forms?template=wedding_rsvp"}'),
    ).toBeVisible();
  });

  it('suggests others in the same category', () => {
    renderAt('/templates/wedding-rsvp');
    const related = screen.getByRole('region', { name: 'More in Events' });
    const links = within(related).getAllByRole('link');
    expect(links.length).toBeGreaterThan(0);
    expect(links.length).toBeLessThanOrEqual(3);
    expect(links.map((link) => link.getAttribute('href'))).not.toContain('/templates/wedding-rsvp');
  });

  it('is not found for an unknown slug', () => {
    renderAt('/templates/nope');
    expect(screen.queryByRole('link', { name: 'Use this template' })).not.toBeInTheDocument();
  });
});
