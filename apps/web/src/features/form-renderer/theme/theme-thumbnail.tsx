import type { FormTheme } from '@formyx/shared';
import { useEffect } from 'react';
import { ThemeBackground } from '@/features/form-renderer/theme/background';
import { loadFont } from '@/features/form-renderer/theme/fonts';
import { themeStyle } from '@/features/form-renderer/theme/theme-variables';
import { cx } from '@/lib/cx';

/** The form's title, two questions and its button, small, in its own look. */
function MiniForm({ title, labels }: { title: string; labels: readonly string[] }) {
  // Without question labels (a form in the dashboard), short bars stand in for them.
  const questions = labels.length > 0 ? labels.slice(0, 2) : [null, null];
  return (
    <span className="flex w-full flex-col gap-2 text-left">
      <span className="line-clamp-2 font-(family-name:--form-heading-font) text-[15px] leading-tight font-(--form-heading-weight) text-(--form-fg)">
        {title}
      </span>
      {questions.map((label, index) => (
        <span key={index} className="flex flex-col gap-1">
          {label === null ? (
            <span className="block h-1.5 w-1/3 rounded-full bg-(--form-fg) opacity-25" />
          ) : (
            <span className="truncate font-(family-name:--form-body-font) text-[10px] leading-none text-(--form-fg)">
              {label}
            </span>
          )}
          <span className="block h-3.5 w-full rounded-[min(var(--form-input-radius),5px)] border border-(--form-input-border) bg-(--form-input-bg)" />
        </span>
      ))}
      <span className="mt-0.5 block h-4 w-14 rounded-[min(var(--form-button-radius),6px)] border border-(--form-button-border) bg-(--form-button-bg)" />
    </span>
  );
}

/**
 * A still picture of a form in its look, drawn by the same code as real forms (the theme's
 * variables and background): its title, two questions and its button. Decorative: the card it
 * sits in names the form.
 */
export function ThemeThumbnail({
  theme,
  title,
  labels = [],
  aspect = '4/3',
  className,
}: {
  theme: FormTheme;
  title: string;
  /** The first questions' labels, if known. */
  labels?: readonly string[];
  /** Width to height: the gallery's cards are 4:3, the dashboard's 16:10. */
  aspect?: '4/3' | '16/10';
  className?: string;
}) {
  const headingFont = theme.typography.headingFont;
  useEffect(() => {
    void loadFont(headingFont);
  }, [headingFont]);

  // Still, and with every shape: a thumbnail is narrow, but stands for the full-size form.
  const still: FormTheme = {
    ...theme,
    background: {
      layers: theme.background.layers.map((layer) =>
        layer.type === 'shapes' ? { ...layer, hideOnMobile: false } : layer,
      ),
    },
    motion: { ...theme.motion, animatedBackground: false },
  };
  const split = theme.layout.mode === 'split';
  const boxed = !split && theme.components.containerStyle !== 'none';

  return (
    <span
      aria-hidden
      className={cx(
        'relative isolate flex w-full overflow-hidden rounded-lg',
        aspect === '4/3' ? 'aspect-[4/3]' : 'aspect-[16/10]',
        className,
      )}
      style={themeStyle(still)}
    >
      {split ? (
        <>
          <span className="relative isolate w-2/5">
            <ThemeBackground theme={still} />
          </span>
          <span className="flex w-3/5 items-center bg-(--form-bg) px-4">
            <MiniForm title={title} labels={labels} />
          </span>
        </>
      ) : (
        <>
          <ThemeBackground theme={still} />
          <span className="flex w-full items-center justify-center px-6">
            <span
              className={cx(
                'w-full max-w-52',
                boxed &&
                  'rounded-[min(var(--form-container-radius),10px)] border border-(--form-container-border) bg-(--form-container-bg) p-3.5 [box-shadow:var(--form-container-shadow)]',
              )}
            >
              <MiniForm title={title} labels={labels} />
            </span>
          </span>
        </>
      )}
    </span>
  );
}
