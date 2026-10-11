import { fontStack, isFileAnswer, type FieldOfType } from '@formyx/shared';
import { Check, Eraser } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { inputRadius, secondaryButton, textControl } from '../styles';
import { loadFont } from '../theme/fonts';
import type { ControlProps } from '../types';
import { useAnswerUpload } from './use-answer-upload';

/** How long after the last stroke (or key) the signature is saved. */
const SAVE_DELAY_MS = 800;
const HEIGHT = 160;
const SCRIPT_FONT = 'dancing-script';

type Mode = 'draw' | 'type';

/** The canvas as a PNG file, or `null` if nothing is on it. */
function toFile(canvas: HTMLCanvasElement): Promise<File | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      resolve(blob ? new File([blob], 'signature.png', { type: 'image/png' }) : null);
    }, 'image/png');
  });
}

/** Writes a typed name across the pad in the script font, as large as fits. */
function writeName(canvas: HTMLCanvasElement, context: CanvasRenderingContext2D, typed: string) {
  const width = canvas.getBoundingClientRect().width;
  context.clearRect(0, 0, width, HEIGHT);
  if (typed.trim() === '') return;
  let size = 56;
  context.font = `${size}px ${fontStack(SCRIPT_FONT)}`;
  while (size > 18 && context.measureText(typed).width > width - 32) {
    size -= 4;
    context.font = `${size}px ${fontStack(SCRIPT_FONT)}`;
  }
  context.textBaseline = 'middle';
  context.fillText(typed, 16, HEIGHT / 2);
}

function prepare(canvas: HTMLCanvasElement): CanvasRenderingContext2D | null {
  const ratio = window.devicePixelRatio || 1;
  const width = canvas.getBoundingClientRect().width;
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(HEIGHT * ratio);
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.scale(ratio, ratio);
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.lineWidth = 2.25;
  // The form's text colour, so the signature reads on the form.
  context.strokeStyle = getComputedStyle(canvas).color;
  context.fillStyle = getComputedStyle(canvas).color;
  return context;
}

/**
 * A signature, drawn with a mouse, finger or pen, or typed and set in a script face. Either
 * way it is saved as a PNG a moment after the last stroke. Typing is the way for keyboards
 * and screen readers.
 */
function SignatureControl({
  field,
  controlId,
  describedBy,
  invalid,
  value,
  onChange,
}: ControlProps<FieldOfType<'signature'>>) {
  const { state, upload, reset } = useAnswerUpload(field, onChange);
  const [mode, setMode] = useState<Mode>('draw');
  const [name, setName] = useState('');
  const [hasInk, setHasInk] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const contextRef = useRef<CanvasRenderingContext2D | null>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saved = isFileAnswer(value);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) contextRef.current = prepare(canvas);
    if (mode === 'type') void loadFont(SCRIPT_FONT);
  }, [mode, saved]);

  const saveSoon = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      void toFile(canvas).then((file) => {
        if (file) void upload(file);
      });
    }, SAVE_DELAY_MS);
  }, [upload]);

  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    const canvas = canvasRef.current;
    if (canvas) contextRef.current = prepare(canvas);
    setHasInk(false);
    setName('');
    reset();
  };

  const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - box.left, y: event.clientY - box.top };
  };

  const drawName = (typed: string) => {
    const canvas = canvasRef.current;
    const context = contextRef.current ?? (canvas && prepare(canvas));
    if (!canvas || !context) return;
    contextRef.current = context;
    writeName(canvas, context, typed);
  };

  if (saved && state.status === 'idle') {
    return (
      <div className="flex flex-wrap items-center gap-3" id={controlId} tabIndex={-1}>
        <span className="inline-flex items-center gap-2 form-text">
          <Check aria-hidden className="size-4 text-(--form-accent)" />
          Signature saved
        </span>
        <button type="button" className={secondaryButton} onClick={clear}>
          Sign again
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div role="group" aria-label="How to sign" className="flex gap-1">
        {(['draw', 'type'] as const).map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={mode === option}
            className={cn(
              secondaryButton,
              'h-9 aria-pressed:bg-(--form-accent-subtle) aria-pressed:text-(--form-fg)',
            )}
            onClick={() => {
              clear();
              setMode(option);
            }}
          >
            {option === 'draw' ? 'Draw' : 'Type'}
          </button>
        ))}
      </div>
      {mode === 'type' && (
        <input
          id={controlId}
          type="text"
          autoComplete="name"
          placeholder="Type your full name"
          className={cn(textControl, inputRadius, 'h-11')}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            drawName(event.target.value);
            if (event.target.value.trim()) saveSoon();
            else reset();
          }}
        />
      )}
      <div className="relative">
        <canvas
          ref={canvasRef}
          id={mode === 'draw' ? controlId : undefined}
          tabIndex={mode === 'draw' ? 0 : -1}
          aria-label={
            mode === 'draw'
              ? 'Signature pad: sign with a mouse, finger or pen, or choose Type'
              : 'Your typed signature'
          }
          aria-describedby={describedBy}
          className={cn(
            'block w-full touch-none rounded-(--form-input-radius) border border-dashed border-(--form-box-border) bg-(--form-box-bg) text-(--form-fg)',
            mode === 'draw' && 'cursor-crosshair',
            invalid && 'border-(--form-danger)',
          )}
          style={{ height: HEIGHT }}
          onPointerDown={(event) => {
            if (mode !== 'draw') return;
            event.currentTarget.setPointerCapture(event.pointerId);
            drawing.current = true;
            last.current = point(event);
            if (timer.current) clearTimeout(timer.current);
          }}
          onPointerMove={(event) => {
            const context = contextRef.current;
            if (!drawing.current || !context || !last.current) return;
            const next = point(event);
            context.beginPath();
            context.moveTo(last.current.x, last.current.y);
            context.lineTo(next.x, next.y);
            context.stroke();
            last.current = next;
            setHasInk(true);
          }}
          onPointerUp={() => {
            if (!drawing.current) return;
            drawing.current = false;
            last.current = null;
            saveSoon();
          }}
        />
        {mode === 'draw' && !hasInk && (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 flex items-center justify-center form-text-sm text-(--form-muted)"
          >
            Sign here
          </span>
        )}
      </div>
      <div className="flex items-center justify-between gap-2">
        <p role="status" className="form-text-sm text-(--form-muted)">
          {state.status === 'uploading' && 'Saving your signature…'}
          {state.status === 'failed' && state.message}
        </p>
        <button type="button" className={secondaryButton} onClick={clear}>
          <Eraser aria-hidden className="size-4" />
          Clear
        </button>
      </div>
    </div>
  );
}

export function Control(props: ControlProps) {
  return props.field.type === 'signature' ? (
    <SignatureControl {...props} field={props.field} />
  ) : null;
}
