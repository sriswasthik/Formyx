import { describe, expect, it } from 'vitest';
import { escapeCsvField, toCsvRow } from './csv.js';

describe('escapeCsvField', () => {
  it('leaves plain text alone', () => {
    expect(escapeCsvField('Ada Lovelace')).toBe('Ada Lovelace');
    expect(escapeCsvField('')).toBe('');
  });

  it.each([
    ['a comma', 'Paris, France', '"Paris, France"'],
    ['a quote', 'She said "hi"', '"She said ""hi"""'],
    ['a line feed', 'line one\nline two', '"line one\nline two"'],
    ['a carriage return', 'one\r\ntwo', '"one\r\ntwo"'],
    ['only quotes', '""', '""""""'],
  ])('quotes text with %s', (_case, value, expected) => {
    expect(escapeCsvField(value)).toBe(expected);
  });

  it.each([
    ['=SUM(A1:A9)', "'=SUM(A1:A9)"],
    ['+1 555 0100', "'+1 555 0100"],
    ['-2', "'-2"],
    ['@cmd', "'@cmd"],
    ['\tindented', "'\tindented"],
  ])('stops %j from running as a formula', (value, expected) => {
    expect(escapeCsvField(value)).toBe(expected);
  });

  it('guards and quotes a formula that also needs quoting', () => {
    expect(escapeCsvField('=HYPERLINK("http://evil.example","Click")')).toBe(
      '"\'=HYPERLINK(""http://evil.example"",""Click"")"',
    );
  });

  it('writes numbers as numbers, including negative ones', () => {
    expect(escapeCsvField(-12.5)).toBe('-12.5');
    expect(escapeCsvField(0)).toBe('0');
    expect(escapeCsvField(Number.NaN)).toBe('');
  });

  it('writes nothing for missing values', () => {
    expect(escapeCsvField(null)).toBe('');
    expect(escapeCsvField(undefined)).toBe('');
  });

  it('keeps non-Latin text and emoji as they are', () => {
    expect(escapeCsvField('Zoë, 東京')).toBe('"Zoë, 東京"');
  });
});

describe('toCsvRow', () => {
  it('joins fields with commas and ends with CRLF', () => {
    expect(toCsvRow(['id', 'Name, full', 3, null])).toBe('id,"Name, full",3,\r\n');
  });
});
