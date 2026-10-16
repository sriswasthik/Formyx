import { describe, expect, it } from 'vitest';
import { fontStack } from '../assets/fonts.js';
import { formScripts, scriptsIn } from './scripts.js';

describe('scriptsIn', () => {
  it('finds Telugu and Devanagari text, and nothing in Latin text', () => {
    expect(scriptsIn('మీ పేరు ఏమిటి?')).toEqual(['telugu']);
    expect(scriptsIn('आपका नाम क्या है?')).toEqual(['devanagari']);
    expect(scriptsIn('Name / పేరు / नाम')).toEqual(['telugu', 'devanagari']);
    expect(scriptsIn('What is your name?', null, undefined)).toEqual([]);
    // Tamil and Bengali are other scripts: not these fonts' job.
    expect(scriptsIn('உங்கள் பெயர்', 'আপনার নাম')).toEqual([]);
  });
});

describe('formScripts', () => {
  it('takes the form language’s script, and any its words use', () => {
    expect(formScripts('te', { fields: [{ label: 'Name' }] })).toEqual(['telugu']);
    expect(formScripts('en', { fields: [{ label: 'नाम' }] })).toEqual(['devanagari']);
    expect(formScripts('en', { fields: [{ label: 'Name' }] })).toEqual([]);
  });
});

describe('fontStack with script fonts', () => {
  it('puts them after the font’s own fallback and before the generic families', () => {
    expect(fontStack('inter', "'Noto Sans Telugu'")).toBe(
      "'Inter Variable', 'Inter Fallback', 'Noto Sans Telugu', ui-sans-serif, system-ui, sans-serif",
    );
    expect(fontStack('inter')).toBe(
      "'Inter Variable', 'Inter Fallback', ui-sans-serif, system-ui, sans-serif",
    );
  });
});
