import { describe, expect, it } from 'vitest';
import { hostTargetOrigin } from './embed-host';

describe('hostTargetOrigin', () => {
  it.each([
    ['https://shop.example', 'https://shop.example'],
    ['http://localhost:3000', 'http://localhost:3000'],
  ])('posts only to the host origin %s', (parent, expected) => {
    expect(hostTargetOrigin(parent)).toBe(expected);
  });

  it.each([
    [null],
    [''],
    ['null'],
    ['https://shop.example/page'],
    ['javascript:alert(1)'],
    ['not a url'],
  ])('falls back to any origin for %j', (parent) => {
    expect(hostTargetOrigin(parent)).toBe('*');
  });
});
