import { answerableFields, type FormDetail } from '@formyx/shared';
import type { RowSelectionState } from '@tanstack/react-table';
import { Download, Inbox, RotateCw, Search, SearchX, Share2, Trash2, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useMemo, useState } from 'react';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { DURATION, EASE_STANDARD } from '@/lib/motion';
import { formatCount } from '../format';
import { exportResponsesUrl } from '../responses-api';
import { useDeleteResponses, useResponsesList } from '../use-responses';
import { DeleteResponsesDialog } from './delete-responses-dialog';
import { ResponseSheet } from './response-sheet';
import { ResponsesTable } from './responses-table';
import { useResponseFilters } from './use-response-filters';

const EMPTY_SELECTION: RowSelectionState = {};

function TableSkeleton() {
  return (
    <div role="status" aria-label="Loading responses" className="overflow-hidden rounded-xl border">
      <div className="h-10 border-b bg-surface" />
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className="flex h-11 items-center gap-6 border-b px-3 last:border-b-0">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-40" />
          <Skeleton className="hidden h-4 w-28 sm:block" />
          <Skeleton className="hidden h-4 w-32 md:block" />
        </div>
      ))}
    </div>
  );
}

interface ResponsesTabProps {
  form: FormDetail;
  canEdit: boolean;
  onShare: () => void;
}

