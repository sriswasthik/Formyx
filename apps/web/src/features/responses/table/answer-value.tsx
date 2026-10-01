import { formatAnswer, optionLabel, REMOVED_OPTION_LABEL, type Field } from '@formyx/shared';
import { Paperclip } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCalendarDate, formatNumber } from '../format';
import { answerText } from './answer-text';

function Empty() {
  return (
    <>
      <span aria-hidden className="text-muted-foreground">
        —
      </span>
      <span className="sr-only">No answer</span>
    </>
  );
}

/** A table cell's worth of an answer: one line, cut short when long. */
export function AnswerCell({ field, value }: { field: Field; value: unknown }) {
  const text = answerText(field, value);
  if (!text) return <Empty />;
  const numeric = field.type === 'number' || field.type === 'rating';
  return (
    <span title={text} className={cn('block max-w-64 truncate', numeric && 'tabular-nums')}>
      {text}
    </span>
  );
}

function RatingMeter({ value, scale }: { value: number; scale: number }) {
  return (
    <span aria-hidden className="flex gap-1">
      {Array.from({ length: scale }, (_, index) => (
        <span
          key={index}
          className={cn('h-1.5 w-4 rounded-full', index < value ? 'bg-accent' : 'bg-muted')}
        />
      ))}
    </span>
  );
}

/** An answer in full, formatted for its question type. */
export function AnswerDetail({ field, value }: { field: Field; value: unknown }) {
  if (value === undefined || value === null || value === '') {
    return <p className="text-14 text-muted-foreground">No answer</p>;
  }

  switch (field.type) {
    case 'multi_choice':
      if (!Array.isArray(value)) break;
      return (
        <ul className="flex flex-wrap gap-1.5">
          {value.map((id) => {
            const label = typeof id === 'string' ? optionLabel(field, id) : '';
            return (
              <li
                key={String(id)}
                className={cn(
                  'rounded-md bg-muted px-2 py-0.5 text-13',
                  label === REMOVED_OPTION_LABEL && 'text-muted-foreground',
                )}
              >
                {label}
              </li>
            );
          })}
        </ul>
      );
    case 'rating':
      if (typeof value !== 'number') break;
      return (
        <div className="flex items-center gap-3">
          <p className="text-14 font-medium tabular-nums">
            {value}{' '}
            <span className="font-normal text-muted-foreground">out of {field.ratingScale}</span>
          </p>
          <RatingMeter value={value} scale={field.ratingScale} />
        </div>
      );
    case 'email':
      if (typeof value !== 'string') break;
      return (
        <a href={`mailto:${value}`} className="text-14 break-all text-accent hover:underline">
          {value}
        </a>
      );
    case 'phone':
      if (typeof value !== 'string') break;
      return (
        <a
          href={`tel:${value.replace(/[^\d+]/g, '')}`}
          className="text-14 text-accent hover:underline"
        >
          {value}
        </a>
      );
    case 'date':
      if (typeof value !== 'string') break;
      return <p className="text-14">{formatCalendarDate(value, 'long')}</p>;
    case 'number':
      if (typeof value !== 'number') break;
      return <p className="text-14 tabular-nums">{formatNumber(value, 6)}</p>;
    case 'file':
      return (
        <p className="flex items-center gap-2 text-14 break-all">
          <Paperclip aria-hidden className="shrink-0 text-muted-foreground" />
          {formatAnswer(field, value)}
        </p>
      );
    default:
      break;
  }
  return <p className="text-14 break-words whitespace-pre-wrap">{formatAnswer(field, value)}</p>;
}
