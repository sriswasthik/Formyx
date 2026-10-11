import { formatAnswer, isDateRangeAnswer, type Field } from '@formyx/shared';
import { formatCalendarDate, formatNumber } from '../format';

/** An answer as one line of text, the way people read it. Empty for no answer. */
export function answerText(field: Field, value: unknown): string {
  if (value === undefined || value === null) return '';
  if (field.type === 'rating' && typeof value === 'number')
    return `${value} / ${field.ratingScale}`;
  if (field.type === 'number' && typeof value === 'number') return formatNumber(value, 6);
  if (field.type === 'nps' && typeof value === 'number') return `${value} / 10`;
  if (field.type === 'opinion_scale' && typeof value === 'number') return `${value} / ${field.end}`;
  if (field.type === 'date' && typeof value === 'string') return formatCalendarDate(value);
  if (field.type === 'date_range' && isDateRangeAnswer(value))
    return `${formatCalendarDate(value.start)} – ${formatCalendarDate(value.end)}`;
  return formatAnswer(field, value).replace(/\s+/g, ' ').trim();
}
