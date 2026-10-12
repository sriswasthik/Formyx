import { describe, expect, it } from 'vitest';
import { contrastRatio } from '../color.js';
import { PLAIN_QR_COLORS, qrCodeColors } from './qr-colors.js';

describe('qrCodeColors', () => {
  it("uses the form's primary colour on its light container", () => {
    expect(
      qrCodeColors({ primary: '#1d3a8a', text: '#18181b', containerBackground: '#fdf8f0' }),
    ).toEqual({ dark: '#1d3a8a', light: '#fdf8f0' });
  });

  it('falls back to the text colour when the primary is too light to scan', () => {
    expect(
      qrCodeColors({ primary: '#f59e0b', text: '#27272a', containerBackground: '#ffffff' }),
    ).toEqual({ dark: '#27272a', light: '#ffffff' });
  });

  it('puts a dark form on white, with plain dark modules when its colours are light', () => {
    expect(
      qrCodeColors({ primary: '#a5b4fc', text: '#f4f4f5', containerBackground: '#18181b' }),
    ).toEqual(PLAIN_QR_COLORS);
  });

  it('always gives scanners strong contrast', () => {
    const colors = qrCodeColors({
      primary: '#2e5aac',
      text: '#3f3f46',
      containerBackground: '#eef2ff',
    });
    expect(contrastRatio(colors.dark, colors.light)).toBeGreaterThanOrEqual(7);
  });
});
