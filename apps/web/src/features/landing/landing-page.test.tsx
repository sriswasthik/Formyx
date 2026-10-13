import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { LandingPage } from './landing-page';

function renderLanding() {
  const router = createMemoryRouter([{ path: '/', element: <LandingPage /> }]);
  return render(
    <TooltipProvider>
      <RouterProvider router={router} />
    </TooltipProvider>,
  );
}

describe('LandingPage', () => {
  it('has a single primary heading', () => {
    renderLanding();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('sends the primary call to action to sign up', () => {
    renderLanding();
    expect(screen.getByRole('link', { name: 'Start building' })).toHaveAttribute('href', '/signup');
    expect(screen.getByRole('link', { name: 'Get started' })).toHaveAttribute('href', '/signup');
    expect(screen.getAllByRole('link', { name: 'Log in' })[0]).toHaveAttribute('href', '/login');
    expect(screen.getByRole('link', { name: 'See how it works' })).toHaveAttribute(
      'href',
      '#features',
    );
  });

  it('lists the features, linking to the ones with their own page', () => {
    renderLanding();
    const features = screen.getByRole('region', { name: /everything you need/i });
    expect(within(features).getAllByRole('listitem')).toHaveLength(6);
    expect(within(features).getByRole('link', { name: 'More about Logic' })).toHaveAttribute(
      'href',
      '/features/logic',
    );
  });

  it('has a working demo form whose look can be changed', async () => {
    const user = userEvent.setup();
    renderLanding();
    const demo = await screen.findByRole('region', { name: 'Try Formyx' });
    expect(within(demo).getByRole('radio', { name: 'Sunrise mesh' })).toBeChecked();
    await user.click(within(demo).getByRole('radio', { name: 'Midnight' }));
    expect(within(demo).getByRole('radio', { name: 'Midnight' })).toBeChecked();
    expect(
      within(demo).getByRole('heading', { level: 2, name: 'Workshop sign-up' }),
    ).toBeInTheDocument();
  });

  it('leads to templates by category, and to pricing from the registry', () => {
    renderLanding();
    const templates = screen.getByRole('region', { name: /templates/i });
    expect(within(templates).getByRole('link', { name: 'Quizzes' })).toHaveAttribute(
      'href',
      '/templates?category=quizzes',
    );
    const pricing = screen.getByRole('region', { name: /free to start/i });
    expect(pricing).toHaveTextContent('₹299 a month');
    expect(within(pricing).getByRole('link', { name: 'Compare plans' })).toHaveAttribute(
      'href',
      '/pricing',
    );
  });
});
