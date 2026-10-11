import type { QuestionSummary } from '@formyx/shared';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { QuestionSummaryCard } from './question-summary';

function renderCard(summary: QuestionSummary, responses = 10) {
  render(
    <MemoryRouter>
      <QuestionSummaryCard summary={summary} index={1} responses={responses} />
    </MemoryRouter>,
  );
}

const base = { fieldId: 'q', label: 'Question' };

describe('QuestionSummaryCard for newer question types', () => {
  it('shows the Net Promoter Score and its groups', () => {
    // 5 promoters, 2 passives, 3 detractors: 50% - 30% = +20.
    const counts = [1, 0, 0, 0, 0, 0, 2, 1, 1, 2, 3];
    renderCard({ kind: 'nps', ...base, answered: 10, counts });

    expect(screen.getByText('+20')).toBeInTheDocument();
    expect(screen.getByText('Net Promoter Score, from −100 to +100')).toBeInTheDocument();
    expect(screen.getByText('Promoters (9–10)')).toBeInTheDocument();
    expect(screen.getByText('Detractors (0–6)')).toBeInTheDocument();
  });

  it('orders ranking options by their average place', () => {
    renderCard({
      kind: 'ranking',
      ...base,
      answered: 2,
      options: [
        { id: 'a', label: 'Price', rankSum: 5, ranked: 2 },
        { id: 'b', label: 'Speed', rankSum: 2, ranked: 2 },
        { id: 'c', label: 'Support', rankSum: 0, ranked: 0 },
      ],
    });

    const items = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(items.map((item) => item.textContent)).toEqual([
      '1.SpeedAverage place 1',
      '2.PriceAverage place 2.5',
      '3.SupportNot ranked',
    ]);
  });

  it("shows each matrix row's answers as shares of that row", () => {
    renderCard({
      kind: 'matrix',
      ...base,
      answered: 4,
      columns: [
        { id: 'p', label: 'Poor' },
        { id: 'g', label: 'Good' },
      ],
      rows: [
        { id: 'f', label: 'Food', answered: 4, counts: [1, 3] },
        { id: 's', label: 'Service', answered: 2, counts: [2, 0] },
      ],
    });

    const food = screen.getByRole('row', { name: /Food/ });
    expect(
      within(food)
        .getAllByRole('cell')
        .map((cell) => cell.textContent),
    ).toEqual(['25%', '75%']);
    const service = screen.getByRole('row', { name: /Service/ });
    expect(
      within(service)
        .getAllByRole('cell')
        .map((cell) => cell.textContent),
    ).toEqual(['100%', '0%']);
  });

  it('shows an opinion scale average and its labelled ends', () => {
    renderCard({
      kind: 'scale',
      ...base,
      answered: 2,
      start: 1,
      end: 5,
      lowLabel: 'Disagree',
      highLabel: 'Agree',
      counts: [0, 0, 0, 1, 1],
      sum: 9,
    });
    expect(screen.getByText('4.5')).toBeInTheDocument();
    expect(screen.getByText('5 · Agree')).toBeInTheDocument();
    expect(screen.getByText('1 · Disagree')).toBeInTheDocument();
  });

  it('counts hidden field values, most common first', () => {
    renderCard({
      kind: 'values',
      ...base,
      answered: 5,
      values: [
        { value: 'newsletter', count: 1 },
        { value: 'instagram', count: 3 },
      ],
      other: 1,
    });
    const items = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('instagram');
    expect(items[1]).toHaveTextContent('newsletter');
    expect(items[2]).toHaveTextContent('Other values');
  });

  it('writes amounts in their currency', () => {
    renderCard({
      kind: 'number',
      ...base,
      type: 'currency',
      answered: 2,
      sum: 3000,
      min: 1000,
      max: 2000,
      currency: 'INR',
    });
    expect(screen.getByText(/₹\s?1,500/)).toBeInTheDocument();
  });

  it('spaces phone numbers', () => {
    const latest = (value: string, id: string) => ({
      submissionId: id,
      createdAt: '2026-10-11T08:00:00.000Z',
      value,
    });
    renderCard({
      kind: 'text',
      ...base,
      type: 'phone',
      answered: 1,
      latest: [latest('+919876543210', 's1')],
    });
    expect(screen.getByText('+91 98765 43210')).toBeInTheDocument();
  });

  it('only says picks add up past 100% when someone picked several', () => {
    renderCard({
      kind: 'choice',
      ...base,
      type: 'picture_choice',
      answered: 2,
      options: [
        { id: 'r', label: 'Red', count: 1 },
        { id: 'b', label: 'Blue', count: 1 },
      ],
      removed: 0,
    });
    expect(screen.queryByText(/more than 100%/)).not.toBeInTheDocument();
  });
});
