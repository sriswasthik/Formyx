import { ArrowDown, ArrowUp, Copy, Settings2, Trash2 } from 'lucide-react';
import type * as React from 'react';
import { ActionTooltip } from '@/components/action-tooltip';
import { Button } from '@/components/ui/button';
import type { Shortcut } from '@/lib/shortcuts';
import { useEditorStore } from '../editor-store-context';
import { EDITOR_SHORTCUTS } from '../editor-shortcuts';
import { focusQuestion, neighbourAfterRemoving } from './focus-question';

interface FieldToolbarProps {
  id: string;
  index: number;
  total: number;
  /** On small screens, where settings live in their own tab. */
  onOpenSettings?: () => void;
}

function ToolbarButton({
  label,
  shortcut,
  disabled,
  onClick,
  children,
}: {
  label: string;
  shortcut?: Shortcut;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <ActionTooltip label={label} shortcut={shortcut}>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={label}
        disabled={disabled}
        className="size-7 text-muted-foreground hover:not-disabled:text-foreground"
        onClick={onClick}
      >
        {children}
      </Button>
    </ActionTooltip>
  );
}

/** Actions for the selected question, floating on its top edge. */
export function FieldToolbar({ id, index, total, onOpenSettings }: FieldToolbarProps) {
  const moveField = useEditorStore((state) => state.moveField);
  const duplicateField = useEditorStore((state) => state.duplicateField);
  const removeField = useEditorStore((state) => state.removeField);
  const fields = useEditorStore((state) => state.schema.fields);

  return (
    <div
      role="toolbar"
      aria-label="Question actions"
      className="absolute -top-4 right-3 z-10 flex items-center gap-0.5 rounded-lg border bg-popover p-0.5 text-popover-foreground shadow-popover"
    >
      <ToolbarButton
        label="Move up"
        disabled={index === 0}
        onClick={() => {
          moveField(id, index - 1);
        }}
      >
        <ArrowUp aria-hidden />
      </ToolbarButton>
      <ToolbarButton
        label="Move down"
        disabled={index === total - 1}
        onClick={() => {
          moveField(id, index + 1);
        }}
      >
        <ArrowDown aria-hidden />
      </ToolbarButton>
      <ToolbarButton
        label="Duplicate"
        shortcut={EDITOR_SHORTCUTS.duplicate}
        onClick={() => {
          focusQuestion(duplicateField(id));
        }}
      >
        <Copy aria-hidden />
      </ToolbarButton>
      <ToolbarButton
        label="Delete"
        shortcut={EDITOR_SHORTCUTS.remove}
        onClick={() => {
          const next = neighbourAfterRemoving(
            fields.map((field) => field.id),
            index,
          );
          removeField(id);
          focusQuestion(next);
        }}
      >
        <Trash2 aria-hidden />
      </ToolbarButton>
      {onOpenSettings && (
        <ToolbarButton label="Question settings" onClick={onOpenSettings}>
          <Settings2 aria-hidden />
        </ToolbarButton>
      )}
    </div>
  );
}
