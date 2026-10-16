import { describe, expect, it } from 'vitest';
import { canPlayHere, pickRecordingFormat } from './voice-formats';

const supports =
  (...mimes: string[]) =>
  (mime: string) =>
    mimes.includes(mime);

describe('pickRecordingFormat', () => {
  it('records AAC in MP4 wherever it can, as every browser plays it', () => {
    expect(pickRecordingFormat(supports('audio/mp4;codecs=mp4a.40.2', 'audio/mp4'))).toEqual({
      mime: 'audio/mp4;codecs=mp4a.40.2',
      extension: 'm4a',
    });
  });

  it('takes WebM with Opus in Chrome and Firefox without an AAC encoder', () => {
    expect(
      pickRecordingFormat(
        supports('audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'),
      ),
    ).toEqual({ mime: 'audio/webm;codecs=opus', extension: 'webm' });
  });

  it('falls back to plain MP4 on older Safari', () => {
    expect(pickRecordingFormat(supports('audio/mp4'))).toEqual({
      mime: 'audio/mp4',
      extension: 'm4a',
    });
  });

  it('has nothing to offer without MediaRecorder', () => {
    expect(pickRecordingFormat(undefined)).toBeNull();
    expect(pickRecordingFormat(supports())).toBeNull();
  });
});

describe('canPlayHere', () => {
  const safari15 = (type: string) => (type.startsWith('audio/mp4') ? 'probably' : '');

  it('plays MP4 and MP3 recordings everywhere', () => {
    expect(canPlayHere('audio/mp4', 'voice-note.m4a', safari15)).toBe(true);
    expect(canPlayHere('audio/mpeg', 'memo.mp3', () => '')).toBe(true);
  });

  it('asks the browser about WebM and Ogg, by type or by name', () => {
    expect(canPlayHere('audio/webm', 'voice-note.webm', safari15)).toBe(false);
    expect(canPlayHere('application/octet-stream', 'voice-note.ogg', safari15)).toBe(false);
    expect(canPlayHere('audio/webm', 'voice-note.webm', () => 'maybe')).toBe(true);
  });
});
