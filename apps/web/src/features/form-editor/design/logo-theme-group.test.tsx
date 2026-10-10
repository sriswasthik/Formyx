import {
  createDefaultTheme,
  extractPalette,
  hexToRgb,
  suggestThemeFromPalette,
  themeReadabilityIssues,
} from '@formyx/shared';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Toaster } from '@/components/ui/sonner';
import { renderWithEditor } from '../test-utils';
import { LogoThemeGroup } from './logo-theme-group';

/** An orange and teal logo on white, as the canvas would read it. */
const LOGO_PIXELS = new Uint8ClampedArray(
  [
    ...Array.from({ length: 50 }, () => [255, 255, 255, 255]),
    ...Array.from({ length: 30 }, () => [...hexToRgb('#E4572E'), 255]),
    ...Array.from({ length: 10 }, () => [...hexToRgb('#17BEBB'), 255]),
  ].flat(),
);
const LOGO_URL =
  'https://res.cloudinary.com/formyx-test/image/upload/v1/formyx/themes/form_1/a.png';

const uploads = vi.hoisted(() => ({
  getUploadSignature: vi.fn(),
  uploadToStorage: vi.fn(),
}));

vi.mock('./logo-pixels', () => ({
  readImagePixels: vi.fn(() => Promise.resolve(LOGO_PIXELS)),
}));
vi.mock('@/lib/uploads', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  ...uploads,
}));

beforeEach(() => {
  uploads.getUploadSignature.mockResolvedValue({});
  uploads.uploadToStorage.mockResolvedValue({ secure_url: LOGO_URL });
  // jsdom has no object URLs; the preview only needs a string.
  vi.stubGlobal(
    'URL',
    class extends URL {
      static override createObjectURL = () => 'blob:logo';
      static override revokeObjectURL = vi.fn();
    },
  );
});

function logoFile(name = 'logo.png') {
  return new File([new Uint8Array(200)], name, { type: 'image/png' });
}

function renderGroup() {
  const result = renderWithEditor(
    <>
      <LogoThemeGroup />
      <Toaster />
    </>,
  );
  const input = result.container.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error('No file input');
  return { ...result, input };
}

describe('the theme from a logo', () => {
  it('reads the logo’s colours, suggests a look and applies it with the logo', async () => {
    const { user, store, input } = renderGroup();
    await user.upload(input, logoFile());

    const colours = await screen.findByRole('list', { name: 'Colours in your logo' });
    expect(colours).toHaveTextContent('#E4572E');
    expect(colours).toHaveTextContent('#17BEBB');
    expect(await screen.findByText('The logo comes with the look.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Apply this look' }));
    const expected = suggestThemeFromPalette(
      createDefaultTheme(),
      extractPalette(LOGO_PIXELS),
      LOGO_URL,
    );
    expect(store.getState().theme).toEqual(expected);
    expect(themeReadabilityIssues(store.getState().theme)).toEqual([]);
    expect(await screen.findByText('Applied a look from your logo')).toBeInTheDocument();
  });

  it('still offers the colours when the logo cannot be uploaded', async () => {
    uploads.uploadToStorage.mockRejectedValue(new Error('offline'));
    const { user, store, input } = renderGroup();
    await user.upload(input, logoFile());
    expect(await screen.findByText(/The logo could not be uploaded/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Apply this look' }));
    await waitFor(() => {
      expect(store.getState().theme.colors.primary).not.toBe(createDefaultTheme().colors.primary);
    });
    expect(store.getState().theme.branding.logoUrl).toBeUndefined();
  });

  it('turns away files that are not images it can use', async () => {
    const { input } = renderGroup();
    // The picker offers images only; a file dropped past it is still checked.
    await userEvent.setup({ applyAccept: false }).upload(input, logoFile('logo.svg'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Choose a PNG, JPG, WebP or GIF');
  });
});
