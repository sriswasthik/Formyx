import { describe, expect, it } from 'vitest';
import { formatDocumentTitle, getRouteTitle } from './route-handle';

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

describe('formatDocumentTitle', () => {
  it('suffixes page titles with the product name', () => {
    expect(formatDocumentTitle('Forms')).toBe('Forms · Formyx');
  });

  it('uses the product tagline without a page title', () => {
    expect(formatDocumentTitle(undefined)).toBe('Formyx — Forms that feel effortless');
  });
});
