/*
 * Which format a voice note is recorded in. AAC in MP4 plays in every browser, so it comes
 * first wherever MediaRecorder can write it (Safari, and Chrome where the system has an AAC
 * encoder); otherwise WebM or Ogg with Opus (Chrome, Firefox, Edge), which older Safari can't
 * play: the responses page offers those as a download there.
 */

export interface RecordingFormat {
  mime: string;
  extension: string;
}

/** Best first. */
export const RECORDING_FORMATS: readonly RecordingFormat[] = [
  { mime: 'audio/mp4;codecs=mp4a.40.2', extension: 'm4a' },
  { mime: 'audio/webm;codecs=opus', extension: 'webm' },
  { mime: 'audio/webm', extension: 'webm' },
  { mime: 'audio/ogg;codecs=opus', extension: 'ogg' },
  { mime: 'audio/mp4', extension: 'm4a' },
  { mime: 'audio/aac', extension: 'aac' },
];

/** The best format this browser records, or null when it can't record at all. */
export function pickRecordingFormat(
  isTypeSupported: ((mime: string) => boolean) | undefined = typeof MediaRecorder === 'undefined'
    ? undefined
    : (mime) => MediaRecorder.isTypeSupported(mime),
): RecordingFormat | null {
  if (!isTypeSupported) return null;
  return RECORDING_FORMATS.find((format) => isTypeSupported(format.mime)) ?? null;
}

/** Recordings some browsers can't play (Safari before 17.4 has no WebM or Ogg audio). */
const NOT_EVERYWHERE = /^audio\/(webm|ogg)\b|\.(webm|ogg)$/i;

/**
 * Whether this browser can play a recording of `type` (named `name`): always, for the
 * formats every browser plays; otherwise as the browser says.
 */
export function canPlayHere(
  type: string,
  name: string,
  canPlayType: (type: string) => string = (asked) =>
    document.createElement('audio').canPlayType(asked),
): boolean {
  if (!NOT_EVERYWHERE.test(type) && !NOT_EVERYWHERE.test(name)) return true;
  const mime = NOT_EVERYWHERE.test(type) ? type : /\.ogg$/i.test(name) ? 'audio/ogg' : 'audio/webm';
  return canPlayType(mime) !== '';
}
