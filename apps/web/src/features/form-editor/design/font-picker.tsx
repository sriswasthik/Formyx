import {
  FONT_CATEGORIES,
  FONT_CATEGORY_LABELS,
  FONTS,
  fontStack,
  getFont,
  type FontId,
} from '@formyx/shared';
import { Check, ChevronDown, Search } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { fieldBase } from '@/components/ui/styles';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { ProBadge } from '@/features/entitlements/pro-badge';
import { loadFont } from '@/features/form-renderer/theme/fonts';
import { cn } from '@/lib/utils';
import { FONT_FILTERS, filterFonts, type FontFilter } from './font-search';

/** Loads a font once its row scrolls into view, so opening the list does not fetch forty. */
function useLoadWhenVisible(font: FontId) {
  const ref = useRef<HTMLLIElement>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (typeof IntersectionObserver === 'undefined') {
      void loadFont(font);
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        void loadFont(font);
        observer.disconnect();
      }
    });
    observer.observe(node);
    return () => {
      observer.disconnect();
    };
  }, [font]);
  return ref;
}

interface FontOptionProps {
  id: string;
  font: (typeof FONTS)[number];
  selected: boolean;
  active: boolean;
  onPick: () => void;
  onHover: () => void;
}

function FontOption({ id, font, selected, active, onPick, onHover }: FontOptionProps) {
  const ref = useLoadWhenVisible(font.id);
  useEffect(() => {
    if (active) ref.current?.scrollIntoView({ block: 'nearest' });
  }, [active, ref]);

  return (
    // Options are picked with the pointer here and from the keyboard in the search box,
    // which keeps focus (aria-activedescendant), as a combobox does.
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events
    <li
      ref={ref}
      id={id}
      role="option"
      aria-selected={selected}
      data-active={active || undefined}
      className={cn(
        'flex cursor-pointer items-center gap-3 rounded-md px-2 py-2',
        'transition-colors duration-150 ease-standard',
        'data-active:bg-hover',
      )}
      onClick={onPick}
      onPointerMove={onHover}
    >
      <span className="min-w-0 flex-1 truncate text-16" style={{ fontFamily: fontStack(font.id) }}>
        {font.name}
      </span>
      <span className="shrink-0 text-12 text-muted-foreground">
        {FONT_CATEGORY_LABELS[font.category]}
      </span>
      {font.tier === 'pro' && <ProBadge />}
      <Check aria-hidden className={cn('size-4 shrink-0 text-accent', !selected && 'invisible')} />
    </li>
  );
}

interface FontPickerProps {
  label: string;
  value: FontId;
  onChange: (font: FontId) => void;
}

/**
 * One of the registry's fonts, each shown in itself: a search box with a list below it
 * (a combobox: arrow keys move, Enter picks, Escape closes) and a filter by category.
 */
export function FontPicker({ label, value, onChange }: FontPickerProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<FontFilter>('all');
  const [activeIndex, setActiveIndex] = useState(0);
  const fonts = useMemo(() => filterFonts(query, category), [query, category]);
  const current = getFont(value);
  const listId = `${id}-list`;
  const optionId = (index: number) => `${id}-option-${index}`;
  const active = Math.min(activeIndex, fonts.length - 1);

  useEffect(() => {
    void loadFont(value);
  }, [value]);

  const pick = (font: FontId) => {
    onChange(font);
    setOpen(false);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActiveIndex(Math.min(Math.max(active + step, 0), fonts.length - 1));
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      setActiveIndex(event.key === 'Home' ? 0 : fonts.length - 1);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const font = fonts[active];
      if (font) pick(font.id);
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      <Label id={`${id}-label`} htmlFor={id}>
        {label}
      </Label>
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (next) {
            setQuery('');
            setCategory('all');
            setActiveIndex(
              Math.max(
                FONTS.findIndex((font) => font.id === value),
                0,
              ),
            );
          }
        }}
      >
        <PopoverTrigger asChild>
          <button
            id={id}
            type="button"
            aria-haspopup="dialog"
            className={cn(fieldBase, 'flex h-9 items-center gap-2 px-3 text-left')}
          >
            <span className="min-w-0 flex-1 truncate" style={{ fontFamily: fontStack(value) }}>
              {current.name}
            </span>
            {current.tier === 'pro' && <ProBadge />}
            <ChevronDown aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          aria-labelledby={`${id}-label`}
          className="flex w-(--radix-popover-trigger-width) min-w-72 flex-col gap-2 p-2"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            document.getElementById(`${id}-search`)?.focus();
          }}
        >
          <div className="relative">
            <Search
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <input
              id={`${id}-search`}
              role="combobox"
              aria-label={`Search ${label.toLowerCase()} fonts`}
              aria-expanded
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={fonts.length > 0 ? optionId(active) : undefined}
              value={query}
              autoComplete="off"
              spellCheck={false}
              placeholder="Search fonts"
              className={cn(fieldBase, 'h-9 pr-3 pl-8')}
              onChange={(event) => {
                setQuery(event.target.value);
                setActiveIndex(0);
              }}
              onKeyDown={onKeyDown}
            />
          </div>
          <ToggleGroup
            type="single"
            aria-label="Font category"
            value={category}
            onValueChange={(next) => {
              const found = FONT_FILTERS.find((candidate) => candidate === next);
              if (found) {
                setCategory(found);
                setActiveIndex(0);
              }
            }}
            className="h-auto flex-wrap justify-start border-0 p-0"
          >
            <ToggleGroupItem value="all" className="h-7">
              All
            </ToggleGroupItem>
            {FONT_CATEGORIES.map((key) => (
              <ToggleGroupItem key={key} value={key} className="h-7">
                {FONT_CATEGORY_LABELS[key]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <ul
            id={listId}
            role="listbox"
            aria-label={`${label} fonts`}
            className="max-h-72 overflow-y-auto"
          >
            {fonts.map((font, index) => (
              <FontOption
                key={font.id}
                id={optionId(index)}
                font={font}
                selected={font.id === value}
                active={index === active}
                onPick={() => {
                  pick(font.id);
                }}
                onHover={() => {
                  setActiveIndex(index);
                }}
              />
            ))}
          </ul>
          {fonts.length === 0 && (
            <p className="px-2 py-6 text-center text-13 text-muted-foreground">
              No fonts match “{query}”.
            </p>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}