export function ResponsesTab({ form, canEdit, onShare }: ResponsesTabProps) {
  const fields = useMemo(
    () => (form.publishedSchema ? answerableFields(form.publishedSchema) : []),
    [form.publishedSchema],
  );
  const filtersState = useResponseFilters();
  const { filters, searchInput, setSearchInput, openResponseId, openResponse } = filtersState;
  const list = useResponsesList(form.id, filters);
  const remove = useDeleteResponses(form);

  // Selection belongs to one view of the table: a new search or order starts afresh.
  const [selection, setSelection] = useState<{ key: string; state: RowSelectionState }>({
    key: '',
    state: EMPTY_SELECTION,
  });
  const viewKey = JSON.stringify(filters);
  const rowSelection = selection.key === viewKey ? selection.state : EMPTY_SELECTION;
  const [pendingDelete, setPendingDelete] = useState<{ ids: string[]; open: boolean }>({
    ids: [],
    open: false,
  });

  const rows = useMemo(
    () => list.data?.pages.flatMap((page) => page.submissions) ?? [],
    [list.data],
  );
  const total = list.data?.pages[0]?.total ?? 0;
  const loadedIds = new Set(rows.map((row) => row.id));
  const selectedIds = Object.keys(rowSelection).filter(
    (id) => rowSelection[id] && loadedIds.has(id),
  );
  const answeredField = filters.answered
    ? fields.find((field) => field.id === filters.answered)
    : undefined;
  const filtered = Boolean(filters.search || filters.answered);

  const askToDelete = (ids: string[]) => {
    setPendingDelete({ ids, open: true });
  };
  const confirmDelete = () => {
    const { ids } = pendingDelete;
    setPendingDelete((current) => ({ ...current, open: false }));
    if (openResponseId && ids.includes(openResponseId)) openResponse(null);
    setSelection({ key: viewKey, state: EMPTY_SELECTION });
    remove.mutate(ids);
  };

  let content: React.ReactNode;
  if (list.isPending) {
    content = <TableSkeleton />;
  } else if (list.isError) {
    content = (
      <ErrorState
        title="Could not load responses"
        description="Check your connection and try again."
        action={
          <Button disabled={list.isFetching} onClick={() => void list.refetch()}>
            <RotateCw aria-hidden />
            Try again
          </Button>
        }
      />
    );
  } else if (rows.length === 0 && filtered) {
    content = (
      <EmptyState
        icon={SearchX}
        title="No responses match"
        description={
          filters.search
            ? `Nothing in the answers matches “${filters.search}”.`
            : 'Nobody has answered this question yet.'
        }
        action={
          <Button variant="secondary" onClick={filtersState.clearAll}>
            Show all responses
          </Button>
        }
      />
    );
  } else if (rows.length === 0) {
    content = (
      <EmptyState
        icon={Inbox}
        title="No responses yet"
        description="Responses show up here the moment people submit the form."
        action={
          <Button onClick={onShare}>
            <Share2 aria-hidden />
            Share the form
          </Button>
        }
      />
    );
  } else {
    content = (
      <div className="flex flex-col gap-4">
        <ResponsesTable
          fields={fields}
          rows={rows}
          order={filters.order}
          onOrderChange={filtersState.setOrder}
          onOpen={openResponse}
          {...(canEdit && {
            selection: {
              state: rowSelection,
              onChange: (state: RowSelectionState) => {
                setSelection({ key: viewKey, state });
              },
            },
          })}
        />
        <div className="flex flex-col items-center gap-3 text-13 text-muted-foreground sm:flex-row sm:justify-between">
          <p className="tabular-nums">
            Showing {formatCount(rows.length)} of {formatCount(total)}
          </p>
          {list.hasNextPage && (
            <Button
              variant="secondary"
              size="sm"
              aria-disabled={list.isFetchingNextPage || undefined}
              onClick={() => {
                if (!list.isFetchingNextPage) void list.fetchNextPage();
              }}
            >
              {list.isFetchingNextPage ? 'Loading…' : 'Load more'}
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative sm:w-80">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            aria-label="Search responses"
            placeholder="Search answers"
            enterKeyHint="search"
            value={searchInput}
            onChange={(event) => {
              setSearchInput(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape' && searchInput) {
                event.preventDefault();
                setSearchInput('');
              }
            }}
            className="px-9 [&::-webkit-search-cancel-button]:hidden"
          />
          {searchInput && (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Clear search"
              className="absolute top-0.5 right-0.5 text-muted-foreground"
              onClick={() => {
                setSearchInput('');
              }}
            >
              <X aria-hidden />
            </Button>
          )}
        </div>
        <Button asChild variant="secondary" size="sm" className="w-fit">
          <a href={exportResponsesUrl(form.id)} download>
            <Download aria-hidden />
            Export CSV
          </a>
        </Button>
      </div>

      {filters.answered && (
        <p className="flex w-fit max-w-full items-center gap-1 rounded-lg border bg-surface py-1 pr-1 pl-3 text-13">
          <span className="min-w-0 truncate">
            Answered “{answeredField?.label.trim() || 'Untitled question'}”
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            className="size-6 shrink-0"
            aria-label="Show all responses, not only those that answered this question"
            onClick={filtersState.clearAnswered}
          >
            <X aria-hidden />
          </Button>
        </p>
      )}

      <AnimatePresence initial={false}>
        {selectedIds.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: DURATION.fast, ease: EASE_STANDARD }}
            role="region"
            aria-label="Selected responses"
            className="flex items-center justify-between gap-3 rounded-lg border bg-surface px-3 py-2"
          >
            <p className="text-13 font-medium tabular-nums">
              {formatCount(selectedIds.length)} selected
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSelection({ key: viewKey, state: EMPTY_SELECTION });
                }}
              >
                Clear
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  askToDelete(selectedIds);
                }}
              >
                <Trash2 aria-hidden />
                Delete
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {content}

      <ResponseSheet
        formId={form.id}
        fields={fields}
        responseId={openResponseId}
        onClose={() => {
          openResponse(null);
        }}
        {...(canEdit && {
          onDelete: (id: string) => {
            askToDelete([id]);
          },
        })}
      />
      <DeleteResponsesDialog
        count={pendingDelete.ids.length}
        open={pendingDelete.open}
        onOpenChange={(open) => {
          setPendingDelete((current) => ({ ...current, open }));
        }}
        onDelete={confirmDelete}
      />
    </div>
  );
}
