import { FEATURES, UNLISTED_FEATURES } from '@formyx/shared';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { createTestQueryClient, renderWithProviders } from '@/test/session';
import { PricingPage } from './pricing-page';

function renderPage() {
  renderWithProviders(
    <MemoryRouter>
      <PricingPage />
    </MemoryRouter>,
    createTestQueryClient(null),
  );
}

describe('PricingPage', () => {
  it('shows monthly prices, and yearly ones with what they save', async () => {
    const user = userEvent.setup();
    renderPage();
    const plans = screen.getByRole('region', { name: 'Plans' });
    expect(within(plans).getByText('₹299')).toBeInTheDocument();
    expect(within(plans).getByText('₹999')).toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: /Yearly/ }));
    expect(within(plans).getByText('₹2,990')).toBeInTheDocument();
    expect(within(plans).getByText('₹249 a month, saving ₹598')).toBeInTheDocument();
  });

  it('compares the plans from the registry, without what isn’t built', () => {
    renderPage();
    const table = screen.getByRole('table', { name: 'What each plan includes' });
    expect(within(table).getByRole('rowheader', { name: /Premium fonts/ })).toBeInTheDocument();
    for (const featureId of UNLISTED_FEATURES) {
      expect(within(table).queryByText(FEATURES[featureId].name)).not.toBeInTheDocument();
    }
    const responses = within(table).getByRole('row', { name: /Responses per month/ });
    expect(
      within(responses)
        .getAllByRole('cell')
        .map((cell) => cell.textContent),
    ).toEqual(['100', '10,000', 'Unlimited']);
  });

  it('answers the common questions', () => {
    renderPage();
    expect(screen.getByText('Do I need a card to start?')).toBeInTheDocument();
    expect(screen.getByText('What happens to my forms if I go back to Free?')).toBeInTheDocument();
  });
});
