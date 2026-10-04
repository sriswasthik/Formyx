import { describe, expect, it } from 'vitest';
import {
  contrastRatio,
  hexColorSchema,
  hexToRgb,
  mixHex,
  readableTextColor,
  relativeLuminance,
  rgbToHex,
} from './color.js';

describe('hex conversions', () => {
  it('round-trips colours', () => {
    expect(hexToRgb('#2E5AAC')).toEqual([46, 90, 172]);
    expect(rgbToHex([46, 90, 172])).toBe('#2E5AAC');
  });

  it('rounds and clamps channels', () => {
    expect(rgbToHex([-4, 127.6, 300])).toBe('#0080FF');
  });

  it('stores hex colours in capitals and refuses other formats', () => {
    expect(hexColorSchema.parse('#4370bd')).toBe('#4370BD');
    for (const value of ['#47b', 'blue', '#4370BDFF', '4370BD']) {
      expect(hexColorSchema.safeParse(value).success).toBe(false);
    }
  });
});

describe('mixHex', () => {
  it('mixes like CSS color-mix in srgb', () => {
    expect(mixHex('#000000', '#FFFFFF', 50)).toBe('#808080');
    expect(mixHex('#18181B', '#FFFFFF', 0)).toBe('#FFFFFF');
    expect(mixHex('#18181B', '#FFFFFF', 100)).toBe('#18181B');
    // color-mix(in srgb, #18181b 64%, #ffffff): 24 * 0.64 + 255 * 0.36 = 107.16.
    expect(mixHex('#18181B', '#FFFFFF', 64)).toBe('#6B6B6D');
  });
});

describe('contrastRatio', () => {
  it('matches the WCAG reference values', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrastRatio('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 5);
    // #767676 is the classic "just passes 4.5:1 on white" grey.
    expect(contrastRatio('#767676', '#FFFFFF')).toBeCloseTo(4.54, 2);
    expect(relativeLuminance('#FFFFFF')).toBeCloseTo(1, 5);
  });

  it('does not care about the order', () => {
    expect(contrastRatio('#4370BD', '#FFFFFF')).toBe(contrastRatio('#FFFFFF', '#4370BD'));
  });
});

describe('readableTextColor', () => {
  it('picks whichever of the two reads better', () => {
    expect(readableTextColor('#FFFFFF')).toBe('#18181B');
    expect(readableTextColor('#18181B')).toBe('#FFFFFF');
    expect(readableTextColor('#18181B', '#000000', '#FAFAFA')).toBe('#FAFAFA');
  });
});
