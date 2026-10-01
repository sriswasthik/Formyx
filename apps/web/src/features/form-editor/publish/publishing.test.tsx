import { createField, type FormDetail } from '@formyx/shared';
import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { installFakeServer, renderEditorPage } from '../test-server';
import { makeFormDetail } from '../test-utils';

vi.mock('qrcode', () => ({
  toDataURL: vi.fn(() => Promise.resolve('data:image/png;base64,UVI=')),
}));

const named = { ...createField('short_text'), label: 'Your name' };

function publishedForm(): FormDetail {
  const form = makeFormDetail([named]);
  return {
    ...form,
    status: 'PUBLISHED',
    publishedSchema: form.draftSchema,
    publishedTitle: form.title,
    publishedTheme: form.theme,
    publishedAt: new Date().toISOString(),
  };
}

const publicLink = `${window.location.origin}/f/customer-survey-abc12345`;

describe('publishing from the editor', () => {
  it('publishes the form and shares its link and QR code', async () => {
    const server = installFakeServer(makeFormDetail([named]));
    const { user } = renderEditorPage();

    await user.click(await screen.findByRole('button', { name: 'Publish' }));

    const dialog = await screen.findByRole('dialog', { name: 'Your form is live' });
    expect(server.actions).toEqual(['publish:1']);
    expect(within(dialog).getByRole('textbox', { name: 'Public link' })).toHaveValue(publicLink);
    expect(within(dialog).getByRole('button', { name: 'Copy link' })).toHaveFocus();
    expect(within(dialog).getByRole('link', { name: 'Open in new tab' })).toHaveAttribute(
      'href',
      publicLink,
    );
    expect(await within(dialog).findByRole('img', { name: /QR code/ })).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: 'Download PNG' })).toHaveAttribute(
      'download',
      'customer-survey-abc12345-qr-code.png',
    );

    await user.click(within(dialog).getByRole('button', { name: 'Copy link' }));
    expect(await navigator.clipboard.readText()).toBe(publicLink);
    expect(await within(dialog).findByRole('button', { name: 'Copied' })).toBeInTheDocument();
    expect(within(dialog).getByRole('status')).toHaveTextContent('Link copied');

    await user.click(within(dialog).getByRole('button', { name: 'Done' }));
    // Nothing left to publish, so the button shares instead, and focus is back on it.
    const shareButton = await screen.findByRole('button', { name: 'Share' });
    await waitFor(() => {
      expect(shareButton).toHaveFocus();
    });
  });

  it('saves the latest edits before publishing them', async () => {
    const server = installFakeServer(makeFormDetail([named]));
    const { user } = renderEditorPage();

    const title = await screen.findByRole('textbox', { name: 'Form title' });
    await user.type(title, ' 2026');
    await user.click(screen.getByRole('button', { name: 'Publish' }));

    await screen.findByRole('dialog', { name: 'Your form is live' });
    expect(server.patches).toHaveLength(1);
    expect(server.actions).toEqual(['publish:2']);
    expect(server.form.publishedTitle).toBe('Customer survey 2026');
  });

  it('lists what to finish first, and points out each problem', async () => {
    const server = installFakeServer(
      makeFormDetail([named, { ...createField('dropdown'), options: [] }]),
    );
    const { user } = renderEditorPage();

    await user.click(await screen.findByRole('button', { name: 'Publish' }));

    const dialog = await screen.findByRole('dialog', { name: 'Finish the form to publish it' });
    expect(
      within(dialog).getByText('2 things need fixing before respondents can see it.'),
    ).toBeInTheDocument();
    const items = within(within(dialog).getByRole('list')).getAllByRole('listitem');
    expect(items.map((item) => within(item).getByRole('button').textContent)).toEqual([
      'Question 2: Untitled question Write the question',
      'Question 2: Untitled question Add at least one option',
    ]);
    expect(server.actions).toEqual([]);

    const [first] = items;
    if (!first) throw new Error('Nothing listed');
    await user.click(within(first).getByRole('button'));

    await waitFor(() => {
      expect(dialog).not.toBeInTheDocument();
    });
    expect(screen.getByRole('heading', { name: 'Dropdown' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Question' })).toHaveAccessibleDescription(
      'Write the question',
    );
    expect(screen.getByText('Add at least one option')).toBeInTheDocument();

    // Fixed problems stop being pointed out.
    await user.type(screen.getByRole('textbox', { name: 'Question' }), 'Country');
    expect(screen.getByRole('textbox', { name: 'Question' })).not.toHaveAccessibleDescription(
      'Write the question',
    );
  });

  it('shows unpublished changes once a live form is edited, and publishes them', async () => {
    const server = installFakeServer(publishedForm());
    const { user } = renderEditorPage();

    expect(await screen.findByRole('button', { name: 'Share' })).toBeInTheDocument();
    expect(screen.queryByText('Unpublished changes')).not.toBeInTheDocument();

    await user.type(screen.getByRole('textbox', { name: 'Form title' }), '!');
    expect(screen.getByText('Unpublished changes')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Publish changes' }));

    expect(await screen.findByText('Changes published')).toBeInTheDocument();
    expect(server.form.publishedTitle).toBe('Customer survey!');
    expect(screen.queryByText('Unpublished changes')).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('counts undoing back to the published version as no change', async () => {
    installFakeServer(publishedForm());
    const { user } = renderEditorPage();

    await user.type(await screen.findByRole('textbox', { name: 'Form title' }), '!');
    expect(screen.getByText('Unpublished changes')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.queryByText('Unpublished changes')).not.toBeInTheDocument();
  });

  it('counts a new look as an unpublished change', async () => {
    installFakeServer(publishedForm());
    const { user } = renderEditorPage();

    await user.click(await screen.findByRole('tab', { name: 'Design' }));
    await user.click(screen.getByRole('radio', { name: 'Teal' }));

    expect(screen.getByText('Unpublished changes')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Publish changes' })).toBeInTheDocument();
  });

  it('closes a live form and reopens it', async () => {
    const server = installFakeServer(publishedForm());
    const { user } = renderEditorPage();

    // With nothing to publish, the button names the form's state and holds its options.
    await user.click(await screen.findByRole('button', { name: 'Published: publishing options' }));
    expect(screen.getByRole('menuitem', { name: 'Open public form' })).toHaveAttribute(
      'href',
      '/f/customer-survey-abc12345',
    );
    await user.click(screen.getByRole('menuitem', { name: 'Close form' }));

    expect(await screen.findByText('Form closed')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Closed: publishing options' }));
    await user.click(screen.getByRole('menuitem', { name: 'Reopen form' }));

    expect(await screen.findByText('Form reopened')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Published: publishing options' }),
    ).toBeInTheDocument();
    expect(server.actions).toEqual(['close', 'reopen']);
  });
});
