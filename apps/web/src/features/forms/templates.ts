import {
  FORM_TEMPLATES,
  isAnswerableFieldType,
  type FormTemplate,
  type FormTemplateId,
} from '@formyx/shared';
import { CalendarDays, FilePlus2, MessageSquareText, type LucideIcon } from 'lucide-react';

const ICONS: Record<FormTemplateId, LucideIcon> = {
  blank: FilePlus2,
  event_registration: CalendarDays,
  feedback_survey: MessageSquareText,
};

export interface TemplateOption extends FormTemplate {
  icon: LucideIcon;
  questionCount: number;
}

/** The shared templates, with what the web app shows for each. */
export const TEMPLATE_OPTIONS: readonly TemplateOption[] = FORM_TEMPLATES.map((template) => ({
  ...template,
  icon: ICONS[template.id],
  questionCount: template.build().fields.filter((field) => isAnswerableFieldType(field.type))
    .length,
}));
