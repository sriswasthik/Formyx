import {
  ADDRESS_PART_LABELS,
  formatAnswer,
  formatFileSize,
  isAddressAnswer,
  isDateRangeAnswer,
  isFileAnswer,
  isMatrixAnswer,
  matrixCell,
  optionLabel,
  REMOVED_OPTION_LABEL,
  type Field,
  type FieldOfType,
  type FileAnswer,
} from '@formyx/shared';
import { Download, ExternalLink, Mic, Paperclip, Signature } from 'lucide-react';
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

/** Opens an uploaded file in a new tab (`download` only applies to same-origin links). */
function fileLinkProps(file: FileAnswer) {
  return {
    target: '_blank',
    rel: 'noopener noreferrer',
    download: file.name,
    'aria-label': `Download ${file.name}, ${formatFileSize(file.size)}`,
  } as const;
}

/** Answers that are numbers, set in tabular figures. */
const NUMERIC_TYPES: readonly Field['type'][] = [
  'number',
  'rating',
  'nps',
  'opinion_scale',
  'slider',
  'currency',
];

function Swatch({ color }: { color: string }) {
  return (
    <span
      aria-hidden
      className="size-4 shrink-0 rounded-sm border"
      style={{ backgroundColor: color }}
    />
  );
}

/** A table cell's worth of an answer: one line, cut short when long. */
export function AnswerCell({ field, value }: { field: Field; value: unknown }) {
  const text = answerText(field, value);
  if (!text) return <Empty />;
  if (isFileAnswer(value)) {
    const Icon =
      field.type === 'signature' ? Signature : field.type === 'voice_note' ? Mic : Paperclip;
    const name =
      field.type === 'signature'
        ? 'Signature'
        : field.type === 'voice_note'
          ? 'Voice note'
          : value.name;
    return (
      <a
        {...fileLinkProps(value)}
        href={value.url}
        title={value.name}
        className="-mx-1 flex max-w-64 items-center gap-1.5 rounded-md px-1 text-accent transition-colors duration-150 hover:bg-hover hover:underline"
        onClick={(event) => {
          // Downloading the file is not opening the response.
          event.stopPropagation();
        }}
      >
        <Icon aria-hidden className="shrink-0" />
        <span className="truncate">{name}</span>
      </a>
    );
  }
  if (field.type === 'color' && typeof value === 'string') {
    return (
      <span className="flex items-center gap-2 font-mono text-13">
        <Swatch color={value} />
        {value}
      </span>
    );
  }
  const numeric = NUMERIC_TYPES.includes(field.type);
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

function npsGroup(score: number): string {
  return score >= 9 ? 'Promoter' : score >= 7 ? 'Passive' : 'Detractor';
}

/** Option labels as chips; picture choices show their pictures too. */
function OptionChips({
  field,
  ids,
}: {
  field: FieldOfType<'multi_choice' | 'picture_choice'>;
  ids: readonly unknown[];
}) {
  return (
    <ul className="flex flex-wrap gap-1.5">
      {ids.map((id) => {
        const label = typeof id === 'string' ? optionLabel(field, id) : '';
        const option =
          field.type === 'picture_choice'
            ? field.options.find((candidate) => candidate.id === id)
            : undefined;
        return (
          <li
            key={String(id)}
            className={cn(
              'flex items-center gap-2 rounded-md bg-muted px-2 py-0.5 text-13',
              option?.imageUrl && 'py-1 pl-1',
              label === REMOVED_OPTION_LABEL && 'text-muted-foreground',
            )}
          >
            {option?.imageUrl && (
              <img src={option.imageUrl} alt="" className="size-8 rounded-sm object-cover" />
            )}
            {label}
          </li>
        );
      })}
    </ul>
  );
}

/** An uploaded signature, drawn on white so the ink reads in dark mode too. */
function SignatureImage({ file }: { file: FileAnswer }) {
  return (
    <a
      {...fileLinkProps(file)}
      aria-label="Open the signature in a new tab"
      href={file.url}
      className="block w-fit max-w-full rounded-lg border bg-white p-2 transition-colors duration-150 hover:border-border-strong"
    >
      <img src={file.url} alt="Signature" className="h-24 max-w-full object-contain" />
    </a>
  );
}

function VoiceNote({ file }: { file: FileAnswer }) {
  return (
    <div className="flex flex-col gap-2">
      {/* A respondent's own recording: there is no transcript to caption it with. */}
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio
        controls
        preload="none"
        src={file.url}
        aria-label="Voice note"
        className="w-full max-w-sm"
      >
        <a href={file.url}>Download the voice note</a>
      </audio>
      <a
        {...fileLinkProps(file)}
        href={file.url}
        className="flex w-fit items-center gap-1.5 text-13 text-accent hover:underline"
      >
        <Download aria-hidden />
        Download ({formatFileSize(file.size)})
      </a>
    </div>
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
      return <OptionChips field={field} ids={value} />;
    case 'picture_choice':
      if (typeof value === 'string') return <OptionChips field={field} ids={[value]} />;
      if (Array.isArray(value)) return <OptionChips field={field} ids={value} />;
      break;
    case 'ranking':
      if (!Array.isArray(value)) break;
      return (
        <ol className="flex flex-col gap-1 text-14">
          {value.map((id, index) => (
            <li key={String(id)} className="flex gap-2">
              <span className="w-5 shrink-0 text-muted-foreground tabular-nums">{index + 1}.</span>
              {typeof id === 'string' ? optionLabel(field, id) : ''}
            </li>
          ))}
        </ol>
      );
    case 'matrix':
      if (!isMatrixAnswer(value)) break;
      return (
        <dl className="flex flex-col gap-2 text-14">
          {field.rows
            .filter((row) => row.id in value)
            .map((row) => (
              <div key={row.id} className="flex flex-col gap-0.5">
                <dt className="text-13 text-muted-foreground">{row.label}</dt>
                <dd>{matrixCell(field, value[row.id])}</dd>
              </div>
            ))}
        </dl>
      );
    case 'nps':
      if (typeof value !== 'number') break;
      return (
        <p className="text-14 font-medium tabular-nums">
          {value}{' '}
          <span className="font-normal text-muted-foreground">out of 10 · {npsGroup(value)}</span>
        </p>
      );
    case 'opinion_scale':
      if (typeof value !== 'number') break;
      return (
        <p className="text-14 font-medium tabular-nums">
          {value}{' '}
          <span className="font-normal text-muted-foreground">
            on a scale from {field.start} to {field.end}
          </span>
        </p>
      );
    case 'slider':
    case 'currency':
      return <p className="text-14 tabular-nums">{formatAnswer(field, value)}</p>;
    case 'address':
      if (!isAddressAnswer(value)) break;
      return (
        <address className="flex flex-col text-14 not-italic">
          {value.line1 && <span>{value.line1}</span>}
          {value.line2 && <span>{value.line2}</span>}
          <span>
            {[value.city, value.state].filter(Boolean).join(', ')}
            {value.pin && (
              <>
                {' '}
                <span className="sr-only">{ADDRESS_PART_LABELS.pin}</span>
                <span className="tabular-nums">{value.pin}</span>
              </>
            )}
          </span>
        </address>
      );
    case 'date_range':
      if (!isDateRangeAnswer(value)) break;
      return (
        <p className="text-14">
          {formatCalendarDate(value.start, 'long')} to {formatCalendarDate(value.end, 'long')}
        </p>
      );
    case 'url':
      // Answers were checked to be web links; anything else stays text.
      if (typeof value !== 'string' || !/^https?:\/\//i.test(value)) break;
      return (
        <a
          href={value}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="inline-flex max-w-full items-center gap-1.5 text-14 break-all text-accent hover:underline"
        >
          {value}
          <ExternalLink aria-hidden className="shrink-0" />
        </a>
      );
    case 'color':
      if (typeof value !== 'string') break;
      return (
        <p className="flex items-center gap-2 font-mono text-14">
          <Swatch color={value} />
          {value}
        </p>
      );
    case 'signature':
      if (isFileAnswer(value)) return <SignatureImage file={value} />;
      break;
    case 'voice_note':
      if (isFileAnswer(value)) return <VoiceNote file={value} />;
      break;
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
          className="text-14 text-accent tabular-nums hover:underline"
        >
          {formatAnswer(field, value)}
        </a>
      );
    case 'date':
      if (typeof value !== 'string') break;
      return <p className="text-14">{formatCalendarDate(value, 'long')}</p>;
    case 'number':
      if (typeof value !== 'number') break;
      return <p className="text-14 tabular-nums">{formatNumber(value, 6)}</p>;
    case 'file':
      if (isFileAnswer(value)) {
        return (
          <a
            {...fileLinkProps(value)}
            href={value.url}
            className="flex max-w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-14 transition-colors duration-150 hover:border-border-strong hover:bg-hover active:bg-pressed"
          >
            <Paperclip aria-hidden className="shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate font-medium">{value.name}</span>
            <span className="shrink-0 text-13 text-muted-foreground tabular-nums">
              {formatFileSize(value.size)}
            </span>
            <Download aria-hidden className="shrink-0 text-muted-foreground" />
          </a>
        );
      }
      // Answers from before uploads were stored kept only the file's name.
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
