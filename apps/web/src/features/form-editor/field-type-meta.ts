import { FIELD_TYPE_LABELS, type FieldType } from '@formyx/shared';
import {
  AlignLeft,
  CalendarDays,
  CalendarRange,
  CircleDot,
  Clock,
  EyeOff,
  FileUp,
  Gauge,
  Grid3x3,
  Hash,
  Image,
  Images,
  IndianRupee,
  Link,
  ListOrdered,
  Mail,
  MapPin,
  Mic,
  Palette,
  Phone,
  Pilcrow,
  Scissors,
  SeparatorHorizontal,
  ShieldCheck,
  Signature,
  SlidersHorizontal,
  SquareCheck,
  SquareChevronDown,
  SquarePlay,
  Star,
  TextCursorInput,
  ToggleLeft,
  SlidersVertical,
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
  picture_choice: Images,
  yes_no: ToggleLeft,
  nps: Gauge,
  opinion_scale: SlidersVertical,
  slider: SlidersHorizontal,
  ranking: ListOrdered,
  matrix: Grid3x3,
  address: MapPin,
  time: Clock,
  date_range: CalendarRange,
  url: Link,
  currency: IndianRupee,
  signature: Signature,
  color: Palette,
  image: Image,
  video: SquarePlay,
  divider: SeparatorHorizontal,
  page_break: Scissors,
  consent: ShieldCheck,
  hidden: EyeOff,
  voice_note: Mic,
};

/** One line under each type in the palette, saying what it is for. */
export const FIELD_TYPE_DESCRIPTIONS: Record<FieldType, string> = {
  short_text: 'A name, a title, a few words',
  long_text: 'Paragraphs of feedback or detail',
  email: 'An email address, checked',
  number: 'A whole or decimal number',
  phone: 'A phone number with country code',
  single_choice: 'Pick one option from a list',
  multi_choice: 'Pick any number of options',
  dropdown: 'Pick one from a long list',
  rating: 'Stars, hearts, faces or numbers',
  date: 'A day from a calendar',
  file: 'A document or image from their device',
  statement: 'Formatted text between questions',
  picture_choice: 'Pick one or more images',
  yes_no: 'A quick yes or no',
  nps: 'How likely to recommend, 0 to 10',
  opinion_scale: 'Agree or disagree on a scale',
  slider: 'A value on a range, with a unit',
  ranking: 'Put options in order',
  matrix: 'Rate several things on one scale',
  address: 'An Indian address, filled from the PIN code',
  time: 'A time of day',
  date_range: 'A start and an end date',
  url: 'A website address',
  currency: 'An amount of money, in rupees or another currency',
  signature: 'Draw or type a signature',
  color: 'A colour, picked or typed',
  image: 'A picture with alt text and caption',
  video: 'A YouTube or Vimeo video',
  divider: 'A line between sections',
  page_break: 'Start a new page',
  consent: 'Agree to terms with a checkbox',
  hidden: 'A value from the link, such as ?source=',
  voice_note: 'Record a short voice message',
};

export interface PaletteGroup {
  label: string;
  types: readonly FieldType[];
}

/** How the palette groups question types. Every type is in exactly one group. */
export const PALETTE_GROUPS: readonly PaletteGroup[] = [
  {
    label: 'Text and contact',
    types: ['short_text', 'long_text', 'email', 'phone', 'url', 'address'],
  },
  {
    label: 'Choice',
    types: ['single_choice', 'multi_choice', 'dropdown', 'picture_choice', 'yes_no', 'ranking'],
  },
  { label: 'Rating and scales', types: ['rating', 'nps', 'opinion_scale', 'slider', 'matrix'] },
  {
    label: 'Numbers, dates and times',
    types: ['number', 'currency', 'date', 'date_range', 'time'],
  },
  { label: 'Uploads and media', types: ['file', 'signature', 'voice_note', 'color'] },
  { label: 'Content and layout', types: ['statement', 'image', 'video', 'divider', 'page_break'] },
  { label: 'Special', types: ['consent', 'hidden'] },
];

export function fieldTypeLabel(type: FieldType): string {
  return FIELD_TYPE_LABELS[type];
}

/** Types whose label, description or group match `query`, ignoring case; all for none. */
export function searchFieldTypes(query: string): PaletteGroup[] {
  const needle = query.trim().toLowerCase();
  if (needle === '') return [...PALETTE_GROUPS];
  return PALETTE_GROUPS.map((group) => ({
    label: group.label,
    types: group.types.filter((type) =>
      [FIELD_TYPE_LABELS[type], FIELD_TYPE_DESCRIPTIONS[type], group.label].some((text) =>
        text.toLowerCase().includes(needle),
      ),
    ),
  })).filter((group) => group.types.length > 0);
}
