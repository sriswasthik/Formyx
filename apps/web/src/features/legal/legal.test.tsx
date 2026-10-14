import { TRIAL_DAYS } from '@formyx/shared';
import { screen, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { createTestQueryClient, renderWithProviders } from '@/test/session';
import { ContactPage } from './contact-page';
import { PrivacyPage, RefundsPage, ShippingPage, TermsPage } from './policies';
import { placeholders, SITE } from './site-config';

function renderPage(page: ReactElement) {
  renderWithProviders(<MemoryRouter>{page}</MemoryRouter>, createTestQueryClient(null));
}

describe('site config', () => {
  it('has only the placeholders left for the owner to fill in', () => {
    // Fill these in before launch (docs/launch-checklist.md), then remove them from this list.
    expect(placeholders()).toEqual(['legalName', 'address', 'courts']);
  });
});

describe('policies', () => {
  it.each([
    ['Terms of service', TermsPage],
    ['Privacy policy', PrivacyPage],
    ['Refund and cancellation policy', RefundsPage],
    ['Shipping and delivery policy', ShippingPage],
  ])(
    '%s has a title, a date, a contents list that links to each section, and the contact',
    (title, Page) => {
      renderPage(<Page />);
      expect(screen.getByRole('heading', { level: 1, name: title })).toBeInTheDocument();
      expect(screen.getByText(/Last updated/)).toBeInTheDocument();
      const contents = screen.getByRole('navigation', { name: 'On this page' });
      for (const link of within(contents).getAllByRole('link')) {
        const id = link.getAttribute('href')?.slice(1) ?? '';
        expect(document.getElementById(id)).toHaveAccessibleName(link.textContent);
      }
      expect(screen.getAllByRole('link', { name: SITE.contactEmail }).length).toBeGreaterThan(0);
    },
  );

  it('states the trial and the refund window from their sources', () => {
    renderPage(<RefundsPage />);
    expect(screen.getByText(new RegExp(`${String(TRIAL_DAYS)} days of Pro`))).toBeInTheDocument();
    expect(
      screen.getByText(new RegExp(`within ${String(SITE.refundWindowDays)} days`)),
    ).toBeInTheDocument();
  });
});

describe('ContactPage', () => {
  it('gives the email, reply time and postal address', () => {
    renderPage(<ContactPage />);
    expect(screen.getAllByRole('link', { name: SITE.contactEmail })[0]).toHaveAttribute(
      'href',
      `mailto:${SITE.contactEmail}`,
    );
    expect(screen.getByText(new RegExp(SITE.replyWithin))).toBeInTheDocument();
    expect(screen.getByText(/Registered address/)).toBeInTheDocument();
  });
});
