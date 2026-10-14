import { THEME_PRESETS, type FormTheme, type ThemePreset } from '@formyx/shared';
import {
  ArrowRight,
  Check,
  CircleCheck,
  CircleX,
  FileSpreadsheet,
  Hash,
  MessageSquare,
  NotebookText,
  Webhook,
} from 'lucide-react';
import { AnimatePresence, m, useReducedMotionConfig } from 'motion/react';
import { useEffect, useState } from 'react';
import { ThemeBackground } from '@/features/form-renderer/theme/background';
import { loadFont } from '@/features/form-renderer/theme/fonts';
import { themeStyle } from '@/features/form-renderer/theme/theme-variables';
import { DURATION, EASE_STANDARD } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { PresetSwatch } from '../preset-swatch';
import { useCycle, useOnScreen } from '../use-cycle';

/*
 * The bento's small pictures of the product, loaded as one chunk when the grid comes near the
 * screen. Forms in them are drawn with real presets through the renderer's own variables and
 * background; their data is sample data.
 */

function preset(id: string): ThemePreset {
  return THEME_PRESETS.find((candidate) => candidate.id === id) ?? THEME_PRESETS[0];
}

/** A theme without its drifting background: these pictures are small and many. */
function still(theme: FormTheme): FormTheme {
  return { ...theme, motion: { ...theme.motion, animatedBackground: false } };
}

/** Repeats while on screen and motion is allowed; holds on the first step otherwise. */
function useLoop(count: number, interval: number) {
  const [element, setElement] = useState<HTMLElement | null>(null);
  const onScreen = useOnScreen(element);
  const reduce = useReducedMotionConfig() ?? false;
  const index = useCycle({ count, interval, paused: reduce || !onScreen });
  return { ref: setElement, index, reduce };
}

/** The look's fonts, loaded once it is shown. */
function useFonts(theme: FormTheme) {
  const { headingFont, bodyFont } = theme.typography;
  useEffect(() => {
    void loadFont(headingFont);
    void loadFont(bodyFont);
  }, [headingFont, bodyFont]);
}

/** A form, small: its title, two questions and its button, in its look. */
function MiniForm({ theme, title }: { theme: FormTheme; title: string }) {
  useFonts(theme);
  return (
    <span
      className="relative isolate flex h-full w-full items-center justify-center overflow-hidden rounded-lg border p-4"
      style={themeStyle(theme)}
    >
      <ThemeBackground theme={theme} />
      <span className="flex w-full max-w-64 flex-col gap-2.5 rounded-(--form-container-radius) border border-(--form-container-border) bg-(--form-container-bg) p-4 text-left">
        <span className="truncate font-(family-name:--form-heading-font) text-[15px] leading-tight font-(--form-heading-weight) text-(--form-fg)">
          {title}
        </span>
        {['Your name', 'Email'].map((label) => (
          <span key={label} className="flex flex-col gap-1">
            <span className="font-(family-name:--form-body-font) text-[11px] leading-none text-(--form-fg)">
              {label}
            </span>
            <span className="block h-5 rounded-[min(var(--form-input-radius),6px)] border border-(--form-input-border) bg-(--form-input-bg)" />
          </span>
        ))}
        <span className="mt-1 flex h-6 w-16 items-center justify-center rounded-[min(var(--form-button-radius),6px)] border border-(--form-button-border) bg-(--form-button-bg) font-(family-name:--form-body-font) text-[10px] text-(--form-button-fg)">
          Send
        </span>
      </span>
    </span>
  );
}

const STUDIO_PRESETS = ['sunrise-mesh', 'sea-glass', 'blueprint', 'midnight', 'botanical'].map(
  preset,
);

