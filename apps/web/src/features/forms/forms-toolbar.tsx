import {
  FORM_STATUS_LABELS,
  FORM_STATUSES,
  formStatusSchema,
  type FormStatus,
} from '@formyx/shared';
import { LayoutGrid, List, Plus, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import type { FormsView } from './view-store';

const ALL_STATUSES = 'all';

interface FormsToolbarProps {
  search: string;
  onSearchChange: (search: string) => void;
  status: FormStatus | undefined;
  onStatusChange: (status: FormStatus | undefined) => void;
  view: FormsView;
  onViewChange: (view: FormsView) => void;
  /** Hidden for viewers, who cannot create forms. */
  onNewForm?: () => void;
}

export function FormsToolbar({
  search,
  onSearchChange,
  status,
  onStatusChange,
  view,
  onViewChange,
  onNewForm,
}: FormsToolbarProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="relative sm:w-72">
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

      <div className="flex items-center gap-2 sm:contents">
        <Select
          value={status ?? ALL_STATUSES}
          onValueChange={(value) => {
            const parsed = formStatusSchema.safeParse(value);
            onStatusChange(parsed.success ? parsed.data : undefined);
          }}
        >
          <SelectTrigger aria-label="Filter by status" className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_STATUSES}>All statuses</SelectItem>
            {FORM_STATUSES.map((value) => (
              <SelectItem key={value} value={value}>
                {FORM_STATUS_LABELS[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

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

        {onNewForm && (
          <Button className="ml-auto" onClick={onNewForm}>
            <Plus aria-hidden />
            New form
          </Button>
        )}
      </div>
    </div>
  );
}
