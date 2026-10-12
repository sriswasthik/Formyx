import { describe, expect, it } from 'vitest';
import { isSettingsSection, searchSettings, SETTINGS, SETTINGS_SECTIONS } from './settings-index';

const ids = (query: string) => searchSettings(query).map((setting) => setting.id);

describe('searchSettings', () => {
  it('finds settings by the words people use for them', () => {
    expect(ids('otp')).toEqual(['one-response']);
    expect(ids('telugu')).toEqual(['language']);
    expect(ids('excel')).toEqual(['export']);
    expect(ids('og image')).toEqual(['social']);
  });

  it('needs every word to match, in any case', () => {
    expect(ids('CLOSE date')).toEqual(['schedule']);
    expect(ids('password nothing-like-this')).toEqual([]);
  });

  it('matches section names too', () => {
    expect(ids('autoresponder')).toContain('autoresponder');
  });

  it('finds nothing for an empty search', () => {
    expect(ids('   ')).toEqual([]);
  });
});

describe('the settings index', () => {
  it('has one entry per id, each in a real section', () => {
    expect(new Set(SETTINGS.map((setting) => setting.id)).size).toBe(SETTINGS.length);
    for (const setting of SETTINGS) expect(SETTINGS_SECTIONS).toContain(setting.section);
  });

  it('reads sections from the URL safely', () => {
    expect(isSettingsSection('access')).toBe(true);
    expect(isSettingsSection('billing')).toBe(false);
    expect(isSettingsSection(null)).toBe(false);
  });
});
