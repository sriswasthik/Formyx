import { Bold, Italic, Link, List, type LucideIcon } from 'lucide-react';
import { useLayoutEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { applyFormat, type RichTextFormat } from './rich-text-edits';

const FORMATS: readonly {
  format: RichTextFormat;
  label: string;
  /** With Ctrl or Cmd. */
  shortcut: string | null;
  icon: LucideIcon;
}[] = [
  { format: 'bold', label: 'Bold', shortcut: 'b', icon: Bold },
  { format: 'italic', label: 'Italic', shortcut: 'i', icon: Italic },
  { format: 'link', label: 'Link', shortcut: 'k', icon: Link },
  { format: 'list', label: 'Bulleted list', shortcut: null, icon: List },
];

interface RichTextEditorProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  error?: string | undefined;
  placeholder?: string | undefined;
  rows?: number;
}

/**
 * A text box for the rich-text subset respondents see formatted: **bold**, *italic*,
 * [links](https://…) and "- " lists. The toolbar and Ctrl/Cmd+B, I and K add the marks.
 */
export function RichTextEditor({
  id,
  label,
  value,
  onChange,
  hint = 'Supports **bold**, *italic*, [links](https://…) and lists starting with "- ".',
  error,
  placeholder,
  rows = 4,
}: RichTextEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pendingSelection = useRef<[number, number] | null>(null);
  const messageId = `${id}-message`;

  // After a format, select what it wrapped, so typing replaces the placeholder text.
  useLayoutEffect(() => {
    const selection = pendingSelection.current;
    const textarea = textareaRef.current;
    if (!selection || !textarea) return;
    pendingSelection.current = null;
    textarea.focus();
    textarea.setSelectionRange(selection[0], selection[1]);
  });

  const format = (kind: RichTextFormat) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const next = applyFormat(kind, value, textarea.selectionStart, textarea.selectionEnd);
    pendingSelection.current = [next.selectionStart, next.selectionEnd];
    onChange(next.text);
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-end justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        <div role="toolbar" aria-label={`Format ${label.toLowerCase()}`} className="flex gap-0.5">
          {FORMATS.map((item) => (
            <Tooltip key={item.format}>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  aria-label={item.label}
                  onMouseDown={(event) => {
                    // Keeps the selection in the text box.
                    event.preventDefault();
                  }}
                  onClick={() => {
                    format(item.format);
                  }}
                >
                  <item.icon aria-hidden />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {item.label}
                {item.shortcut && ` (Ctrl+${item.shortcut.toUpperCase()})`}
              </TooltipContent>
            </Tooltip>
          ))}
        </div>
      </div>
      <Textarea
        ref={textareaRef}
        id={id}
        rows={rows}
        value={value}
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
        aria-describedby={messageId}
        onChange={(event) => {
          onChange(event.target.value);
        }}
        onKeyDown={(event) => {
          if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return;
          const item = FORMATS.find((candidate) => candidate.shortcut === event.key.toLowerCase());
          if (!item) return;
          event.preventDefault();
          format(item.format);
        }}
      />
      <p
        id={messageId}
        className={error ? 'text-13 text-danger-text' : 'text-13 text-muted-foreground'}
      >
        {error ?? hint}
      </p>
    </div>
  );
}
