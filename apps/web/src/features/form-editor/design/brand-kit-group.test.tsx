import {
  applyBrandKit,
  brandKitFromTheme,
  createDefaultTheme,
  THEME_PRESETS,
  type BrandKit,
} from '@formyx/shared';
import { QueryClientProvider } from '@tanstack/react-query';
import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Toaster } from '@/components/ui/sonner';
import { createTestQueryClient, jsonResponse, stubFetch } from '@/test/session';
import { EditorWorkspaceContext } from '../editor-workspace';
import { makeFormDetail, renderWithEditor } from '../test-utils';
import { PresetsSection } from './sections/presets-section';

const paper = THEME_PRESETS.find((preset) => preset.id === 'paper');
if (!paper) throw new Error('No Paper preset');

const acme: BrandKit = {
  id: 'kit_acme',
  name: 'Acme',
  kit: brandKitFromTheme(paper.theme),
  createdAt: '2026-10-10T08:00:00.000Z',
  updatedAt: '2026-10-10T08:00:00.000Z',
};

function serve(kits: BrandKit[]) {
  const posted: unknown[] = [];
  stubFetch((path, init) => {
    const method = init.method ?? 'GET';
    const body = typeof init.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined;
    if (path.endsWith('/brand-kits') && method === 'GET') {
      return jsonResponse({ brandKits: kits, defaultBrandKitId: null });
    }
    posted.push({ method, path, body });
    if (path.endsWith('/brand-kits') && method === 'POST') {
      return jsonResponse({ ...acme, id: 'kit_new', ...(body as object) }, 201);
    }
    if (path.endsWith('/default-brand-kit')) {
      return jsonResponse({ brandKits: kits, defaultBrandKitId: 'kit_new' });
    }
    return jsonResponse({ error: { code: 'NOT_FOUND', message: 'Not found' } }, 404);
  });
  return posted;
}

function renderPresets() {
  return renderWithEditor(
    <QueryClientProvider client={createTestQueryClient()}>
      <EditorWorkspaceContext.Provider value="ws_team">
        <PresetsSection />
        <Toaster />
      </EditorWorkspaceContext.Provider>
    </QueryClientProvider>,
    makeFormDetail(),
  );
}

describe('brand kits in the Design Studio', () => {
  it('applies a kit in one click and shows it as applied', async () => {
    serve([acme]);
    const { user, store } = renderPresets();
    const list = await screen.findByRole('list', { name: 'Brand kits' });
    const button = within(list).getByRole('button', { name: /Acme/ });
    expect(button).toHaveAttribute('aria-pressed', 'false');

    await user.click(button);
    expect(store.getState().theme).toEqual(applyBrandKit(createDefaultTheme(), acme.kit));
    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(await screen.findByText('Applied Acme')).toBeInTheDocument();
  });

  it('saves this form’s look as a kit, and as the default when asked', async () => {
    const posted = serve([]);
    const { user, store } = renderPresets();
    expect(await screen.findByText('No brand kits in this workspace yet.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Save as brand kit' }));
    await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Launch');
    await user.click(screen.getByRole('checkbox', { name: 'Use for new forms' }));
    await user.click(screen.getByRole('button', { name: 'Save kit' }));

    await waitFor(() => {
      expect(posted).toHaveLength(2);
    });
    expect(posted).toEqual([
      {
        method: 'POST',
        path: '/api/workspaces/ws_team/brand-kits',
        body: { name: 'Launch', kit: brandKitFromTheme(store.getState().theme) },
      },
      {
        method: 'PUT',
        path: '/api/workspaces/ws_team/default-brand-kit',
        body: { brandKitId: 'kit_new' },
      },
    ]);
    expect(await screen.findByText('Saved Launch')).toBeInTheDocument();
  });
});
