import { ThemeThumbnail } from '@/features/form-renderer/theme/theme-thumbnail';
import type { GalleryTemplate } from './gallery';

/** A still picture of a template in its look, with its title and first questions. */
export function TemplateThumbnail({
  template,
  className,
}: {
  template: GalleryTemplate;
  className?: string;
}) {
  return (
    <ThemeThumbnail
      theme={template.theme}
      title={template.defaultTitle}
      labels={template.questions.map((question) => question.label)}
      className={className}
    />
  );
}
