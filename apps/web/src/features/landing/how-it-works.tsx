import { CircleDot, Copy, GripVertical, Mail, TextCursorInput } from 'lucide-react';
import type * as React from 'react';
import { CONTAINER, SECTION_LEAD, SECTION_TITLE, SECTION_Y } from '@/features/marketing/layout';
import { Reveal } from '@/features/marketing/reveal';
import { cn } from '@/lib/utils';

/** Questions being put in order, one lifted as it is dragged. */
function BuildPicture() {
  const rows = [
    { icon: TextCursorInput, label: 'Your name' },
    { icon: Mail, label: 'Email', lifted: true },
    { icon: CircleDot, label: 'Which session?' },
  ];
  return (
    <div className="flex flex-col gap-2">
      {rows.map(({ icon: Icon, label, lifted }) => (
        <span
          key={label}
          className={cn(
            'flex h-9 items-center gap-2 rounded-lg border bg-background px-2.5 text-13',
            lifted && 'translate-x-2 border-border-strong shadow-popover',
          )}
        >
          <GripVertical className="text-subtle-foreground" aria-hidden />
          <Icon className="text-muted-foreground" aria-hidden />
          {label}
        </span>
      ))}
    </div>
  );
}

/** The form's link, ready to copy, and the other ways to share it. */
function SharePicture() {
  const host = typeof window === 'undefined' ? 'formyx' : window.location.host;
  return (
    <div className="flex flex-col gap-2">
      <span className="flex h-9 items-center gap-2 rounded-lg border bg-background pr-1 pl-2.5 text-13">
        <span className="min-w-0 flex-1 truncate text-muted-foreground">
          {host}/f/<span className="text-foreground">workshop-sign-up</span>
        </span>
        <span className="flex h-7 items-center gap-1 rounded-md bg-primary px-2 text-12 font-medium text-primary-foreground">
          <Copy className="size-3.5" aria-hidden />
          Copy
        </span>
      </span>
      <span className="flex gap-2 text-12">
        {['QR code', 'Embed code'].map((way) => (
          <span
            key={way}
            className="rounded-md border bg-background px-2 py-1 text-muted-foreground"
          >
            {way}
          </span>
        ))}
      </span>
    </div>
  );
}

/** A week of responses as bars, and where people stop. */
function UnderstandPicture() {
  const week = [3, 5, 4, 8, 6, 9, 7];
  return (
    <div className="flex flex-col gap-2">
      <span className="flex h-[76px] items-end gap-1.5 rounded-lg border bg-background p-2.5">
        {week.map((value, index) => (
          <span
            key={index}
            className={cn('flex-1 rounded-sm', index === 5 ? 'bg-accent' : 'bg-muted')}
            style={{ height: `${(value / 9) * 100}%` }}
          />
        ))}
      </span>
      <span className="flex justify-between text-12 text-muted-foreground">
        <span>Sample week</span>
        <span className="tabular-nums">Most stop at question 4</span>
      </span>
    </div>
  );
}

const STEPS: { title: string; text: string; picture: React.ReactNode }[] = [
  {
    title: 'Build',
    text: 'Drag questions into place, add logic, and pick a look or make your own.',
    picture: <BuildPicture />,
  },
  {
    title: 'Share',
    text: 'Send the link, embed it in your site or print its QR code.',
    picture: <SharePicture />,
  },
  {
    title: 'Understand',
    text: 'Responses arrive live, with charts, drop-off and exports when you need them.',
    picture: <UnderstandPicture />,
  },
];

export function HowItWorks() {
  return (
    <section aria-labelledby="how-title" className={cn(CONTAINER, SECTION_Y, 'below-fold')}>
      <Reveal>
        <h2 id="how-title" className={SECTION_TITLE}>
          How it works
        </h2>
        <p className={SECTION_LEAD}>From a blank page to answers you can use, in three steps.</p>
      </Reveal>
      <ol className="mt-10 grid grid-cols-1 gap-4 md:mt-12 md:grid-cols-3 md:gap-6">
        {STEPS.map(({ title, text, picture }, index) => (
          <li key={title}>
            <Reveal delay={index * 0.06} className="flex h-full flex-col rounded-xl border p-6">
              <div aria-hidden className="rounded-lg bg-muted p-4">
                {picture}
              </div>
              <h3 className="mt-6 flex items-baseline gap-2 text-16 font-semibold tracking-tight">
                <span className="text-13 font-medium text-muted-foreground tabular-nums">
                  {index + 1}
                </span>
                {title}
              </h3>
              <p className="mt-2 text-14 text-muted-foreground">{text}</p>
            </Reveal>
          </li>
        ))}
      </ol>
    </section>
  );
}
