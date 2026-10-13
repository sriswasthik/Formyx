import {
  FORM_TEMPLATES,
  isAnswerableFieldType,
  type FormTemplate,
  type FormTemplateId,
  type TemplateCategory,
} from '@formyx/shared';
import {
  BriefcaseBusiness,
  CalendarDays,
  FilePlus2,
  GraduationCap,
  HeartHandshake,
  ListChecks,
  MessageSquareText,
  ShoppingBag,
  type LucideIcon,
} from 'lucide-react';

const CATEGORY_ICONS: Record<TemplateCategory, LucideIcon> = {
  events: CalendarDays,
  feedback: MessageSquareText,
  hr: BriefcaseBusiness,
  education: GraduationCap,
  business: ShoppingBag,
  quizzes: ListChecks,
  community: HeartHandshake,
};

export interface TemplateOption extends FormTemplate {
  icon: LucideIcon;
  questionCount: number;
}

/** The shared templates, with what the web app shows for each. */
export const TEMPLATE_OPTIONS: readonly TemplateOption[] = FORM_TEMPLATES.map((template) => ({
  ...template,
  icon: template.category ? CATEGORY_ICONS[template.category] : FilePlus2,
  questionCount: template.build().fields.filter((field) => isAnswerableFieldType(field.type))
    .length,
}));

/** Offered first in an empty workspace: a blank form and a popular start from most categories. */
export const FEATURED_TEMPLATE_IDS: readonly FormTemplateId[] = [
  'blank',
  'event_registration',
  'feedback_survey',
  'contact_form',
  'job_application',
  'order_form',
];

export function templateOptions(ids: readonly FormTemplateId[]): TemplateOption[] {
  return ids.flatMap((id) => TEMPLATE_OPTIONS.find((option) => option.id === id) ?? []);
}

/**
 * The templates in `category` (all of them for null) whose name or description has every word
 * of `query`. The blank form is always there: it is a way to start, not a template to find.
 */
export function filterTemplates(
  options: readonly TemplateOption[],
  { query, category }: { query: string; category: TemplateCategory | null },
): TemplateOption[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return options.filter((option) => {
    if (option.id === 'blank') return true;
    if (category && option.category !== category) return false;
    const text = `${option.name} ${option.description}`.toLowerCase();
    return words.every((word) => text.includes(word));
  });
}
