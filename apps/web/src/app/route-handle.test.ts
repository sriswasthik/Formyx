import { describe, expect, it } from 'vitest';
import { formatDocumentTitle, getBreadcrumbs, getRouteTitle } from './route-handle';

describe('getRouteTitle', () => {
  it('returns the deepest title', () => {
    expect(
      getRouteTitle([
        { handle: undefined },
        { handle: { title: 'App' } },
        { handle: { title: 'Forms' } },
      ]),
    ).toBe('Forms');
  });

  it('skips matches without a title', () => {
    expect(getRouteTitle([{ handle: { title: 'Settings' } }, { handle: { other: true } }])).toBe(
      'Settings',
    );
  });

  it('returns undefined when nothing declares a title', () => {
    expect(getRouteTitle([{ handle: undefined }, { handle: null }])).toBeUndefined();
    expect(getRouteTitle([])).toBeUndefined();
  });
});

describe('getBreadcrumbs', () => {
  it('follows the titled routes down to the page', () => {
    expect(
      getBreadcrumbs([
        { handle: undefined, pathname: '/app' },
        { handle: { title: 'Settings' }, pathname: '/app/settings' },
        { handle: { title: 'Members' }, pathname: '/app/settings/members' },
      ]),
    ).toEqual([
      { label: 'Settings', to: '/app/settings' },
      { label: 'Members', to: '/app/settings/members' },
    ]);
  });

  it('starts from the page’s parent, and names the page by its own title', () => {
    expect(
      getBreadcrumbs(
        [
          {
            handle: { title: 'Form', parent: { title: 'Forms', to: '/app/forms' } },
            pathname: '/app/forms/form_1',
          },
        ],
        'Event registration',
      ),
    ).toEqual([
      { label: 'Forms', to: '/app/forms' },
      { label: 'Event registration', to: '/app/forms/form_1' },
    ]);
  });

  it('is empty without titles', () => {
    expect(getBreadcrumbs([{ handle: undefined, pathname: '/app' }], 'Ignored')).toEqual([]);
  });
});

describe('formatDocumentTitle', () => {
  it('suffixes page titles with the product name', () => {
    expect(formatDocumentTitle('Forms')).toBe('Forms · Formyx');
  });

  it('uses the product tagline without a page title', () => {
    expect(formatDocumentTitle(undefined)).toBe(
      'Formyx: build forms people actually enjoy filling in',
    );
  });
});
