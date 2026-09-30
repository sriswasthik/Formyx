import { describe, expect, it } from 'vitest';
import { contrastRatio, hexToRgb, readableTextColor, relativeLuminance } from './color';

describe('color helpers', () => {
  it('parses hex colours', () => {
    expect(hexToRgb('#2E5AAC')).toEqual([46, 90, 172]);
    expect(hexToRgb('#ffffff')).toEqual([255, 255, 255]);
  });

  it('computes WCAG luminance and contrast', () => {
    expect(relativeLuminance('#000000')).toBe(0);
    expect(relativeLuminance('#FFFFFF')).toBeCloseTo(1);
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21);
    expect(contrastRatio('#FFFFFF', '#000000')).toBeCloseTo(21);
  });

  it('picks the text colour that reads better', () => {
    expect(readableTextColor('#FFFFFF')).toBe('#18181b');
    expect(readableTextColor('#09090B')).toBe('#ffffff');
    expect(readableTextColor('#2E5AAC')).toBe('#ffffff');
    expect(readableTextColor('#FACC15')).toBe('#18181b');
  });
});
