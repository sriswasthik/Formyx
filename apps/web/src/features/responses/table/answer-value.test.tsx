import { createField, type FileAnswer } from '@formyx/shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AnswerCell, AnswerDetail } from './answer-value';

const cvField = { ...createField('file'), label: 'Your CV' };
const cv: FileAnswer = {
  url: 'https://res.cloudinary.com/formyx-test/raw/upload/v1/formyx/forms/f/q/x_cv.pdf',
  publicId: 'formyx/forms/f/q/x_cv.pdf',
  name: 'cv.pdf',
  size: 1_468_006,
  type: 'application/pdf',
};

describe('file answers', () => {
  it('link to the file in a new tab, with its size', () => {
    render(<AnswerDetail field={cvField} value={cv} />);

    const link = screen.getByRole('link', { name: 'Download cv.pdf, 1.4 MB' });
    expect(link).toHaveAttribute('href', cv.url);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('download from the table without opening the response', async () => {
    const openRow = vi.fn();
    render(
      // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- stands in for a table row
      <div onClick={openRow}>
        <AnswerCell field={cvField} value={cv} />
      </div>,
    );
    const link = screen.getByRole('link', { name: 'Download cv.pdf, 1.4 MB' });
    // jsdom cannot open tabs.
    link.addEventListener('click', (event) => {
      event.preventDefault();
    });

    await userEvent.click(link);

    expect(openRow).not.toHaveBeenCalled();
  });

  it('show the name alone for answers from before files were stored', () => {
    render(<AnswerDetail field={cvField} value="old-cv.pdf" />);
    expect(screen.getByText('old-cv.pdf')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
