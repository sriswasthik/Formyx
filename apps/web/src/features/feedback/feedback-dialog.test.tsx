import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import {
  createTestQueryClient,
  jsonResponse,
  renderWithProviders,
  requestBody,
  stubFetch,
} from '@/test/session';
import { FeedbackDialog } from './feedback-dialog';

function renderDialog(onOpenChange = vi.fn()) {
  renderWithProviders(
    <MemoryRouter initialEntries={['/app/forms/abc/edit?tab=design']}>
      <FeedbackDialog open onOpenChange={onOpenChange} />
    </MemoryRouter>,
    createTestQueryClient(),
  );
  return onOpenChange;
}

describe('FeedbackDialog', () => {
  it('sends the kind, the message and the page it was sent from', async () => {
    const fetchMock = stubFetch(() => jsonResponse({ id: 'fb_1' }, 201));
    const user = userEvent.setup();
    const onOpenChange = renderDialog();

    await user.click(screen.getByRole('radio', { name: 'A problem' }));
    await user.type(screen.getByLabelText('Your message'), 'The preview is blank');
    await user.click(screen.getByRole('button', { name: 'Send feedback' }));

    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
    expect(requestBody(fetchMock)).toEqual({
      kind: 'problem',
      message: 'The preview is blank',
      page: '/app/forms/abc/edit',
    });
    expect(await screen.findByText('Thanks for the feedback')).toBeInTheDocument();
  });

  it('asks for a message before sending', async () => {
    const fetchMock = stubFetch(() => jsonResponse({ id: 'fb_1' }, 201));
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole('button', { name: 'Send feedback' }));

    expect(await screen.findByText('Write a few words')).toBeInTheDocument();
    expect(screen.getByLabelText('Your message')).toHaveAttribute('aria-invalid', 'true');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
