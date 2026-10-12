import {
  csvOutcomeColumns,
  type Field,
  type FormLogic,
  type SubmissionOrder,
  type SubmissionRecord,
} from '@formyx/shared';
import {
  createColumnHelper,
  rowSelectionFeature,
  tableFeatures,
  useTable,
  type RowSelectionState,
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { m } from 'motion/react';
import { createContext, useContext, useMemo } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { DURATION, EASE_STANDARD } from '@/lib/motion';
import { formatDateTime, formatRelativeTime } from '@/lib/relative-time';
import { useNow } from '@/lib/use-now';
import { cn } from '@/lib/utils';
import { useArrivals } from '../arrivals-store';
import { AnswerCell } from './answer-value';

interface ColumnMeta {
  /** Classes for this column's header and body cells. */
  className?: string;
}

const columnMeta: ColumnMeta = {};
const features = tableFeatures({ rowSelectionFeature, columnMeta });
const helper = createColumnHelper<typeof features, SubmissionRecord>();

/** The first columns stay put while the answers scroll sideways. */
const STICKY = 'sticky z-10';
const SELECT_WIDTH = 'w-11 min-w-11';

interface ResponsesTableProps {
  /** The published questions that take an answer, one column each. */
  fields: Field[];
  /** The published form's logic: quiz scores, values and end screens get columns too. */
  logic?: FormLogic | undefined;
  rows: SubmissionRecord[];
  order: SubmissionOrder;
  onOrderChange: (order: SubmissionOrder) => void;
  /** Selection for bulk actions; leave out to hide the checkboxes (viewers). */
  selection?: { state: RowSelectionState; onChange: (state: RowSelectionState) => void };
  onOpen: (id: string) => void;
}

type TableActions = Pick<ResponsesTableProps, 'order' | 'onOrderChange' | 'onOpen'>;

/**
 * TanStack renders each column's `header` and `cell` as a component, so a column built anew
 * remounts every cell (losing keyboard focus, say). Columns therefore only change with the
 * questions; what changes more often reaches the cells through here.
 */
const TableActionsContext = createContext<TableActions | null>(null);

function useTableActions(): TableActions {
  const actions = useContext(TableActionsContext);
  if (!actions) throw new Error('Table cells must render inside <ResponsesTable>');
  return actions;
}

function SubmittedHeader() {
  const { order, onOrderChange } = useTableActions();
  const Icon = order === 'newest' ? ArrowDown : ArrowUp;
  return (
    <button
      type="button"
      className="-mx-1.5 inline-flex items-center gap-1 rounded-md px-1.5 py-1 font-medium transition-colors duration-150 hover:bg-hover hover:text-foreground active:bg-pressed"
      onClick={() => {
        onOrderChange(order === 'newest' ? 'oldest' : 'newest');
      }}
    >
      Submitted
      <Icon aria-hidden className="size-3.5" />
      <span className="sr-only">
        {order === 'newest'
          ? ', newest first. Show oldest first'
          : ', oldest first. Show newest first'}
      </span>
    </button>
  );
}

/** When the response came in, as a button that opens it (the keyboard's way into a row). */
function OpenResponseButton({ response }: { response: SubmissionRecord }) {
  const { onOpen } = useTableActions();
  const now = useNow();
  return (
    <button
      type="button"
      className="-mx-1.5 rounded-md px-1.5 py-0.5 text-left whitespace-nowrap tabular-nums transition-colors duration-150 hover:bg-hover"
      aria-label={`Open the response from ${formatDateTime(response.createdAt)}`}
      onClick={(event) => {
        event.stopPropagation();
        onOpen(response.id);
      }}
    >
      <time dateTime={response.createdAt} title={formatDateTime(response.createdAt)}>
        {formatRelativeTime(response.createdAt, now)}
      </time>
    </button>
  );
}

function buildColumns(
  fields: Field[],
  selectable: boolean,
  logic: FormLogic | undefined,
  withEmail: boolean,
) {
  const outcomes = logic ? csvOutcomeColumns({ logic }) : [];
  return helper.columns([
    ...(selectable
      ? [
          helper.display({
            id: 'select',
            header: ({ table }) => (
              <Checkbox
                aria-label="Select all loaded responses"
                checked={
                  table.getIsAllRowsSelected()
                    ? true
                    : table.getIsSomeRowsSelected()
                      ? 'indeterminate'
                      : false
                }
                onCheckedChange={(checked) => {
                  table.toggleAllRowsSelected(checked === true);
                }}
              />
            ),
            cell: ({ row }) => (
              <Checkbox
                aria-label={`Select the response from ${formatDateTime(row.original.createdAt)}`}
                checked={row.getIsSelected()}
                onClick={(event) => {
                  // Ticking a box is not opening the response.
                  event.stopPropagation();
                }}
                onCheckedChange={(checked) => {
                  row.toggleSelected(checked === true);
                }}
              />
            ),
            meta: { className: cn(STICKY, 'left-0', SELECT_WIDTH, 'pr-0') },
          }),
        ]
      : []),
    helper.accessor('createdAt', {
      id: 'submitted',
      header: () => <SubmittedHeader />,
      cell: ({ row }) => <OpenResponseButton response={row.original} />,
      meta: { className: cn(STICKY, selectable ? 'left-11' : 'left-0', 'min-w-32 border-r') },
    }),
    // Asked before the questions (and confirmed, when one response per address).
    ...(withEmail
      ? [
          helper.accessor((row) => row.respondentEmail ?? null, {
            id: 'respondent-email',
            header: () => 'Email',
            cell: (info) => {
              const email = info.getValue();
              return email === null ? (
                <>
                  <span aria-hidden className="text-muted-foreground">
                    —
                  </span>
                  <span className="sr-only">None</span>
                </>
              ) : (
                <span className="block max-w-56 truncate" title={email}>
                  {email}
                </span>
              );
            },
          }),
        ]
      : []),
    ...fields.map((field) =>
      helper.accessor((row) => row.answers[field.id], {
        id: field.id,
        header: () => (
          <span title={field.label} className="block max-w-56 truncate">
            {field.label.trim() || 'Untitled question'}
          </span>
        ),
        cell: (info) => <AnswerCell field={field} value={info.getValue()} />,
      }),
    ),
    // As the server worked them out.
    ...outcomes.map((column, index) =>
      helper.accessor((row) => column.cell(row.outcome), {
        id: `outcome-${index}`,
        header: () => <span className="block max-w-56 truncate">{column.header}</span>,
        cell: (info) => {
          const value = info.getValue();
          return value === null ? (
            <>
              <span aria-hidden className="text-muted-foreground">
                —
              </span>
              <span className="sr-only">None</span>
            </>
          ) : (
            <span className="tabular-nums">{value}</span>
          );
        },
      }),
    ),
  ]);
}

/**
 * Responses as rows, a column per question. Opening a row (click, or the time's button for
 * keyboards) shows the whole response. Sorting and paging happen on the server.
 */
export function ResponsesTable({
  fields,
  logic,
  rows,
  order,
  onOrderChange,
  selection,
  onOpen,
}: ResponsesTableProps) {
  const arrived = useArrivals((state) => state.highlighted);
  const selectable = selection !== undefined;
  const withEmail = rows.some((row) => row.respondentEmail);
  const columns = useMemo(
    () => buildColumns(fields, selectable, logic, withEmail),
    [fields, selectable, logic, withEmail],
  );
  const actions = useMemo(() => ({ order, onOrderChange, onOpen }), [order, onOrderChange, onOpen]);

  const table = useTable(
    {
      features,
      columns,
      data: rows,
      getRowId: (row) => row.id,
      state: { rowSelection: selection?.state ?? {} },
      onRowSelectionChange: (updater) => {
        if (!selection) return;
        selection.onChange(typeof updater === 'function' ? updater(selection.state) : updater);
      },
    },
    (state) => ({ rowSelection: state.rowSelection }),
  );

  return (
    <TableActionsContext.Provider value={actions}>
      {/* `relative` makes this the containing block of the cells' sr-only text, so it is
          clipped with the rest of the table instead of widening the page. */}
      <div className="relative overflow-x-auto rounded-xl border bg-card">
        <table className="w-full min-w-max border-separate border-spacing-0 text-14">
          <thead>
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id}>
                {group.headers.map((header) => (
                  <th
                    key={header.id}
                    scope="col"
                    className={cn(
                      'h-10 border-b bg-surface px-3 text-left align-middle text-12 font-medium whitespace-nowrap text-muted-foreground',
                      header.column.columnDef.meta?.className,
                    )}
                  >
                    {header.isPlaceholder ? null : <table.FlexRender header={header} />}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => {
              const isNew = arrived.has(row.id);
              const selected = row.getIsSelected();
              return (
                <m.tr
                  key={row.id}
                  // Only rows that arrive live slide in; the rest are simply there.
                  initial={isNew ? { opacity: 0, y: -4 } : false}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: DURATION.base, ease: EASE_STANDARD }}
                  className={cn('group cursor-pointer', isNew && 'row-arrived')}
                  onClick={() => {
                    onOpen(row.id);
                  }}
                >
                  {row.getAllCells().map((cell) => (
                    <td
                      key={cell.id}
                      className={cn(
                        'h-11 border-b px-3 align-middle transition-colors duration-150 group-last:border-b-0',
                        selected ? 'bg-row-selected' : 'bg-card group-hover:bg-row-hover',
                        cell.column.columnDef.meta?.className,
                      )}
                    >
                      <table.FlexRender cell={cell} />
                    </td>
                  ))}
                </m.tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </TableActionsContext.Provider>
  );
}
