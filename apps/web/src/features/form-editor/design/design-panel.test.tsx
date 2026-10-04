import {
  ACCENT_PRESETS,
  applyPreset,
  createDefaultTheme,
  createField,
  resolveEntitlements,
  THEME_PRESETS,
  type EntitlementsMode,
} from '@formyx/shared';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import {
  describeEntitlements,
  type UseEntitlements,
} from '@/features/entitlements/use-entitlements';
import { fakeSignature, storedFile, stubStorageUploads } from '@/test/fake-storage';
import { jsonResponse, stubFetch } from '@/test/session';
import { EditorCanvas } from '../canvas/editor-canvas';
import { EditorEntitlementsContext } from '../editor-entitlements';
import { useEditorStore } from '../editor-store-context';
import { makeFormDetail, renderWithEditor } from '../test-utils';
import { DesignPanel } from './design-panel';
import { parseHexInput } from './hex';

/** The canvas with the store's live theme, as the editor shows it. */
function Canvas() {
  const theme = useEditorStore((state) => state.theme);
  return <EditorCanvas theme={theme} emptyHint="Empty" />;
}

/** A Free workspace's entitlements in `mode`. */
function freePlan(mode: EntitlementsMode): UseEntitlements {
  return describeEntitlements(
    resolveEntitlements({ plan: 'FREE', planStatus: 'ACTIVE', trialEndsAt: null }, mode),
  );
}

function renderPanel(entitlements?: UseEntitlements) {
  const form = makeFormDetail([{ ...createField('short_text'), label: 'Your name' }]);
  const ui = (
    <>
      <DesignPanel />
      <Canvas />
    </>
  );
  return renderWithEditor(
    entitlements ? (
      <EditorEntitlementsContext.Provider value={entitlements}>
        {ui}
      </EditorEntitlementsContext.Provider>
    ) : (
      ui
    ),
    form,
  );
}

/** The element the canvas applies the theme's variables to. */
function canvasTheme() {
  const heading = screen.getByRole('heading', { level: 2, name: 'Customer survey' });
  const scope = heading.closest<HTMLElement>('[data-form-theme]');
  if (!scope) throw new Error('No themed element');
  return scope.style;
}

function preset(id: string) {
  const found = THEME_PRESETS.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`No preset ${id}`);
  return found;
}

const checkedIn = (group: string) =>
  within(screen.getByRole('radiogroup', { name: group })).queryByRole('radio', { checked: true });

describe('DesignPanel', () => {
  it('changes the accent from a preset, live in the canvas, and undoes in one step', async () => {
    const { user, store } = renderPanel();
    const accents = screen.getByRole('radiogroup', { name: 'Accent colour' });
    expect(within(accents).getAllByRole('radio')).toHaveLength(ACCENT_PRESETS.length);
    expect(within(accents).getByRole('radio', { name: 'Blue' })).toBeChecked();

    await user.click(within(accents).getByRole('radio', { name: 'Rust' }));

    expect(store.getState().theme.colors).toMatchObject({
      primary: '#B1563B',
      buttonText: '#FFFFFF',
    });
    expect(canvasTheme().getPropertyValue('--form-accent')).toBe('#B1563B');
    expect(screen.getByRole('textbox', { name: 'Custom colour' })).toHaveValue('#B1563B');

    store.getState().undo();
    expect(store.getState().theme.colors.primary).toBe('#4370BD');
  });

  it('takes a custom hex colour, and warns when it is hard to see', async () => {
    const { user, store } = renderPanel();
    const hex = screen.getByRole('textbox', { name: 'Custom colour' });

    await user.clear(hex);
    await user.type(hex, 'f4e8a1');

    expect(store.getState().theme.colors.primary).toBe('#F4E8A1');
    expect(checkedIn('Accent colour')).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent(/Low contrast: 1\.\d:1/);
  });

  it('points out a hex that is not one, and keeps the last good colour', async () => {
    const { user, store } = renderPanel();
    const hex = screen.getByRole('textbox', { name: 'Custom colour' });

    await user.clear(hex);
    await user.type(hex, '12zz');
    await user.tab();

    expect(hex).toHaveAccessibleDescription('Use six hex digits, such as 4370BD.');
    expect(hex).toHaveAttribute('aria-invalid', 'true');
    expect(store.getState().theme.colors.primary).toBe('#4370BD');
  });

  it('switches background and corners', async () => {
    const { user, store } = renderPanel();

    await user.click(
      within(screen.getByRole('radiogroup', { name: 'Corners' })).getByRole('radio', {
        name: /Sharp/,
      }),
    );
    await user.click(
      within(screen.getByRole('radiogroup', { name: 'Background' })).getByRole('radio', {
        name: /Dark/,
      }),
    );

    expect(store.getState().theme.components.radius).toBe(0);
    expect(store.getState().theme.colors).toMatchObject({
      containerBackground: '#18181B',
      text: '#FAFAFA',
    });
    const style = canvasTheme();
    expect(style.getPropertyValue('--form-bg')).toBe('#18181B');
    expect(style.getPropertyValue('--form-radius')).toBe('0px');
  });

  it('picks heading and text fonts from the registry, marking Pro ones', async () => {
    const { user, store } = renderPanel();

    await user.click(screen.getByRole('combobox', { name: 'Headings' }));
    expect(screen.getByRole('option', { name: /Fraunces/ })).toHaveTextContent('Pro');
    await user.click(screen.getByRole('option', { name: /Fraunces/ }));
    await user.click(screen.getByRole('combobox', { name: 'Text' }));
    await user.click(screen.getByRole('option', { name: /DM Sans/ }));

    expect(store.getState().theme.typography).toMatchObject({
      headingFont: 'fraunces',
      bodyFont: 'dm-sans',
    });
    expect(canvasTheme().getPropertyValue('--form-heading-font')).toMatch(/^'Fraunces Variable'/);
    expect(canvasTheme().getPropertyValue('--form-body-font')).toMatch(/^'DM Sans Variable'/);
  });

  it('applies a preset in one step, and shows it selected until the look changes', async () => {
    const { user, store, container } = renderPanel();
    const themes = screen.getByRole('radiogroup', { name: 'Theme' });
    expect(within(themes).getByRole('radio', { name: /Minimal/ })).toBeChecked();

    await user.click(within(themes).getByRole('radio', { name: /Sea glass/ }));

    expect(store.getState().theme).toEqual(applyPreset(createDefaultTheme(), preset('sea-glass')));
    expect(container.querySelector('[data-editor-canvas] [data-layer="mesh"]')).not.toBeNull();
    expect(checkedIn('Background')).toBeNull();

    await user.click(
      within(screen.getByRole('radiogroup', { name: 'Accent colour' })).getByRole('radio', {
        name: 'Rust',
      }),
    );
    expect(checkedIn('Theme')).toBeNull();

    store.getState().undo();
    store.getState().undo();
    expect(store.getState().theme).toEqual(createDefaultTheme());
  });

  it('marks Pro presets, and says they are free while everything is unlocked', () => {
    renderPanel(freePlan('all_unlocked'));
    const themes = screen.getByRole('radiogroup', { name: 'Theme' });
    expect(within(themes).getByRole('radio', { name: 'Sea glass Pro' })).toBeInTheDocument();
    expect(within(themes).getByRole('radio', { name: 'Paper' })).toBeInTheDocument();
    expect(screen.getByText('Styles marked Pro are included free during the beta.')).toBeVisible();
  });

  it('lets a Free plan try Pro styles, and says publishing them needs Pro', async () => {
    const { user, store } = renderPanel(freePlan('enforced'));
    expect(screen.queryByText(/free during the beta/)).toBeNull();

    await user.click(
      within(screen.getByRole('radiogroup', { name: 'Theme' })).getByRole('radio', {
        name: /Studio/,
      }),
    );

    expect(store.getState().theme.typography.headingFont).toBe('bricolage-grotesque');
    expect(screen.getByRole('status')).toHaveTextContent(
      'Uses Pro styles (Premium fonts, Premium textures, Custom shapes). Try them here; publishing them needs a Pro plan.',
    );
  });

  it('says nothing about plans until it knows them', () => {
    renderPanel();
    expect(screen.queryByText(/Pro styles|free during the beta/)).toBeNull();
  });

  it('hides the Formyx badge with a switch that explains hiding it is Pro', async () => {
    const { user, store } = renderPanel();
    const toggle = screen.getByRole('switch', { name: 'Show “Made with Formyx”' });
    expect(toggle).toBeChecked();
    expect(toggle).toHaveAccessibleDescription('Pro Hiding it is a Pro feature.');

    await user.click(toggle);

    expect(store.getState().theme.branding.showFormyxBadge).toBe(false);
  });
});

