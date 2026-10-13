import {
  createDefaultTheme,
  galleryTemplates,
  isAnswerableFieldType,
  THEME_PRESETS,
  type Field,
  type FormTemplate,
  type FormTheme,
  type TemplateCategory,
} from '@formyx/shared';

/** A template as the gallery shows it: its look and its questions. */
export interface GalleryTemplate extends FormTemplate {
  theme: FormTheme;
  /** The preset's name, e.g. "Blueprint". */
  lookName: string | null;
  /** The questions people answer, in order (statements left out). */
  questions: Field[];
}

function toGalleryTemplate(template: FormTemplate): GalleryTemplate {
  const preset = THEME_PRESETS.find((candidate) => candidate.id === template.presetId);
  return {
    ...template,
    theme: preset?.theme ?? createDefaultTheme(),
    lookName: preset?.name ?? null,
    questions: template.build().fields.filter((field) => isAnswerableFieldType(field.type)),
  };
}

export const GALLERY: readonly GalleryTemplate[] = galleryTemplates().map(toGalleryTemplate);

export function galleryInCategory(category: TemplateCategory): GalleryTemplate[] {
  return GALLERY.filter((template) => template.category === category);
}

export function gallerySlug(slug: string): GalleryTemplate | undefined {
  return GALLERY.find((template) => template.slug === slug);
}

/** Where "Use this template" leads: the app makes the form, after sign-up if need be. */
export function templateAppPath(template: Pick<FormTemplate, 'id'>): string {
  return `/app/forms?template=${template.id}`;
}