/** Looks to pick from; pointing at one, or focusing it, dresses the form in it. */
export function DesignStudioPicture() {
  const [active, setActive] = useState(STUDIO_PRESETS[0]?.id ?? '');
  const current = STUDIO_PRESETS.find((candidate) => candidate.id === active) ?? STUDIO_PRESETS[0];
  if (!current) return null;
  return (
    <div className="flex h-full flex-col gap-3 p-4 sm:flex-row sm:p-5">
      <div role="group" aria-label="Looks" className="flex shrink-0 gap-1.5 sm:w-36 sm:flex-col">
        {STUDIO_PRESETS.map((look) => (
          <button
            key={look.id}
            type="button"
            aria-pressed={look.id === active}
            aria-label={`Show the ${look.name} look`}
            onPointerEnter={() => {
              setActive(look.id);
            }}
            onFocus={() => {
              setActive(look.id);
            }}
            onClick={() => {
              setActive(look.id);
            }}
            className={cn(
              'flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg border bg-background p-1 text-left text-12 transition-colors duration-150 ease-standard hover:border-border-strong sm:flex-none',
              look.id === active && 'border-accent ring-1 ring-accent hover:border-accent',
            )}
          >
            <PresetSwatch preset={look} className="h-full w-full p-1 sm:w-10 sm:shrink-0" />
            <span className="hidden truncate sm:block">{look.name}</span>
          </button>
        ))}
      </div>
      <div className="relative min-h-0 flex-1" aria-hidden>
        <AnimatePresence initial={false}>
          <m.div
            key={current.id}
            className="absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: DURATION.base, ease: EASE_STANDARD }}
          >
            <MiniForm theme={still(current.theme)} title="Workshop sign-up" />
          </m.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

const QUESTIONS = [
  {
    question: 'Pick a workshop',
    options: ['Design systems', 'Accessibility', 'Motion'],
  },
  {
    question: 'How did you hear about us?',
    options: ['A friend', 'Social media', 'Our newsletter'],
  },
  { question: 'Need a laptop?', options: ['Yes, please', 'No, I’ll bring mine'] },
];

/** One question per screen, sliding on to the next. */
export function ConversationalPicture() {
  const { ref, index, reduce } = useLoop(QUESTIONS.length, 3200);
  const theme = still(preset('midnight').theme);
  useFonts(theme);
  const step = QUESTIONS[index] ?? QUESTIONS[0];
  if (!step) return null;
  return (
    <div ref={ref} aria-hidden className="h-full p-4 sm:p-5">
      <div
        className="relative isolate flex h-full flex-col overflow-hidden rounded-lg border p-4"
        style={themeStyle(theme)}
      >
        <ThemeBackground theme={theme} />
        <span className="h-1 w-full overflow-hidden rounded-full bg-(--form-input-border)">
          <span
            className="block h-full rounded-full bg-(--form-accent) transition-[width] duration-250 ease-standard"
            style={{ width: `${((index + 1) / QUESTIONS.length) * 100}%` }}
          />
        </span>
        <div className="relative mt-4 flex-1">
          <AnimatePresence initial={false} mode="wait">
            <m.div
              key={index}
              initial={reduce ? false : { opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              transition={{ duration: DURATION.slow, ease: EASE_STANDARD }}
              className="flex flex-col gap-2.5 font-(family-name:--form-body-font) text-(--form-fg)"
            >
              <span className="font-(family-name:--form-heading-font) text-16 leading-tight font-(--form-heading-weight)">
                {step.question}
              </span>
              <span className="flex flex-col gap-1.5">
                {step.options.map((option, position) => (
                  <span
                    key={option}
                    className={cn(
                      'flex h-7 items-center gap-2 rounded-[min(var(--form-input-radius),6px)] border px-2 text-12',
                      position === 0
                        ? 'border-(--form-accent) bg-(--form-input-bg)'
                        : 'border-(--form-input-border) bg-(--form-input-bg)',
                    )}
                  >
                    <span className="flex size-4 items-center justify-center rounded-[3px] border border-(--form-input-border) text-[9px]">
                      {String.fromCharCode(65 + position)}
                    </span>
                    {option}
                  </span>
                ))}
              </span>
            </m.div>
          </AnimatePresence>
        </div>
        <span className="flex items-center gap-2 font-(family-name:--form-body-font) text-[11px] text-(--form-muted)">
          <span className="flex h-6 items-center gap-1 rounded-[min(var(--form-button-radius),6px)] bg-(--form-button-bg) px-2 text-(--form-button-fg)">
            OK
            <Check className="size-3" aria-hidden />
          </span>
          press Enter
        </span>
      </div>
    </div>
  );
}

function FlowNode({
  kind,
  title,
  className,
  wrap = false,
}: {
  kind: string;
  title: string;
  className?: string;
  /** The title may take two lines. */
  wrap?: boolean;
}) {
  return (
    <span
      className={cn('flex flex-col gap-0.5 rounded-lg border bg-background px-3 py-2', className)}
    >
      <span className="text-[11px] text-muted-foreground">{kind}</span>
      <span className={cn('text-13 leading-snug font-medium', !wrap && 'truncate')}>{title}</span>
    </span>
  );
}

/** A question that sends people one of two ways. */
export function LogicPicture() {
  return (
    <div aria-hidden className="flex h-full items-center gap-0 p-4 sm:p-5">
      <FlowNode kind="Page 1" title="Are you coming?" className="w-[34%] shrink-0" wrap />
      <svg viewBox="0 0 64 120" className="h-28 w-12 shrink-0 text-border-strong" fill="none">
        <path d="M0 60 C 32 60, 32 20, 64 20" stroke="currentColor" strokeWidth="1.5" />
        <path d="M0 60 C 32 60, 32 100, 64 100" stroke="currentColor" strokeWidth="1.5" />
      </svg>
      <span className="flex min-w-0 flex-1 flex-col gap-10">
        <span className="flex flex-col gap-1">
          <span className="self-start rounded-sm bg-accent-subtle px-1.5 text-[11px] font-medium text-accent">
            If Yes
          </span>
          <FlowNode kind="Page 2" title="Dietary needs" />
        </span>
        <span className="flex flex-col gap-1">
          <span className="self-start rounded-sm bg-muted px-1.5 text-[11px] font-medium text-muted-foreground">
            If No
          </span>
          <FlowNode kind="End screen" title="Sorry to miss you" />
        </span>
      </span>
    </div>
  );
}

const PEOPLE = [
  { name: 'Meera', answer: 'Yes · 2 guests' },
  { name: 'Kabir', answer: 'No' },
  { name: 'Ananya', answer: 'Yes · 1 guest' },
  { name: 'Rohan', answer: 'Yes · 3 guests' },
  { name: 'Isha', answer: 'Yes' },
  { name: 'Dev', answer: 'No' },
];
const SHOWN = 3;
const FIRST_COUNT = 24;

/** A count and the newest responses, a new one arriving every few seconds. */
export function ResponsesPicture() {
  const { ref, index } = useLoop(PEOPLE.length, 3500);
  // The newest first: the person at `index` has just answered.
  const rows = Array.from({ length: SHOWN }, (_, offset) => {
    const at = (index - offset + PEOPLE.length) % PEOPLE.length;
    return { ...PEOPLE[at], key: index - offset };
  });
  return (
    <div ref={ref} aria-hidden className="flex h-full flex-col p-4 sm:p-5">
      <div className="flex items-center justify-between">
        <span className="text-13 font-medium">Party RSVP</span>
        <span className="flex items-center gap-1.5 text-12 text-muted-foreground">
          <span className="size-1.5 rounded-full bg-success" />
          Live
        </span>
      </div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-32 font-semibold tracking-tighter tabular-nums">
          {FIRST_COUNT + index}
        </span>
        <span className="text-13 text-muted-foreground">responses</span>
      </div>
      <ul className="mt-3 flex flex-col gap-1.5 overflow-hidden">
        <AnimatePresence initial={false}>
          {rows.map((row, position) => (
            <m.li
              key={row.key}
              layout
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: DURATION.slow, ease: EASE_STANDARD }}
              className="flex h-9 items-center justify-between rounded-lg border bg-background px-3 text-13"
            >
              <span>{row.name}</span>
              <span className="flex items-center gap-3 text-muted-foreground">
                {row.answer}
                <span className="w-14 text-right text-12">
                  {position === 0 ? 'just now' : `${position * 2} min`}
                </span>
              </span>
            </m.li>
          ))}
        </AnimatePresence>
      </ul>
    </div>
  );
}

const MARKED = [
  { question: 'The capital of Australia', right: true },
  { question: 'The largest planet', right: true },
  { question: 'The year the web began', right: false },
  { question: 'The speed of light', right: true },
];

/** Answers marked right and wrong, a score and the pass mark. */
export function QuizPicture() {
  const score = MARKED.filter(({ right }) => right).length;
  return (
    <div aria-hidden className="flex h-full flex-col gap-1.5 p-4 sm:p-5">
      {MARKED.map(({ question, right }) => (
        <span
          key={question}
          className="flex h-8 items-center gap-2 rounded-lg border bg-background px-2.5 text-13"
        >
          {right ? (
            <CircleCheck className="text-success" aria-hidden />
          ) : (
            <CircleX className="text-danger" aria-hidden />
          )}
          <span className="truncate">{question}</span>
        </span>
      ))}
      <span className="mt-auto flex items-center justify-between pt-2 text-13">
        <span>
          Score{' '}
          <span className="font-semibold tabular-nums">
            {score} / {MARKED.length}
          </span>
          <span className="text-muted-foreground"> · pass mark 3</span>
        </span>
        <span className="rounded-full bg-success/10 px-2 py-0.5 text-12 font-medium text-success-text">
          Passed
        </span>
      </span>
    </div>
  );
}

const DESTINATIONS = [
  { name: 'Google Sheets', detail: 'A row per response', icon: FileSpreadsheet },
  { name: 'Notion', detail: 'A database row each', icon: NotebookText },
  { name: 'Slack', detail: 'A message per response', icon: Hash },
  { name: 'Discord', detail: 'A message per response', icon: MessageSquare },
  { name: 'Webhooks', detail: 'JSON to your server', icon: Webhook },
];

/** Where each response goes as it arrives. */
export function IntegrationsPicture() {
  return (
    <div aria-hidden className="flex h-full items-center p-4 sm:p-5">
      <ul className="grid w-full grid-cols-2 gap-2 sm:grid-cols-3">
        {DESTINATIONS.map(({ name, detail, icon: Icon }) => (
          <li
            key={name}
            className="flex items-center gap-2.5 rounded-lg border bg-background px-3 py-2.5"
          >
            <span className="flex shrink-0 items-center justify-center text-muted-foreground sm:size-8 sm:rounded-md sm:border">
              <Icon aria-hidden />
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-13 font-medium">{name}</span>
              <span className="hidden truncate text-12 text-muted-foreground sm:block">
                {detail}
              </span>
            </span>
          </li>
        ))}
        <li className="flex items-center gap-1.5 px-3 text-12 text-muted-foreground">
          Every response, as it arrives
          <ArrowRight className="size-3.5" aria-hidden />
        </li>
      </ul>
    </div>
  );
}
