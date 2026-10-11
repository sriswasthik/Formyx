import { createDefaultLogic, createEndScreen, type FormLogic } from '@formyx/shared';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DropOffCard } from './summary/drop-off-card';
import { ResponseOutcome } from './table/response-outcome';

const base = createDefaultLogic();
const logic: FormLogic = {
  ...base,
  variables: [
    { id: 'total', name: 'Total', kind: 'price', initial: 0, currency: 'INR' },
    { id: 'points', name: 'Points', kind: 'score', initial: 0 },
  ],
  quiz: { enabled: true, answers: {}, passPercent: 50, showScore: true, revealAnswers: false },
  endScreens: [...base.endScreens, createEndScreen({ id: 'passed', name: 'Passed' })],
};

describe('DropOffCard', () => {
  it('shows how many reached each step and marks the biggest drop', () => {
    render(
      <DropOffCard
        dropOff={{
          unit: 'page',
          started: 10,
          steps: [
            { key: 'start', label: 'About you', reached: 10 },
            { key: 'p2', label: 'Your order', reached: 4 },
          ],
          completed: 3,
        }}
      />,
    );
    expect(screen.getByText(/The biggest drop is before/)).toHaveTextContent(
      'The biggest drop is before Your order: 6 visits left.',
    );
    const steps = within(screen.getByRole('list', { name: 'Visits reaching each step' }));
    expect(steps.getByText('Your order').closest('li')).toHaveAttribute(
      'data-biggest-drop',
      'true',
    );
    expect(steps.getByText('Sent a response').closest('li')).toHaveTextContent('30%');
  });

  it('says when nothing has been counted yet', () => {
    render(<DropOffCard dropOff={{ unit: 'question', started: 0, steps: [], completed: 0 }} />);
    expect(screen.getByText(/No visits counted yet/)).toBeInTheDocument();
  });
});

describe('ResponseOutcome', () => {
  it('shows the end screen, quiz mark and values the server worked out', () => {
    render(
      <ResponseOutcome
        logic={logic}
        outcome={{
          endScreenId: 'passed',
          values: { total: 1500, points: 7 },
          quiz: { score: 8, max: 10, percent: 80, passed: true },
        }}
      />,
    );
    const outcome = screen.getByRole('region', { name: 'Outcome' });
    expect(outcome).toHaveTextContent('End screenPassed');
    expect(outcome).toHaveTextContent('Quiz score8 out of 10 (80%), passed');
    expect(outcome).toHaveTextContent('Total₹1,500');
    expect(outcome).toHaveTextContent('Points7');
  });

  it('shows nothing for responses from before outcomes were kept', () => {
    const { container } = render(<ResponseOutcome logic={logic} outcome={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
