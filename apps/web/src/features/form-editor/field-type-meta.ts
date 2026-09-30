import { FIELD_TYPE_LABELS, type FieldType } from '@formyx/shared';
import {
  AlignLeft,
  CalendarDays,
  CircleDot,
  FileUp,
  Hash,
  Mail,
  Phone,
  Pilcrow,
  SquareCheck,
  SquareChevronDown,
  Star,
  TextCursorInput,
  type LucideIcon,
} from 'lucide-react';

export const FIELD_TYPE_ICONS: Record<FieldType, LucideIcon> = {
  short_text: TextCursorInput,
  long_text: AlignLeft,
  email: Mail,
  number: Hash,
  phone: Phone,
  single_choice: CircleDot,
  multi_choice: SquareCheck,
  dropdown: SquareChevronDown,
  rating: Star,
  date: CalendarDays,
  file: FileUp,
  statement: Pilcrow,
};

export interface PaletteGroup {
  label: string;
  types: readonly FieldType[];
}

/** How the palette groups question types. */
export const PALETTE_GROUPS: readonly PaletteGroup[] = [
  { label: 'Text', types: ['short_text', 'long_text', 'email', 'number', 'phone'] },
  { label: 'Choice', types: ['single_choice', 'multi_choice', 'dropdown', 'rating'] },
  { label: 'Other', types: ['date', 'file', 'statement'] },
];

export function fieldTypeLabel(type: FieldType): string {
  return FIELD_TYPE_LABELS[type];
}
