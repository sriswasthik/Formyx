import type * as React from 'react';
import { Logo, type LogoVariant } from '@/components/brand/logo';
import { LOGO_SHAPES, SNAPPED_UP_TO } from '@/components/brand/logo-geometry';
import { cn } from '@/lib/utils';
import { Example, Section } from './section';
import { StyleguideHeader } from './styleguide-header';

const SIZES = [16, 24, 32, 48, 96];

const VARIANTS: { variant: LogoVariant; label: string; use: string }[] = [
  {
    variant: 'full',
    label: 'Full',
    use: 'Headers, sign-in, error pages: wherever the name should be read.',
  },
  {
    variant: 'icon',
    label: 'Icon',
    use: 'Favicons, app icons, avatars. Its square takes the text colour, so it inverts with the theme.',
  },
  {
    variant: 'mark',
    label: 'Mark',
    use: 'Beside text that already says Formyx, such as the footer and the form badge. Takes the current text colour.',
  },
];

/** The checkbox's width, as a share of the icon: the clear space on every side. */
const CLEAR_SPACE = (LOGO_SHAPES[2]?.width ?? 4.5) / 32;

const MINIMUM: { variant: LogoVariant; size: number; label: string }[] = [
  { variant: 'icon', size: 16, label: 'Icon: 16px' },
  { variant: 'mark', size: 16, label: 'Mark: 16px' },
  { variant: 'full', size: 20, label: 'Full: 20px tall' },
];

function ThemePanel({ theme, children }: { theme: 'light' | 'dark'; children: React.ReactNode }) {
  return (
    <div className={cn(theme, 'rounded-xl border bg-background p-5 text-foreground md:p-6')}>
      <p className="mb-4 text-12 font-medium text-muted-foreground capitalize">{theme}</p>
      {children}
    </div>
  );
}

function VariantRow({ variant, theme }: { variant: LogoVariant; theme: 'light' | 'dark' }) {
  const minimum = MINIMUM.find((rule) => rule.variant === variant)?.size ?? 0;
  return (
    // The 96px full logo is wider than a phone's panel: it scrolls within, not the page, and
    // a scrolling region takes focus so it scrolls from the keyboard too.
    <div
      role="region"
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a scrollable region
      tabIndex={0}
      aria-label={`${variant} logo at each size, ${theme}`}
      className="-m-1 overflow-x-auto rounded-md p-1"
    >
      <ul className="flex flex-wrap items-end gap-x-8 gap-y-5">
        {SIZES.map((size) => (
          <li key={size} className="flex flex-col items-start gap-2">
            <Logo variant={variant} size={size} decorative />
            <span className="text-12 whitespace-nowrap text-muted-foreground tabular-nums">
              {size}px{size < minimum && ' · below minimum'}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The logo inside its clear space, which is shaded. */
function ClearSpace({ variant, size }: { variant: LogoVariant; size: number }) {
  const space = size * CLEAR_SPACE;
  return (
    <div className="inline-flex flex-col items-start gap-2">
      <div
        className="inline-flex rounded-sm border border-dashed border-accent bg-accent/10"
        style={{ padding: space }}
      >
        <span className="inline-flex bg-background">
          <Logo variant={variant} size={size} decorative />
        </span>
      </div>
      <span className="text-12 text-muted-foreground tabular-nums">
        {size}px, {Number(space.toFixed(1))}px clear
      </span>
    </div>
  );
}

/** Development-only: the logo's variants, sizes and rules. Not included in production builds. */
export function BrandPage() {
  return (
    <div className="min-h-dvh">
      <StyleguideHeader />
      <main className="mx-auto flex max-w-6xl flex-col gap-16 px-6 py-10 md:px-10 md:py-14">
        <div>
          <h1 className="text-32 font-semibold tracking-tighter">Brand</h1>
          <p className="mt-2 max-w-2xl text-16 text-muted-foreground">
            The Formyx logo is an F made of three form elements: a long input, a short input and a
            checkbox. Use the <code className="text-14">Logo</code> component; never redraw it.
          </p>
        </div>

        <Section
          id="variants"
          title="Variants"
          description={`At ${SNAPPED_UP_TO}px and below the shapes are snapped to whole pixels, so small sizes stay crisp.`}
        >
          {VARIANTS.map(({ variant, label, use }) => (
            <Example key={variant} title={label} className="flex flex-col gap-4 p-4 md:p-4">
              <p className="text-13 text-muted-foreground">{use}</p>
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <ThemePanel theme="light">
                  <VariantRow variant={variant} theme="light" />
                </ThemePanel>
                <ThemePanel theme="dark">
                  <VariantRow variant={variant} theme="dark" />
                </ThemePanel>
              </div>
            </Example>
          ))}
        </Section>

        <Section
          id="clear-space"
          title="Clear space"
          description="Keep space equal to the checkbox's width (4.5 of the icon's 32 units, about 14% of its height) on every side. Nothing else goes inside it."
        >
          <Example title="Shaded: the clear space" className="flex flex-wrap items-end gap-10">
            <ClearSpace variant="full" size={48} />
            <ClearSpace variant="icon" size={96} />
            <ClearSpace variant="mark" size={96} />
          </Example>
        </Section>

        <Section
          id="minimum-size"
          title="Minimum size"
          description="Below these sizes the logo stops reading. Where the full logo would be smaller than 20px tall, use the icon on its own."
        >
          <Example title="The smallest each may be" className="flex flex-wrap items-end gap-10">
            {MINIMUM.map(({ variant, size, label }) => (
              <div key={variant} className="flex flex-col items-start gap-2">
                <Logo variant={variant} size={size} decorative />
                <span className="text-12 text-muted-foreground">{label}</span>
              </div>
            ))}
          </Example>
        </Section>
      </main>
    </div>
  );
}
