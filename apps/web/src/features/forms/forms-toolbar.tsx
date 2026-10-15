import { formStatusSchema, type FormStatus } from '@formyx/shared';
import { ArrowUpDown, LayoutGrid, List, Search, X } from 'lucide-react';
import { PageToolbar } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { FORM_SORT_LABELS, FORM_SORTS, type FormSort, type StatusCounts } from './forms-view';
import type { FormsView } from './view-store';

const ALL = 'ALL';

/** The status tabs, in order, with what they say. */
const STATUS_TABS: { value: FormStatus | typeof ALL; label: string }[] = [
  { value: ALL, label: 'All' },
  { value: 'PUBLISHED', label: 'Published' },
  { value: 'DRAFT', label: 'Drafts' },
  { value: 'CLOSED', label: 'Closed' },
];

interface FormsToolbarProps {
  search: string;
  onSearchChange: (search: string) => void;
  status: FormStatus | undefined;
  onStatusChange: (status: FormStatus | undefined) => void;
  counts: StatusCounts;
  sort: FormSort;
  onSortChange: (sort: FormSort) => void;
  view: FormsView;
  onViewChange: (view: FormsView) => void;
}

/** Search, the status tabs with their counts, the order and grid or list. */
export function FormsToolbar({
  search,
  onSearchChange,
  status,
  onStatusChange,
  counts,
  sort,
  onSortChange,
  view,
  onViewChange,
}: FormsToolbarProps) {
  return (
    <PageToolbar className="gap-3">
      <div className="relative w-full sm:w-64">
        <Search
          className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          type="search"
          aria-label="Search forms"
          placeholder="Search forms"
          enterKeyHint="search"
          value={search}
          onChange={(event) => {
            onSearchChange(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && search) {
              event.preventDefault();
              onSearchChange('');
            }
          }}
          className="px-9 [&::-webkit-search-cancel-button]:hidden"
        />
        {search && (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Clear search"
            className="absolute top-0.5 right-0.5 text-muted-foreground"
            onClick={() => {
              onSearchChange('');
            }}
          >
            <X aria-hidden />
          </Button>
        )}
      </div>

      <div className="-mx-6 overflow-x-auto px-6 sm:mx-0 sm:px-0">
        <ToggleGroup
          type="single"
          aria-label="Status"
          value={status ?? ALL}
          onValueChange={(value) => {
            // Radix reports '' when the active tab is clicked again: it stays on.
            if (!value) return;
            const parsed = formStatusSchema.safeParse(value);
            onStatusChange(parsed.success ? parsed.data : undefined);
          }}
        >
          {STATUS_TABS.map(({ value, label }) => (
            <ToggleGroupItem key={value} value={value} className="group px-2.5">
              {label}{' '}
              {/* Muted text is too faint on the selected tab's fill: it matches the label there. */}
              <span className="text-muted-foreground tabular-nums group-data-[state=on]:text-foreground">
                {counts[value]}
              </span>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="secondary" aria-label={`Sort: ${FORM_SORT_LABELS[sort]}`}>
              <ArrowUpDown aria-hidden />
              <span className="hidden md:inline">{FORM_SORT_LABELS[sort]}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-44">
            <DropdownMenuLabel>Sort by</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={sort}
              onValueChange={(value) => {
                const next = FORM_SORTS.find((option) => option === value);
                if (next) onSortChange(next);
              }}
            >
              {FORM_SORTS.map((option) => (
                <DropdownMenuRadioItem key={option} value={option}>
                  {FORM_SORT_LABELS[option]}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        <ToggleGroup
          type="single"
          aria-label="Layout"
          value={view}
          onValueChange={(value) => {
            // Radix reports '' when the active item is clicked again; keep the current view.
            if (value === 'grid' || value === 'list') onViewChange(value);
          }}
        >
          <ToggleGroupItem value="grid" aria-label="Grid view">
            <LayoutGrid aria-hidden />
          </ToggleGroupItem>
          <ToggleGroupItem value="list" aria-label="List view">
            <List aria-hidden />
          </ToggleGroupItem>
        </ToggleGroup>
      </div>
    </PageToolbar>
  );
}
