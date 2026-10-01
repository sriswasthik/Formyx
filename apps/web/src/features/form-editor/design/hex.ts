const HEX_DIGITS = /^[0-9a-fA-F]{6}$/;

/** "4370bd", "#4370BD" -> "#4370BD"; `null` unless it is six hex digits. */
export function parseHexInput(text: string): string | null {
  const digits = text.trim().replace(/^#/, '');
  return HEX_DIGITS.test(digits) ? `#${digits.toUpperCase()}` : null;
}
