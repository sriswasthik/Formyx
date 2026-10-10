import {
  ACCENT_PRESETS,
  applyPreset,
  createDefaultTheme,
  createField,
  resolveEntitlements,
  THEME_PRESETS,
  type BackgroundLayer,
  type EntitlementsMode,
  type FormTheme,
} from '@formyx/shared';
import { act, fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
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
import { DesignStudio } from './design-studio';
import { parseHexInput } from './hex';
import { createStudioStore, StudioStoreContext, type StudioStore } from './studio-state';
import { StudioPreview } from './studio-preview';

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

function Studio({ studio, withPreview }: { studio: StudioStore; withPreview: boolean }) {
  // One store per render, as the editor layout keeps one.
  const [store] = useState(studio);
  return (
    <StudioStoreContext.Provider value={store}>
      <DesignStudio layout="panel" canExpand />
      {withPreview ? <StudioPreview /> : <Canvas />}
    </StudioStoreContext.Provider>
  );
}

function renderStudio({
  entitlements,
  theme,
  withPreview = false,
}: { entitlements?: UseEntitlements; theme?: FormTheme; withPreview?: boolean } = {}) {
  const form = makeFormDetail([{ ...createField('short_text'), label: 'Your name' }], {
    ...(theme && { theme }),
  });
  const studio = createStudioStore();
  const ui = <Studio studio={studio} withPreview={withPreview} />;
  const result = renderWithEditor(
    entitlements ? (
      <EditorEntitlementsContext.Provider value={entitlements}>
        {ui}
      </EditorEntitlementsContext.Provider>
    ) : (
      ui
    ),
    form,
  );
  return { ...result, studio };
}

/** The element the canvas or preview applies the theme's variables to. */
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

async function openSection(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(screen.getByRole('tab', { name }));
}

const layers = (store: { getState: () => { theme: FormTheme } }) =>
  store.getState().theme.background.layers;

describe('DesignStudio', () => {
  it('opens on presets, with a section for every part of the look', () => {
    renderStudio();
    const sections = screen.getByRole('tablist', { name: 'Design sections' });
    expect(
      within(sections)
        .getAllByRole('tab')
        .map((tab) => tab.textContent),
    ).toEqual(['Presets', 'Background', 'Colours', 'Typography', 'Components', 'Layout']);
    expect(screen.getByRole('tab', { name: 'Presets' })).toHaveAttribute('aria-selected', 'true');
    expect(
      within(screen.getByRole('radiogroup', { name: 'Theme' })).getAllByRole('radio'),
    ).toHaveLength(THEME_PRESETS.length);
  });

  it('changes the accent from a preset, live in the canvas, and undoes in one step', async () => {
    const { user, store } = renderStudio();
    await openSection(user, 'Colours');
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
    const { user, store } = renderStudio();
    await openSection(user, 'Colours');
    const hex = screen.getByRole('textbox', { name: 'Custom colour' });

    await user.clear(hex);
    await user.type(hex, 'f4e8a1');

    expect(store.getState().theme.colors.primary).toBe('#F4E8A1');
    expect(checkedIn('Accent colour')).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent(/Low contrast: 1\.\d:1/);
  });

  it('points out a hex that is not one, and keeps the last good colour', async () => {
    const { user, store } = renderStudio();
    await openSection(user, 'Colours');
    const hex = screen.getByRole('textbox', { name: 'Custom colour' });

    await user.clear(hex);
    await user.type(hex, '12zz');
    await user.tab();

    expect(hex).toHaveAccessibleDescription('Use six hex digits, such as 4370BD.');
    expect(hex).toHaveAttribute('aria-invalid', 'true');
    expect(store.getState().theme.colors.primary).toBe('#4370BD');
  });

  it('edits text and surface colours by hex', async () => {
    const { user, store } = renderStudio();
    await openSection(user, 'Colours');
    const field = screen.getByRole('textbox', { name: 'Field' });

    await user.clear(field);
    await user.type(field, 'f4f4f5');

    expect(store.getState().theme.colors.inputBackground).toBe('#F4F4F5');
  });

  it('switches to a plain background and square corners', async () => {
    const { user, store } = renderStudio();
    await openSection(user, 'Components');
    const corners = screen.getByRole('slider', { name: 'Corner radius' });
    corners.focus();
    await user.keyboard('{Home}');
    await openSection(user, 'Colours');
    await user.click(
      within(screen.getByRole('radiogroup', { name: 'Plain background' })).getByRole('radio', {
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
    const { user, store } = renderStudio();
    await openSection(user, 'Typography');

    await user.click(screen.getByRole('button', { name: /Headings/ }));
    expect(screen.getByRole('option', { name: /Fraunces/ })).toHaveTextContent('Pro');
    await user.click(screen.getByRole('option', { name: /Fraunces/ }));
    await user.click(screen.getByRole('button', { name: /^Text/ }));
    // Search narrows the list; arrow keys and Enter pick from it.
    await user.keyboard('dm sa');
    expect(screen.getAllByRole('option')).toHaveLength(1);
    await user.keyboard('{ArrowDown}{Enter}');

    expect(store.getState().theme.typography).toMatchObject({
      headingFont: 'fraunces',
      bodyFont: 'dm-sans',
    });
    expect(canvasTheme().getPropertyValue('--form-heading-font')).toMatch(/^'Fraunces Variable'/);
    expect(canvasTheme().getPropertyValue('--form-body-font')).toMatch(/^'DM Sans Variable'/);
  });

  it('applies a preset in one step, and shows it selected until the look changes', async () => {
    const { user, store, container } = renderStudio();
    const themes = screen.getByRole('radiogroup', { name: 'Theme' });
    expect(within(themes).getByRole('radio', { name: /Minimal$/ })).toBeChecked();

    await user.click(within(themes).getByRole('radio', { name: /Sea glass/ }));

    expect(store.getState().theme).toEqual(applyPreset(createDefaultTheme(), preset('sea-glass')));
    expect(container.querySelector('[data-editor-canvas] [data-layer="mesh"]')).not.toBeNull();

    await openSection(user, 'Colours');
    expect(checkedIn('Plain background')).toBeNull();
    await user.click(
      within(screen.getByRole('radiogroup', { name: 'Accent colour' })).getByRole('radio', {
        name: 'Rust',
      }),
    );
    await openSection(user, 'Presets');
    expect(checkedIn('Theme')).toBeNull();

    act(() => {
      store.getState().undo();
      store.getState().undo();
    });
    expect(store.getState().theme).toEqual(createDefaultTheme());
  });

  it('marks Pro presets, and says they are free while everything is unlocked', () => {
    renderStudio({ entitlements: freePlan('all_unlocked') });
    const themes = screen.getByRole('radiogroup', { name: 'Theme' });
    expect(within(themes).getByRole('radio', { name: 'Sea glass Pro' })).toBeInTheDocument();
    expect(within(themes).getByRole('radio', { name: 'Paper' })).toBeInTheDocument();
    expect(screen.getByText('Styles marked Pro are included free during the beta.')).toBeVisible();
  });

  it('lets a Free plan try Pro styles, and says publishing them needs Pro', async () => {
    const { user, store } = renderStudio({ entitlements: freePlan('enforced') });
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
    renderStudio();
    expect(screen.queryByText(/Pro styles|free during the beta/)).toBeNull();
  });

  it('hides the Formyx badge with a switch that explains hiding it is Pro', async () => {
    const { user, store } = renderStudio();
    await openSection(user, 'Layout');
    const toggle = screen.getByRole('switch', { name: 'Show “Made with Formyx”' });
    expect(toggle).toBeChecked();
    expect(toggle).toHaveAccessibleDescription('Pro Hiding it is a Pro feature.');

    await user.click(toggle);

    expect(store.getState().theme.branding.showFormyxBadge).toBe(false);
  });

  it('turns full screen on and off', async () => {
    const { user, studio } = renderStudio();
    await user.click(screen.getByRole('button', { name: 'Full screen' }));
    expect(studio.getState().fullScreen).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Exit full screen' }));
    expect(studio.getState().fullScreen).toBe(false);
  });
});

describe('DesignStudio background layers', () => {
  const layerRows = () =>
    within(screen.getByRole('list', { name: 'Background layers, top first' }))
      .getAllByRole('listitem')
      .map((row) => row.querySelector('[aria-pressed]')?.textContent);

  it('adds layers on top, selects the new one and draws it at once', async () => {
    const { user, store, container } = renderStudio();
    await openSection(user, 'Background');
    expect(layerRows()).toEqual(['Solid colour']);

    await user.click(screen.getByRole('button', { name: 'Add layer' }));
    await user.click(screen.getByRole('menuitem', { name: /Texture/ }));

    expect(layers(store).map((layer) => layer.type)).toEqual(['solid', 'texture']);
    expect(layerRows()).toEqual(['Texture · Grain', 'Solid colour']);
    expect(screen.getByRole('heading', { name: 'Texture' })).toBeInTheDocument();
    expect(container.querySelector('[data-editor-canvas] [data-layer="texture"]')).not.toBeNull();
  });

  it('hides, duplicates and deletes layers', async () => {
    const theme = applyPreset(createDefaultTheme(), preset('paper'));
    const { user, store } = renderStudio({ theme });
    await openSection(user, 'Background');
    expect(layerRows()).toEqual(['Texture · Grain', 'Solid colour']);

    await user.click(screen.getByRole('button', { name: 'Hide Texture · Grain' }));
    expect(layers(store)[1]?.hidden).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Show Texture · Grain' }));
    expect(layers(store)[1]?.hidden).toBeUndefined();

    await user.click(screen.getByRole('button', { name: 'More for Solid colour' }));
    await user.click(screen.getByRole('menuitem', { name: 'Duplicate' }));
    expect(layers(store).map((layer) => layer.id)).toEqual(['base', 'solid', 'grain']);

    // Each layer has a handle to drag it (pointer or keyboard); `moveLayer` is tested apart.
    expect(screen.getByRole('button', { name: 'Move Texture · Grain' })).toHaveAttribute(
      'aria-roledescription',
      'sortable',
    );

    await user.click(screen.getByRole('button', { name: 'More for Texture · Grain' }));
    await user.click(screen.getByRole('menuitem', { name: 'Delete' }));
    expect(layers(store).map((layer) => layer.id)).toEqual(['base', 'solid']);
  });

  it('keeps the last layer, which cannot be deleted', async () => {
    const { user } = renderStudio();
    await openSection(user, 'Background');
    await user.click(screen.getByRole('button', { name: 'More for Solid colour' }));
    expect(screen.getByRole('menuitem', { name: 'Delete' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  it('shuffles a mesh and regenerates it from a palette', async () => {
    const theme = applyPreset(createDefaultTheme(), preset('sea-glass'));
    const { user, store } = renderStudio({ theme });
    await openSection(user, 'Background');
    const mesh = () => {
      const layer = layers(store).find((candidate) => candidate.type === 'mesh');
      if (layer?.type !== 'mesh') throw new Error('No mesh');
      return layer;
    };
    const before = mesh().points;

    await user.click(screen.getByRole('button', { name: 'Shuffle' }));
    expect(mesh().points).not.toEqual(before);
    expect(
      mesh()
        .points.map((point) => point.color)
        .sort(),
    ).toEqual(before.map((point) => point.color).sort());

    await user.click(screen.getByRole('button', { name: 'Generate from Ocean' }));
    expect(mesh().points.map((point) => point.color)).toContain('#6FB3D2');

    await user.click(screen.getByRole('button', { name: 'Add a colour point' }));
    expect(mesh().points).toHaveLength(before.length + 1);
    expect(screen.getByRole('radio', { name: `Point ${before.length + 1}` })).toBeChecked();
  });

  it('changes a texture and its density', async () => {
    const theme = applyPreset(createDefaultTheme(), preset('paper'));
    const { user, store } = renderStudio({ theme });
    await openSection(user, 'Background');

    await user.click(screen.getByRole('radio', { name: /^Dots/ }));
    const density = screen.getByRole('slider', { name: 'Density' });
    density.focus();
    await user.keyboard('{ArrowRight}');

    expect(layers(store)[1]).toMatchObject({ assetId: 'dots', density: 0.55 });
  });

  it('scatters shapes, hides them on phones and edits one', async () => {
    const theme = applyPreset(createDefaultTheme(), preset('confetti-party'));
    const { user, store } = renderStudio({ theme });
    await openSection(user, 'Background');
    const shapes = () => {
      const layer = layers(store).find((candidate) => candidate.type === 'shapes');
      if (layer?.type !== 'shapes') throw new Error('No shapes');
      return layer;
    };
    const before = shapes().items;

    await user.click(screen.getByRole('button', { name: 'Scatter' }));
    expect(shapes().items.map(({ x, y }) => [x, y])).not.toEqual(before.map(({ x, y }) => [x, y]));

    await user.click(screen.getByRole('switch', { name: 'Hide on phones' }));
    expect(shapes().hideOnMobile).toBe(true);

    await user.click(screen.getByRole('combobox', { name: 'Edit a shape' }));
    const [first] = screen.getAllByRole('option');
    if (!first) throw new Error('No shapes to pick');
    await user.click(first);
    const rotation = screen.getByRole('slider', { name: 'Rotation' });
    rotation.focus();
    await user.keyboard('{Home}');
    expect(shapes().items[0]?.rotation).toBe(-180);
  });
});

describe('DesignStudio readability guard', () => {
  const darkMiddle: BackgroundLayer = {
    id: 'glow',
    type: 'radial',
    shape: 'circle',
    center: { x: 50, y: 50 },
    stops: [
      { color: '#3F3F46', position: 0 },
      { color: '#FFFFFF', position: 100 },
    ],
    opacity: 1,
    blendMode: 'normal',
  };

  it('says nothing while the text reads well', () => {
    renderStudio();
    expect(screen.queryByText('Some text may be hard to read')).toBeNull();
  });

  it('warns calmly with one-click fixes that make the text readable', async () => {
    const base = createDefaultTheme();
    const { user, store } = renderStudio({
      theme: { ...base, background: { layers: [darkMiddle] } },
    });

    const callout = (await screen.findByText('Some text may be hard to read')).closest('section');
    if (!callout) throw new Error('No callout');
    expect(within(callout).getByText(/text needs 4\.5:1 \(WCAG AA\)/)).toBeInTheDocument();

    await user.click(within(callout).getByRole('button', { name: 'Put the form in a card' }));

    expect(store.getState().theme.components.containerStyle).toBe('card');
    expect(screen.queryByText('Some text may be hard to read')).toBeNull();
  });
});

describe('StudioPreview', () => {
  it('draws the form at phone width and back', async () => {
    const { user, studio } = renderStudio({ withPreview: true });
    expect(screen.getByRole('radio', { name: 'Desktop' })).toBeChecked();

    await user.click(screen.getByRole('radio', { name: 'Phone' }));

    expect(studio.getState().device).toBe('mobile');
    const frame = document.querySelector<HTMLElement>('[data-studio-frame]')?.parentElement;
    expect(frame?.style.width).toBe('390px');
  });

  it('moves a mesh point with the keyboard, in one undo step', async () => {
    const theme = applyPreset(createDefaultTheme(), preset('sea-glass'));
    const { user, store } = renderStudio({ theme, withPreview: true });
    await openSection(user, 'Background');

    const point = screen.getByRole('button', { name: /^Colour point 1, 8% across, 12% down/ });
    point.focus();
    await user.keyboard('{ArrowRight}{ArrowRight}{Shift>}{ArrowDown}{/Shift}');

    const mesh = layers(store).find((layer) => layer.type === 'mesh');
    expect(mesh?.type === 'mesh' && mesh.points[0]).toMatchObject({ x: 10, y: 17 });
    act(() => {
      store.getState().undo();
    });
    const undone = layers(store).find((layer) => layer.type === 'mesh');
    expect(undone?.type === 'mesh' && undone.points[0]).toMatchObject({ x: 8, y: 12 });
  });

  it('drags a shape on the preview, in one undo step', async () => {
    const theme = applyPreset(createDefaultTheme(), preset('confetti-party'));
    const { user, store } = renderStudio({ theme, withPreview: true });
    await openSection(user, 'Background');
    const group = screen.getByRole('group', { name: 'Background handles' });
    group.getBoundingClientRect = () => DOMRect.fromRect({ x: 0, y: 0, width: 1000, height: 500 });
    const handle = within(group).getAllByRole('button')[0];
    if (!handle) throw new Error('No handle');
    const shapes = () => {
      const layer = layers(store).find((candidate) => candidate.type === 'shapes');
      if (layer?.type !== 'shapes') throw new Error('No shapes');
      return layer.items[0];
    };
    const start = shapes();

    fireEvent.pointerDown(handle, { button: 0, pointerId: 1, clientX: 100, clientY: 100 });
    for (const x of [200, 300, 400]) {
      fireEvent.pointerMove(handle, { pointerId: 1, clientX: x, clientY: 250 });
    }
    fireEvent.pointerUp(handle, { pointerId: 1 });

    expect(shapes()).toMatchObject({ x: 40, y: 50 });
    act(() => {
      store.getState().undo();
    });
    expect(shapes()).toMatchObject({ x: start?.x, y: start?.y });
  });

  it('shows handles only while editing the background', async () => {
    const theme = applyPreset(createDefaultTheme(), preset('sea-glass'));
    const { user } = renderStudio({ theme, withPreview: true });
    expect(screen.queryByRole('group', { name: 'Background handles' })).toBeNull();
    await openSection(user, 'Background');
    expect(screen.getByRole('group', { name: 'Background handles' })).toBeInTheDocument();
  });
});

describe('DesignStudio images', () => {
  /** The group for one image, and its (hidden) file input. */
  function imageSection(title: 'Logo' | 'Cover image') {
    const section = screen.getByRole('heading', { name: title }).closest('section');
    const input = section?.querySelector<HTMLInputElement>('input[type="file"]');
    if (!section || !input) throw new Error(`No ${title} section`);
    return { section: within(section), input };
  }

  it('uploads a logo for this form, shows it, and removes it', async () => {
    const fetchMock = stubFetch(() => jsonResponse(fakeSignature('formyx/themes/form_1')));
    stubStorageUploads({ autoRespond: true });
    const { user, store, container } = renderStudio();
    await openSection(user, 'Layout');
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
    const { user } = renderStudio();
    await openSection(user, 'Layout');
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

  it('adds an image layer from an upload, with a focal point', async () => {
    const fetchMock = stubFetch(() => jsonResponse(fakeSignature('formyx/themes/form_1')));
    stubStorageUploads({ autoRespond: true });
    const { user, store } = renderStudio();
    await openSection(user, 'Background');

    await user.click(screen.getByRole('button', { name: 'Add layer' }));
    await user.click(screen.getByRole('menuitem', { name: /Image/ }));
    const card = screen.getByRole('heading', { name: 'New image layer' }).parentElement
      ?.parentElement;
    const input = card?.querySelector<HTMLInputElement>('input[type="file"]');
    if (!input) throw new Error('No file input');
    const file = new File(['jpg'], 'photo.jpg', { type: 'image/jpeg' });
    await user.upload(input, file);

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      '/api/uploads/signature?purpose=background&formId=form_1',
    );
    expect(await screen.findByRole('heading', { name: 'Image' })).toBeInTheDocument();
    expect(layers(store).at(-1)).toMatchObject({
      type: 'image',
      url: storedFile('formyx/themes/form_1', file).secure_url,
      focalPoint: { x: 50, y: 50 },
      fit: 'cover',
    });
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

describe('the Typography, Components and Layout sections', () => {
  const radio = (group: string, name: RegExp) =>
    within(screen.getByRole('radiogroup', { name: group })).getByRole('radio', { name });

  it('applies a font pairing in one step: both fonts and a heading weight', async () => {
    const { user, store } = renderStudio();
    await openSection(user, 'Typography');
    await user.click(radio('Font pairing', /Editorial/));
    expect(store.getState().theme.typography).toMatchObject({
      headingFont: 'fraunces',
      bodyFont: 'source-serif-4',
      headingWeight: 600,
    });
    expect(radio('Font pairing', /Editorial/)).toBeChecked();

    await user.click(radio('Question numbers', /Letters/));
    expect(store.getState().theme.typography.questionNumbering).toBe('letter');
  });

  it('keeps the heading weight to one the new heading font has', async () => {
    const { user, store } = renderStudio();
    await openSection(user, 'Typography');
    await user.click(screen.getByRole('button', { name: /Headings/ }));
    await user.keyboard('patrick');
    await user.keyboard('{Enter}');
    expect(store.getState().theme.typography).toMatchObject({
      headingFont: 'patrick-hand',
      headingWeight: 400,
    });
  });

  it('styles choices and buttons, and the container once there is one', async () => {
    const { user, store } = renderStudio();
    await openSection(user, 'Components');
    await user.click(radio('Choice style', /Pills/));
    await user.click(radio('Button size', /Large/));
    await user.click(screen.getByRole('switch', { name: 'Arrow after the text' }));
    expect(screen.queryByRole('radiogroup', { name: 'Padding' })).not.toBeInTheDocument();
    await user.click(radio('Container style', /Card/));
    await user.click(radio('Padding', /Spacious/));

    expect(store.getState().theme.components).toMatchObject({
      choiceStyle: 'pills',
      buttonSize: 'lg',
      buttonArrow: true,
      containerStyle: 'card',
      containerPadding: 'spacious',
    });
    // The canvas's submit button follows.
    expect(document.querySelector('[data-editor-canvas] [data-button-arrow]')).not.toBeNull();

    const text = screen.getByRole('textbox', { name: 'Submit button text' });
    await user.clear(text);
    await user.type(text, 'Send it');
    expect(store.getState().schema.settings.submitButtonText).toBe('Send it');
  });

  it('sets the layout, its progress bar and, one question at a time, auto-advance', async () => {
    const { user, store } = renderStudio();
    await openSection(user, 'Layout');
    expect(screen.queryByRole('switch', { name: /Move on/ })).not.toBeInTheDocument();
    await user.click(radio('Layout', /One at a time/));
    await user.click(radio('Progress bar', /Steps/));
    await user.click(radio('Progress bar position', /Bottom/));
    await user.click(screen.getByRole('switch', { name: /Move on after a single choice/ }));

    expect(store.getState().theme.layout).toMatchObject({
      mode: 'conversational',
      progress: { style: 'steps', position: 'bottom' },
      autoAdvance: false,
    });
  });

  it('steps through a conversational form’s questions in the preview', async () => {
    const base = createDefaultTheme();
    const form = makeFormDetail(
      [
        { ...createField('short_text'), label: 'Your name' },
        { ...createField('email'), label: 'Your email' },
      ],
      { theme: { ...base, layout: { ...base.layout, mode: 'conversational' } } },
    );
    const studio = createStudioStore();
    const { user } = renderWithEditor(<Studio studio={studio} withPreview />, form);

    expect(await screen.findByRole('textbox', { name: 'Your name' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Next question' }));
    expect(await screen.findByRole('textbox', { name: 'Your email' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Question shown' })).toHaveTextContent('2 of 2');
    expect(screen.getByRole('button', { name: 'Next question' })).toBeDisabled();
  });
});
