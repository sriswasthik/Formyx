import type { FormTheme } from '@formyx/shared';
import { useEffect } from 'react';
import { ThemeBackground } from '@/features/form-renderer/theme/background';
import { loadFont } from '@/features/form-renderer/theme/fonts';
import { themeStyle } from '@/features/form-renderer/theme/theme-variables';
import { cn } from '@/lib/utils';
import type { GalleryTemplate } from './gallery';

/** The form's title, its first questions and its button, small, in its own look. */
function MiniForm({ template }: { template: GalleryTemplate }) {
  return (
    <span className="flex w-full flex-col gap-2 text-left">
      <span className="line-clamp-2 font-(family-name:--form-heading-font) text-[15px] leading-tight font-(--form-heading-weight) text-(--form-fg)">
        {template.defaultTitle}
      </span>
      {template.questions.slice(0, 2).map((question) => (
        <span key={question.id} className="flex flex-col gap-1">
          <span className="truncate font-(family-name:--form-body-font) text-[10px] leading-none text-(--form-fg)">
            {question.label}
          </span>
          <span className="block h-3.5 w-full rounded-[min(var(--form-input-radius),5px)] border border-(--form-input-border) bg-(--form-input-bg)" />
        </span>
      ))}
      <span className="mt-0.5 block h-4 w-14 rounded-[min(var(--form-button-radius),6px)] border border-(--form-button-border) bg-(--form-button-bg)" />
    </span>
  );
}

/**
 * A still picture of a template in its look, drawn by the same code as real forms. Decorative:
 * the card it sits in names the template.
 */
export function TemplateThumbnail({
  template,
  className,
}: {
  template: GalleryTemplate;
  className?: string;
}) {
  const { theme } = template;
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
      className={cn(
        'relative isolate flex aspect-[4/3] w-full overflow-hidden rounded-lg',
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
            <MiniForm template={template} />
          </span>
        </>
      ) : (
        <>
          <ThemeBackground theme={still} />
          <span className="flex w-full items-center justify-center px-6">
            <span
              className={cn(
                'w-full max-w-52',
                boxed &&
                  'rounded-[min(var(--form-container-radius),10px)] border border-(--form-container-border) bg-(--form-container-bg) p-3.5 [box-shadow:var(--form-container-shadow)]',
              )}
            >
              <MiniForm template={template} />
            </span>
          </span>
        </>
      )}
    </span>
  );
}