describe('DesignPanel images', () => {
  /** The section for one image, and its (hidden) file input. */
  function imageSection(title: 'Logo' | 'Cover image') {
    const section = screen.getByRole('heading', { name: title }).closest('section');
    const input = section?.querySelector<HTMLInputElement>('input[type="file"]');
    if (!section || !input) throw new Error(`No ${title} section`);
    return { section: within(section), input };
  }

  it('uploads a logo for this form, shows it, and removes it', async () => {
    const fetchMock = stubFetch(() => jsonResponse(fakeSignature('formyx/themes/form_1')));
    stubStorageUploads({ autoRespond: true });
    const { user, store, container } = renderPanel();
    const logo = imageSection('Logo');
    const file = new File(['png'], 'logo.png', { type: 'image/png' });

    await user.click(logo.section.getByRole('button', { name: 'Upload logo' }));
    await user.upload(logo.input, file);

    const expected = storedFile('formyx/themes/form_1', file).secure_url;
    expect(await logo.section.findByRole('img', { name: 'Current logo' })).toHaveAttribute(
      'src',
      expected,
    );
    expect(store.getState().theme.branding.logoUrl).toBe(expected);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/uploads/signature?purpose=logo&formId=form_1');
    // The canvas shows it too, as decoration.
    expect(container.querySelector(`img[alt=""][src="${expected}"]`)).not.toBeNull();

    await user.click(logo.section.getByRole('button', { name: 'Remove' }));
    expect(store.getState().theme.branding).toEqual({ showFormyxBadge: true });
    expect(logo.section.getByRole('button', { name: 'Upload logo' })).toHaveFocus();
  });

  it('turns away files that are not images, before uploading', async () => {
    const fetchMock = stubFetch(() => jsonResponse(fakeSignature('formyx/themes/form_1')));
    const uploads = stubStorageUploads({ autoRespond: true });
    renderPanel();
    const cover = imageSection('Cover image');

    await userEvent
      .setup({ applyAccept: false })
      .upload(cover.input, new File(['%PDF'], 'cover.pdf', { type: 'application/pdf' }));

    expect(cover.section.getByRole('alert')).toHaveTextContent(
      'Choose a PNG, JPG, WebP or GIF image.',
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(uploads).toEqual([]);
  });
});

describe('parseHexInput', () => {
  it.each([
    ['4370bd', '#4370BD'],
    ['#4370BD', '#4370BD'],
    ['  #4370bd ', '#4370BD'],
    ['437', null],
    ['#4370BDX', null],
    ['', null],
  ])('%j -> %j', (input, expected) => {
    expect(parseHexInput(input)).toBe(expected);
  });
});
