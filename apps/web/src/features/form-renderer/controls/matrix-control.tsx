import { isMatrixAnswer, type FieldOfType, type MatrixAnswer } from '@formyx/shared';
import { Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { useLayoutEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { choiceOption, secondaryButton } from '../styles';
import type { ControlProps } from '../types';

/** Below this width (the form's, not the screen's) rows become swipeable cards. */
const TABLE_MIN_WIDTH = 448;

function useWidth(ref: React.RefObject<HTMLElement | null>): number | null {
  const [width, setWidth] = useState<number | null>(null);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    setWidth(node.getBoundingClientRect().width);
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(entry.contentRect.width);
    });
    observer.observe(node);
    return () => {
      observer.disconnect();
    };
  }, [ref]);
  return width;
}

type MatrixProps = ControlProps<FieldOfType<'matrix'>>;

function picked(answer: MatrixAnswer, rowId: string): string[] {
  const value = answer[rowId];
  return value === undefined ? [] : Array.isArray(value) ? value : [value];
}

/** The answer with one cell picked or unpicked; rows left empty drop out. */
function toggle(
  field: FieldOfType<'matrix'>,
  answer: MatrixAnswer,
  rowId: string,
  columnId: string,
): MatrixAnswer {
  if (!field.multiple) return { ...answer, [rowId]: columnId };
  const current = picked(answer, rowId);
  const cells = current.includes(columnId)
    ? current.filter((id) => id !== columnId)
    : [...current, columnId];
  if (cells.length > 0) return { ...answer, [rowId]: cells };
  const { [rowId]: _cleared, ...rest } = answer;
  return rest;
}

const cellIndicator = (multiple: boolean, checked: boolean) =>
  cn(
    'flex size-4.5 shrink-0 items-center justify-center border border-(--form-border-strong) bg-(--form-bg) transition-colors duration-150',
    multiple ? 'rounded-[min(var(--form-radius),5px)]' : 'rounded-full',
    checked && 'border-(--form-accent) bg-(--form-accent) text-(--form-accent-fg)',
  );

