import { isFileAnswer, type FieldOfType } from '@formyx/shared';
import { Check, Mic, RotateCcw, Square } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { cx } from '@/lib/cx';
import { formButton, secondaryButton } from '../styles';
import { useFormTheme } from '../theme/theme-context';
import type { ControlProps } from '../types';
import { useAnswerUpload } from './use-answer-upload';
import { useFormMessages } from '../i18n/form-locale';

/** Formats MediaRecorder may offer, best first: Chrome and Firefox take WebM or Ogg, Safari MP4. */
const FORMATS = [
  { mime: 'audio/webm;codecs=opus', extension: 'webm' },
  { mime: 'audio/webm', extension: 'webm' },
  { mime: 'audio/ogg;codecs=opus', extension: 'ogg' },
  { mime: 'audio/mp4', extension: 'm4a' },
  { mime: 'audio/aac', extension: 'aac' },
] as const;

function pickFormat() {
  if (typeof MediaRecorder === 'undefined') return null;
  return FORMATS.find((format) => MediaRecorder.isTypeSupported(format.mime)) ?? null;
}

/** "1:05" */
function clock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

type Phase =
  | { name: 'idle' }
  | { name: 'recording'; startedAt: number }
  | { name: 'recorded'; url: string }
  | { name: 'error'; message: string };

/**
 * Records a voice note in the browser, up to the question's limit, then uploads it. It can
 * be played back and recorded again. Without a microphone (or permission), it says so.
 */
function VoiceControl({
  field,
  controlId,
  describedBy,
  value,
  onChange,
}: ControlProps<FieldOfType<'voice_note'>>) {
  const messages = useFormMessages();
  const { components } = useFormTheme();
  const { state, upload, reset } = useAnswerUpload(field, onChange);
  const [phase, setPhase] = useState<Phase>({ name: 'idle' });
  const [elapsed, setElapsed] = useState(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const ticker = useRef<ReturnType<typeof setInterval> | null>(null);
  const limit = field.maxDurationSeconds;

  const stopTracks = () => {
    stream.current?.getTracks().forEach((track) => {
      track.stop();
    });
    stream.current = null;
    if (ticker.current) clearInterval(ticker.current);
    ticker.current = null;
  };

  // A question that goes away stops recording and lets go of the microphone.
  useEffect(
    () => () => {
      if (recorder.current?.state === 'recording') recorder.current.stop();
      stopTracks();
    },
    [],
  );

  useEffect(() => {
    if (phase.name !== 'recorded') return;
    const { url } = phase;
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [phase]);

  const start = async () => {
    const format = pickFormat();
    // Browsers leave out mediaDevices on insecure (http) pages.
    if (!format || !('mediaDevices' in navigator)) {
      setPhase({ name: 'error', message: messages.voice.unsupported });
      return;
    }
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setPhase({
        name: 'error',
        message: messages.voice.allowMicrophone,
      });
      return;
    }
    reset();
    chunks.current = [];
    const media = new MediaRecorder(stream.current, { mimeType: format.mime });
    recorder.current = media;
    media.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.current.push(event.data);
    };
    media.onstop = () => {
      stopTracks();
      const blob = new Blob(chunks.current, { type: format.mime.split(';')[0] });
      setPhase({ name: 'recorded', url: URL.createObjectURL(blob) });
      void upload(new File([blob], `voice-note.${format.extension}`, { type: blob.type }));
    };
    const startedAt = Date.now();
    setElapsed(0);
    setPhase({ name: 'recording', startedAt });
    media.start(1000);
    ticker.current = setInterval(() => {
      const seconds = (Date.now() - startedAt) / 1000;
      setElapsed(seconds);
      if (seconds >= limit && media.state === 'recording') media.stop();
    }, 250);
  };

  const stop = () => {
    if (recorder.current?.state === 'recording') recorder.current.stop();
  };

  const again = () => {
    setPhase({ name: 'idle' });
    reset();
  };

  const recording = phase.name === 'recording';
  const saved = isFileAnswer(value);

  return (
    <div className="flex flex-col gap-3" aria-describedby={describedBy}>
      <div className="flex flex-wrap items-center gap-3">
        {recording ? (
          <button
            id={controlId}
            type="button"
            className={cx(formButton(components), 'w-auto')}
            onClick={stop}
          >
            <Square aria-hidden className="size-4" fill="currentColor" />
            {messages.voice.stop}
          </button>
        ) : phase.name === 'recorded' || saved ? (
          <button id={controlId} type="button" className={secondaryButton} onClick={again}>
            <RotateCcw aria-hidden className="size-4" />
            {messages.voice.recordAgain}
          </button>
        ) : (
          <button
            id={controlId}
            type="button"
            className={cx(formButton(components), 'w-auto')}
            onClick={() => {
              void start();
            }}
          >
            <Mic aria-hidden className="size-4" />
            {messages.voice.record}
          </button>
        )}
        <span
          className={cx(
            'form-text-sm tabular-nums',
            recording ? 'text-(--form-fg)' : 'text-(--form-muted)',
          )}
        >
          {recording && (
            <span
              aria-hidden
              className="mr-1.5 inline-block size-2 rounded-full bg-(--form-danger) motion-safe:animate-pulse"
            />
          )}
          {recording ? `${clock(elapsed)} / ${clock(limit)}` : messages.voice.upTo(clock(limit))}
        </span>
      </div>
      {phase.name === 'recorded' && (
        // Respondents hear their own recording; it has no words to caption.
        // eslint-disable-next-line jsx-a11y/media-has-caption
        <audio controls src={phase.url} className="w-full max-w-md" aria-label="Your voice note" />
      )}
      <p role="status" className="form-text-sm text-(--form-muted) empty:hidden">
        {recording && messages.voice.recording}
        {phase.name === 'error' && phase.message}
        {state.status === 'uploading' && messages.voice.saving}
        {state.status === 'failed' && state.message}
        {saved && state.status === 'idle' && !recording && (
          <span className="inline-flex items-center gap-1.5">
            <Check aria-hidden className="size-4 text-(--form-accent)" />
            {messages.voice.saved}
          </span>
        )}
      </p>
    </div>
  );
}

export function Control(props: ControlProps) {
  return props.field.type === 'voice_note' ? <VoiceControl {...props} field={props.field} /> : null;
}
