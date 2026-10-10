import { createDefaultTheme, type FormTheme } from '@formyx/shared';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FormProgress, MAX_STEP_SEGMENTS } from './form-progress';

const base = createDefaultTheme();

function withProgress(style: FormTheme['layout']['progress']['style']): FormTheme {
  return { ...base, layout: { ...base.layout, progress: { style, position: 'top' } } };
}

describe('FormProgress', () => {
  it('shows nothing when the theme has no progress bar, or there is nothing to count', () => {
    const { container } = render(<FormProgress theme={withProgress('none')} value={1} total={4} />);
    expect(container).toBeEmptyDOMElement();
    render(<FormProgress theme={withProgress('line')} value={0} total={0} />);
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('reports how far along respondents are, whatever it looks like', () => {
    render(<FormProgress theme={withProgress('line')} value={1} total={4} />);
    const bar = screen.getByRole('progressbar', { name: 'Progress' });
    expect(bar).toHaveAttribute('aria-valuenow', '25');
    expect(bar).toHaveAttribute('aria-valuetext', '25% complete');
  });

  it('writes the percentage when the theme asks for it', () => {
    render(<FormProgress theme={withProgress('percentage')} value={2} total={3} />);
    expect(screen.getByText('67%')).toBeInTheDocument();
  });

  it('draws one segment per step, up to a limit, lighting the current one', () => {
    const { container, rerender } = render(
      <FormProgress theme={withProgress('steps')} value={1} total={5} current={1} />,
    );
    const segments = container.querySelectorAll('[data-step-segment]');
    expect(segments).toHaveLength(5);
    expect(segments[1]?.className).toContain('bg-(--form-accent)');
    expect(segments[2]?.className).not.toContain('bg-(--form-accent)');
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuetext', 'Question 2 of 5');

    rerender(
      <FormProgress theme={withProgress('steps')} value={1} total={MAX_STEP_SEGMENTS + 1} />,
    );
    expect(container.querySelectorAll('[data-step-segment]')).toHaveLength(0);
  });
});
