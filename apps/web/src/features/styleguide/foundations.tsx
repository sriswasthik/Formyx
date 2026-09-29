import { cn } from '@/lib/utils';
import { Example, Section } from './section';

const TYPE_SCALE = [
  { className: 'text-40 font-semibold tracking-tighter', size: '40 / 48', use: 'Display' },
  { className: 'text-32 font-semibold tracking-tighter', size: '32 / 40', use: 'Hero heading' },
  { className: 'text-24 font-semibold tracking-tight', size: '24 / 32', use: 'Section heading' },
  { className: 'text-20 font-semibold tracking-tight', size: '20 / 28', use: 'Subsection' },
  {
    className: 'text-16 font-semibold tracking-tight',
    size: '16 / 24',
    use: 'Page and card titles',
  },
  { className: 'text-14', size: '14 / 21', use: 'Body (app UI)' },
  { className: 'text-13', size: '13 / 20', use: 'Labels, small UI' },
  { className: 'text-12', size: '12 / 16', use: 'Captions, badges' },
];

export function TypographySection() {
  return (
    <Section
      id="typography"
      title="Typography"
      description="Inter Variable. Headings are semibold with slightly tight tracking; numbers use tabular figures."
    >
      <Example title="Scale">
        <ul className="divide-y">
          {TYPE_SCALE.map(({ className, size, use }) => (
            <li
              key={size}
              className="grid gap-1 py-4 first:pt-0 last:pb-0 md:grid-cols-[140px_1fr] md:items-baseline md:gap-6"
            >
              <div className="text-12 text-muted-foreground">
                <span className="tabular-nums">{size}</span> · {use}
              </div>
              <p className={cn('truncate', className)}>Forms that feel effortless</p>
            </li>
          ))}
        </ul>
      </Example>
      <Example title="Text styles">
        <div className="flex flex-col gap-3">
          <p className="text-14">Primary text uses the foreground colour.</p>
          <p className="text-14 text-muted-foreground">
            Secondary text is muted (zinc-500 light / zinc-400 dark).
          </p>
          <p className="text-14">
            Links use the accent:{' '}
            <a
              href="#typography"
              className="rounded-sm text-accent underline-offset-4 hover:underline"
            >
              read the guide
            </a>
            .
          </p>
          <p className="text-14 tabular-nums">
            Tabular numbers: 1,204 responses · 98.6% completion
          </p>
        </div>
      </Example>
    </Section>
  );
}

const COLOR_GROUPS: { title: string; tokens: string[] }[] = [
  {
    title: 'Surfaces',
    tokens: ['background', 'surface', 'card', 'popover', 'muted', 'hover', 'pressed'],
  },
  {
    title: 'Text and lines',
    tokens: ['foreground', 'muted-foreground', 'border', 'border-strong', 'input', 'control'],
  },
  { title: 'Brand', tokens: ['primary', 'primary-foreground', 'accent', 'accent-subtle', 'ring'] },
  { title: 'Semantic', tokens: ['success', 'warning', 'danger', 'destructive', 'tooltip'] },
];

function Swatches({ theme }: { theme: 'light' | 'dark' }) {
  return (
    <div className={cn(theme, 'rounded-xl border bg-background p-5 text-foreground')}>
      <p className="mb-4 text-13 font-medium capitalize">{theme}</p>
      <div className="flex flex-col gap-5">
        {COLOR_GROUPS.map(({ title, tokens }) => (
          <div key={title}>
            <p className="mb-2 text-12 text-muted-foreground">{title}</p>
            <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4">
              {tokens.map((token) => (
                <li key={token} className="min-w-0">
                  <div
                    className="h-10 rounded-lg border"
                    style={{ background: `var(--${token})` }}
                  />
                  <p className="mt-1.5 truncate font-mono text-12 text-muted-foreground">{token}</p>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ColorsSection() {
  return (
    <Section
      id="colors"
      title="Colours"
      description="Every colour is a CSS variable with light and dark values. The accent (#2E5AAC) is reserved for focus, links and selection."
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <Swatches theme="light" />
        <Swatches theme="dark" />
      </div>
    </Section>
  );
}

const SPACING = [1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24];

export function SpacingSection() {
  return (
    <Section id="spacing" title="Spacing, radius and elevation" description="A 4px base grid.">
      <Example title="Spacing scale">
        <ul className="flex flex-col gap-2">
          {SPACING.map((step) => (
            <li key={step} className="flex items-center gap-4">
              <span className="w-16 shrink-0 text-12 text-muted-foreground tabular-nums">
                {step} · {step * 4}px
              </span>
              <span className="h-2 rounded-full bg-accent" style={{ width: step * 4 }} />
            </li>
          ))}
        </ul>
      </Example>
      <div className="grid gap-4 md:grid-cols-2">
        <Example title="Radius">
          <div className="flex flex-wrap gap-4">
            {[
              { className: 'rounded-md', label: '6px · menu items' },
              { className: 'rounded-lg', label: '8px · inputs, buttons' },
              { className: 'rounded-xl', label: '12px · cards, dialogs' },
            ].map(({ className, label }) => (
              <div key={label} className="flex flex-col items-start gap-2">
                <div className={cn('size-16 border bg-muted', className)} />
                <span className="text-12 text-muted-foreground">{label}</span>
              </div>
            ))}
          </div>
        </Example>
        <Example title="Elevation" className="bg-surface">
          <div className="flex flex-wrap gap-4">
            {[
              { className: '', label: 'Card · none' },
              { className: 'shadow-popover', label: 'Popover' },
              { className: 'shadow-dialog', label: 'Dialog' },
            ].map(({ className, label }) => (
              <div key={label} className="flex flex-col items-start gap-2">
                <div className={cn('size-16 rounded-xl border bg-popover', className)} />
                <span className="text-12 text-muted-foreground">{label}</span>
              </div>
            ))}
          </div>
        </Example>
      </div>
    </Section>
  );
}