/** Rows down the side, columns across the top, a radio (or checkbox) in each cell. */
function MatrixTable({ field, controlId, describedBy, answer, onPick }: TableProps) {
  return (
    <div className="-mx-1 overflow-x-auto px-1">
      <table
        className="w-full border-separate border-spacing-y-1.5 form-text"
        aria-describedby={describedBy}
      >
        <thead>
          <tr>
            <td />
            {field.columns.map((column) => (
              <th
                key={column.id}
                scope="col"
                className="px-2 pb-1 text-center align-bottom form-text-sm font-medium text-(--form-muted)"
              >
                {column.label || 'Untitled column'}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {field.rows.map((row, rowIndex) => {
            const cells = picked(answer, row.id);
            return (
              <tr key={row.id} className="bg-(--form-choice-bg)">
                <th
                  scope="row"
                  className="rounded-l-(--form-choice-radius) py-2.5 pr-3 pl-3.5 text-left font-normal break-words"
                >
                  {row.label || 'Untitled row'}
                </th>
                {field.columns.map((column, columnIndex) => {
                  const checked = cells.includes(column.id);
                  const last = columnIndex === field.columns.length - 1;
                  return (
                    <td
                      key={column.id}
                      className={cn('p-0 text-center', last && 'rounded-r-(--form-choice-radius)')}
                    >
                      <label
                        className={cn(
                          'flex h-11 min-w-11 cursor-pointer items-center justify-center rounded-md',
                          'transition-colors duration-150 hover:bg-(--form-choice-bg-hover)',
                          'has-focus-visible:outline-2 has-focus-visible:outline-(--form-accent)',
                        )}
                      >
                        <input
                          id={rowIndex === 0 && columnIndex === 0 ? controlId : undefined}
                          type={field.multiple ? 'checkbox' : 'radio'}
                          name={`${controlId}-${row.id}`}
                          checked={checked}
                          aria-label={`${row.label || 'Untitled row'}: ${column.label || 'Untitled column'}`}
                          className="sr-only"
                          onChange={() => {
                            onPick(row.id, column.id);
                          }}
                        />
                        <span aria-hidden className={cellIndicator(field.multiple, checked)}>
                          {checked &&
                            (field.multiple ? (
                              <Check className="size-3" strokeWidth={3} />
                            ) : (
                              <span className="size-1.5 rounded-full bg-(--form-accent-fg)" />
                            ))}
                        </span>
                      </label>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

interface TableProps {
  field: FieldOfType<'matrix'>;
  controlId: string;
  describedBy: string | undefined;
  answer: MatrixAnswer;
  onPick: (rowId: string, columnId: string) => void;
}

/**
 * On narrow screens: one row per card, swiped (or stepped with the buttons) sideways. Each
 * card is its own group of radios or checkboxes; picking a single answer moves to the next.
 */
function MatrixCards({ field, controlId, describedBy, answer, onPick }: TableProps) {
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const total = field.rows.length;

  const show = (next: number) => {
    const clamped = Math.min(Math.max(next, 0), total - 1);
    setIndex(clamped);
    const card = track.current?.children[clamped];
    if (card instanceof HTMLElement) {
      track.current?.scrollTo({
        left: card.offsetLeft - (track.current.offsetLeft || 0),
        behavior: 'smooth',
      });
    }
  };

  return (
    <div className="flex flex-col gap-2" aria-describedby={describedBy}>
      <div
        ref={track}
        className="-mx-1 flex snap-x snap-mandatory [scrollbar-width:none] gap-3 overflow-x-auto px-1 pb-1"
        onScroll={(event) => {
          const element = event.currentTarget;
          const width = element.firstElementChild?.getBoundingClientRect().width ?? 1;
          setIndex(Math.round(element.scrollLeft / (width + 12)));
        }}
      >
        {field.rows.map((row, rowIndex) => {
          const cells = picked(answer, row.id);
          const rowName = row.label || 'Untitled row';
          return (
            <fieldset
              key={row.id}
              className="flex w-[85%] shrink-0 snap-center flex-col gap-2 rounded-(--form-choice-radius) border border-(--form-border) p-3"
            >
              <legend className="sr-only">{rowName}</legend>
              <p aria-hidden className="form-text font-medium break-words">
                {rowName}
              </p>
              <div className="flex flex-col gap-1.5">
                {field.columns.map((column, columnIndex) => {
                  const checked = cells.includes(column.id);
                  return (
                    <label key={column.id} className={cn(choiceOption.list, 'py-2.5')}>
                      <input
                        id={rowIndex === 0 && columnIndex === 0 ? controlId : undefined}
                        type={field.multiple ? 'checkbox' : 'radio'}
                        name={`${controlId}-${row.id}`}
                        checked={checked}
                        className="peer sr-only"
                        onChange={() => {
                          onPick(row.id, column.id);
                          if (!field.multiple && rowIndex < total - 1) show(rowIndex + 1);
                        }}
                      />
                      <span aria-hidden className={cellIndicator(field.multiple, checked)}>
                        {checked && field.multiple && <Check className="size-3" strokeWidth={3} />}
                        {checked && !field.multiple && (
                          <span className="size-1.5 rounded-full bg-(--form-accent-fg)" />
                        )}
                      </span>
                      <span className="min-w-0 flex-1 break-words">
                        {column.label || 'Untitled column'}
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          );
        })}
      </div>
      {total > 1 && (
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            className={secondaryButton}
            disabled={index === 0}
            onClick={() => {
              show(index - 1);
            }}
          >
            <ChevronLeft aria-hidden className="size-4" />
            Previous<span className="sr-only"> row</span>
          </button>
          <span className="form-text-sm text-(--form-muted) tabular-nums" aria-live="polite">
            <span className="sr-only">Row </span>
            {index + 1} of {total}
          </span>
          <button
            type="button"
            className={secondaryButton}
            disabled={index >= total - 1}
            onClick={() => {
              show(index + 1);
            }}
          >
            Next<span className="sr-only"> row</span>
            <ChevronRight aria-hidden className="size-4" />
          </button>
        </div>
      )}
    </div>
  );
}

function MatrixControl({ field, controlId, describedBy, value, onChange }: MatrixProps) {
  const root = useRef<HTMLDivElement>(null);
  const width = useWidth(root);
  const answer = isMatrixAnswer(value) ? value : {};
  if (field.rows.length === 0 || field.columns.length === 0) {
    return <p className="form-text-sm text-(--form-muted)">No rows or columns yet</p>;
  }
  const props: TableProps = {
    field,
    controlId,
    describedBy,
    answer,
    onPick: (rowId, columnId) => {
      const next = toggle(field, answer, rowId, columnId);
      onChange(Object.keys(next).length > 0 ? next : null);
    },
  };
  return (
    <div
      ref={root}
      data-matrix-layout={width !== null && width < TABLE_MIN_WIDTH ? 'cards' : 'table'}
    >
      {width !== null && width < TABLE_MIN_WIDTH ? (
        <MatrixCards {...props} />
      ) : (
        <MatrixTable {...props} />
      )}
    </div>
  );
}

export function Control(props: ControlProps) {
  return props.field.type === 'matrix' ? <MatrixControl {...props} field={props.field} /> : null;
}
