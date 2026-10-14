import { beforeEach, describe, expect, it } from 'vitest';
import { clearAttribution, noteAttribution, readAttribution } from './attribution';

const DAY = 24 * 60 * 60 * 1000;

describe('attribution', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('notes a referral code or a source from the link, and nothing else', () => {
    noteAttribution('?utm_source=x', localStorage, 1000);
    expect(readAttribution(localStorage, 1000)).toBeNull();

    noteAttribution('?ref=badge&form=party', localStorage, 1000);
    expect(readAttribution(localStorage, 1000)).toEqual({ source: 'badge', at: 1000 });

    noteAttribution('?ref=k7mq2xpa', localStorage, 2000);
    expect(readAttribution(localStorage, 2000)).toEqual({
      source: 'badge',
      referralCode: 'K7MQ2XPA',
      at: 2000,
    });
  });

  it('keeps a newer referral code, and never lets a source replace one', () => {
    noteAttribution('?ref=K7MQ2XPA', localStorage, 1000);
    noteAttribution('?ref=badge', localStorage, 2000);
    noteAttribution('?ref=ZZZZ2222', localStorage, 3000);
    expect(readAttribution(localStorage, 3000)).toMatchObject({ referralCode: 'ZZZZ2222' });
  });

  it('forgets it after 30 days, or once used', () => {
    noteAttribution('?ref=K7MQ2XPA', localStorage, 0);
    expect(readAttribution(localStorage, 31 * DAY)).toBeNull();
    noteAttribution('?ref=K7MQ2XPA', localStorage, 0);
    clearAttribution(localStorage);
    expect(readAttribution(localStorage, 0)).toBeNull();
  });

  it('ignores whatever else is stored under its name', () => {
    localStorage.setItem('formyx:attribution', 'not json');
    expect(readAttribution()).toBeNull();
  });
});
