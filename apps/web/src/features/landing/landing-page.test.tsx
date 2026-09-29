import { render, screen, within } from '@testing-library/react';
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

  it('sends the primary call to action to the app', () => {
    renderLanding();
    expect(screen.getByRole('link', { name: 'Start building' })).toHaveAttribute('href', '/forms');
    expect(screen.getByRole('link', { name: 'See how it works' })).toHaveAttribute(
      'href',
      '#features',
    );
  });

  it('lists three features', () => {
    renderLanding();
    const features = screen.getByRole('region', { name: /everything you need/i });
    expect(within(features).getAllByRole('listitem')).toHaveLength(3);
  });
});
