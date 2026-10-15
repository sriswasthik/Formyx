import type { AdminFormReview, AdminReviewItem } from '@formyx/shared';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import {
  createTestQueryClient,
  jsonResponse,
  renderWithProviders,
  stubFetch,
} from '@/test/session';
import { ReviewQueue } from './review-queue';

const ITEM: AdminReviewItem = {
  formId: 'form_1',
  title: 'Verify your bank account',
  slug: 'verify-abc12345',
  status: 'UNDER_REVIEW',
  workspace: { id: 'ws_1', name: 'Mallory’s workspace' },
  creator: {
    id: 'user_mallory',
    name: 'Mallory',
    email: 'mallory@example.org',
    createdAt: '2026-10-16T08:00:00.000Z',
    suspended: false,
  },
  heldFor: 'content',
  reasons: ['asks for a password'],
  openReports: 0,
  updatedAt: '2026-10-16T09:00:00.000Z',
};

const REVIEW: AdminFormReview = {
  ...ITEM,
  matches: [
    {
      label: 'asks for a password',
      path: 'fields.0.label',
      excerpt: 'Your net banking password',
    },
  ],
  unsafeLinks: [],
  reports: [],
  questions: ['Your net banking password'],
  history: [],
};

function serve() {
  const posts: { path: string; body: unknown }[] = [];
  stubFetch((path, init) => {
    if (init.method === 'POST') {
      const body: unknown = typeof init.body === 'string' ? JSON.parse(init.body) : null;
      posts.push({ path, body });
      if (path.endsWith('/suspension')) return new Response(null, { status: 204 });
      return jsonResponse({ ...REVIEW, status: 'PUBLISHED', reasons: [], heldFor: null });
    }
    if (path === '/api/admin/review') return jsonResponse({ items: [ITEM] });
    return jsonResponse(REVIEW);
  });
  return posts;
}

describe('ReviewQueue', () => {
  it('shows held forms with what was found, and approves one with a note', async () => {
    const posts = serve();
    renderWithProviders(<ReviewQueue />, createTestQueryClient(null));
    const user = userEvent.setup();

    const list = await screen.findByRole('region', { name: 'Forms to review' });
    expect(within(list).getByText('asks for a password')).toBeInTheDocument();
    // The first is open already.
    const panel = screen.getByRole('region', { name: 'Selected form' });
    expect(await within(panel).findByText('Question 1 · asks for a password')).toBeInTheDocument();
    expect(
      within(panel).getByText('Your net banking password', { selector: 'p' }),
    ).toBeInTheDocument();

    await user.type(
      within(panel).getByRole('textbox', { name: 'Note (optional)' }),
      'A school login',
    );
    await user.click(within(panel).getByRole('button', { name: 'Approve' }));
    expect(await screen.findByText('Approved: the form is live')).toBeInTheDocument();
    expect(posts).toEqual([
      {
        path: '/api/admin/review/form_1',
        body: { action: 'approve', note: 'A school login' },
      },
    ]);
  });

  it('asks before suspending the creator', async () => {
    const posts = serve();
    renderWithProviders(<ReviewQueue />, createTestQueryClient(null));
    const user = userEvent.setup();

    const panel = await screen.findByRole('region', { name: 'Selected form' });
    await user.click(await within(panel).findByRole('button', { name: 'Suspend creator' }));
    const confirm = await screen.findByRole('alertdialog', { name: 'Suspend this account?' });
    expect(posts).toEqual([]);
    await user.click(within(confirm).getByRole('button', { name: 'Suspend' }));
    expect(await screen.findByText('Account suspended')).toBeInTheDocument();
    expect(posts).toEqual([
      { path: '/api/admin/users/user_mallory/suspension', body: { suspended: true } },
    ]);
  });

  it('says when there is nothing to review', async () => {
    stubFetch(() => jsonResponse({ items: [] }));
    renderWithProviders(<ReviewQueue />, createTestQueryClient(null));
    expect(await screen.findByText('Nothing to review')).toBeInTheDocument();
  });
});
