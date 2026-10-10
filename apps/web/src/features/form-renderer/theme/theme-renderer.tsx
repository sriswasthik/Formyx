import type { FormTheme } from '@formyx/shared';
import type * as React from 'react';
import { cn } from '@/lib/utils';
import { FormCover, FormLogo } from '../branding';
import { ThemeBackground } from './background';
import { FormThemeContext } from './theme-context';
import { useThemeFonts } from './fonts';
import { themeStyle } from './theme-variables';

/**
 * `page`: a page of its own (the public form), at least as tall as the screen, with the
 * background staying in view while it scrolls. `frame`: fills a box in the builder (the
 * editor canvas and preview). `embed`: inside another site's iframe, with less space around.
 */
export type ThemeVariant = 'page' | 'frame' | 'embed';

interface ThemeRendererProps {
  theme: FormTheme;
  variant: ThemeVariant;
  /** The form itself: header, questions and button, or the thank-you message. */
  children: React.ReactNode;
  /** Under the form, outside its container, such as "Made with Formyx". */
  footer?: React.ReactNode;
  className?: string;
}

/** Space around the form when it has no container of its own. */
const CONTENT_PADDING: Record<ThemeVariant, string> = {
  page: 'px-6 py-10 @xl:py-14',
  frame: 'px-6 py-10 @xl:py-14',
  embed: 'px-5 py-6 @xl:px-8 @xl:py-8',
};

/** Space between the page edge and a container. */
const GUTTER: Record<ThemeVariant, string> = {
  page: 'px-4 py-8 @xl:px-6 @xl:py-14',
  frame: 'px-4 py-8 @xl:px-6 @xl:py-14',
  embed: 'p-3 @xl:p-5',
};

/** Space inside a container, by the theme's container padding. */
const CONTAINER_PADDING: Record<
  FormTheme['components']['containerPadding'],
  Record<ThemeVariant, string>
> = {
  compact: {
    page: 'px-5 py-6 @xl:px-7 @xl:py-7',
    frame: 'px-5 py-6 @xl:px-7 @xl:py-7',
    embed: 'px-4 py-5 @xl:px-6 @xl:py-6',
  },
  regular: {
    page: 'px-6 py-8 @xl:px-10 @xl:py-10',
    frame: 'px-6 py-8 @xl:px-10 @xl:py-10',
    embed: 'px-5 py-6 @xl:px-8 @xl:py-8',
  },
  spacious: {
    page: 'px-6 py-10 @xl:px-14 @xl:py-14',
    frame: 'px-6 py-10 @xl:px-14 @xl:py-14',
    embed: 'px-5 py-8 @xl:px-10 @xl:py-10',
  },
};

const ALIGNMENT: Record<FormTheme['layout']['alignment'], string> = {
  start: 'mr-auto',
  center: 'mx-auto',
  end: 'ml-auto',
};

type DrawnLayout = Exclude<FormTheme['layout']['mode'], 'conversational'>;

/**
 * The conversational layout's one-question-at-a-time flow comes with the Design Studio; until
 * then it is laid out as a card, which is what it starts from.
 */
function drawnLayout(theme: FormTheme): DrawnLayout {
  return theme.layout.mode === 'conversational' ? 'card' : theme.layout.mode;
}

interface ColumnProps {
  theme: FormTheme;
  variant: ThemeVariant;
  layout: DrawnLayout;
  children: React.ReactNode;
}

/** The column the form sits in: plain, or in a container (card, floating or bordered). */
function Column({ theme, variant, layout, children }: ColumnProps) {
  const boxed = layout !== 'split' && theme.components.containerStyle !== 'none';
  const align = layout === 'split' ? ALIGNMENT.center : ALIGNMENT[theme.layout.alignment];
  // Cards carry their cover image; classic pages show it across the top of the page.
  const cover = layout === 'card' && <FormCover theme={theme} />;

  if (!boxed) {
    return (
      <div className={cn('w-full max-w-(--form-width)', align, layout === 'card' && 'my-auto')}>
        {cover}
        <div className={CONTENT_PADDING[variant]}>{children}</div>
      </div>
    );
  }

  return (
    <div className={cn('flex w-full flex-col', GUTTER[variant], layout === 'card' && 'my-auto')}>
      <div
        data-form-container={theme.components.containerStyle}
        className={cn(
          'w-full max-w-(--form-width) overflow-clip',
          'rounded-(--form-container-radius) border border-(--form-container-border)',
          'bg-(--form-container-bg) [box-shadow:var(--form-container-shadow)]',
          align,
        )}
      >
        {cover}
        <div className={CONTAINER_PADDING[theme.components.containerPadding][variant]}>
          {children}
        </div>
      </div>
    </div>
  );
}

/** The logo in a bar across the top, when the theme puts it there. */
function TopLogo({ theme }: { theme: FormTheme }) {
  if (!theme.branding.logoUrl || theme.layout.logoPosition === 'above_title') return null;
  return (
    <div className="px-6 pt-6 @xl:px-10">
      <FormLogo theme={theme} placement="top" />
    </div>
  );
}

/**
 * Draws a form in its theme: the CSS variables every form component reads, the background
 * layers and overlay, and the layout around the form. The editor canvas, the preview, the
 * public form and embeds all go through this, so they always look the same. Sizes follow the
 * renderer's own width (container queries), so a narrow canvas shows the phone layout.
 */
export function ThemeRenderer({ theme, variant, children, footer, className }: ThemeRendererProps) {
  useThemeFonts(theme);
  const layout = drawnLayout(theme);
  const column = (
    <Column theme={theme} variant={variant} layout={layout}>
      {children}
    </Column>
  );

  return (
    <FormThemeContext.Provider value={theme}>
      <div
        data-form-theme
        data-layout={layout}
        className={cn(
          '@container relative isolate flex flex-col',
          variant === 'page' && 'min-h-dvh',
          className,
        )}
        style={themeStyle(theme)}
      >
        {layout === 'split' ? (
          <div
            className={cn(
              'flex flex-1 flex-col @3xl:flex-row',
              theme.layout.alignment === 'start' && '@3xl:flex-row-reverse',
            )}
          >
            <div
              data-split-media
              className="relative isolate h-44 shrink-0 @3xl:h-auto @3xl:flex-1"
            >
              <ThemeBackground theme={theme} sticky={variant === 'page'} />
              <FormCover theme={theme} className="absolute inset-0 h-full @xl:h-full" />
            </div>
            <div className="flex flex-1 flex-col bg-(--form-bg)">
              <TopLogo theme={theme} />
              {column}
              {footer}
            </div>
          </div>
        ) : (
          <>
            <ThemeBackground theme={theme} sticky={variant === 'page'} />
            <TopLogo theme={theme} />
            {layout === 'classic' && <FormCover theme={theme} />}
            {column}
            {footer}
          </>
        )}
      </div>
    </FormThemeContext.Provider>
  );
}
