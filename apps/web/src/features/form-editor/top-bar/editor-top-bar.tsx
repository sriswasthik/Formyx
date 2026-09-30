import { ArrowLeft, Eye, PencilRuler, Redo2, Send, Undo2 } from 'lucide-react';
import type * as React from 'react';
import { Link } from 'react-router';
import { ActionTooltip } from '@/components/action-tooltip';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useEditorStore } from '../editor-store-context';
import { EDITOR_SHORTCUTS } from '../editor-shortcuts';
import { TitleInput } from './title-input';

export type EditorView = 'build' | 'preview';

interface EditorTopBarProps {
  /** Save status, shown next to the title. */
  status: React.ReactNode;
  /** Only on large screens; smaller ones switch views with tabs. */
  view?: EditorView;
  onViewChange?: (view: EditorView) => void;
}

function UndoRedo() {
  const canUndo = useEditorStore((state) => state.past.length > 0);
  const canRedo = useEditorStore((state) => state.future.length > 0);
  const undo = useEditorStore((state) => state.undo);
  const redo = useEditorStore((state) => state.redo);

  return (
    <div className="flex items-center">
      <ActionTooltip label="Undo" shortcut={EDITOR_SHORTCUTS.undo}>
        <Button variant="ghost" size="icon-sm" aria-label="Undo" disabled={!canUndo} onClick={undo}>
          <Undo2 aria-hidden />
        </Button>
      </ActionTooltip>
      <ActionTooltip label="Redo" shortcut={EDITOR_SHORTCUTS.redo}>
        <Button variant="ghost" size="icon-sm" aria-label="Redo" disabled={!canRedo} onClick={redo}>
          <Redo2 aria-hidden />
        </Button>
      </ActionTooltip>
    </div>
  );
}

function PublishButton() {
  return (
    <ActionTooltip label="Publishing arrives in the next sprint">
      <Button
        size="sm"
        aria-disabled="true"
        // Focusable and hoverable, so the tooltip explains why it does nothing yet.
        className="aria-disabled:pointer-events-auto aria-disabled:cursor-not-allowed"
        onClick={(event) => {
          event.preventDefault();
        }}
      >
        <Send aria-hidden />
        <span className="sr-only sm:not-sr-only">Publish</span>
      </Button>
    </ActionTooltip>
  );
}

export function EditorTopBar({ status, view, onViewChange }: EditorTopBarProps) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b bg-background px-2 sm:px-3">
      <ActionTooltip label="All forms">
        <Button asChild variant="ghost" size="icon-sm">
          <Link to="/app/forms" aria-label="Back to all forms">
            <ArrowLeft aria-hidden />
          </Link>
        </Button>
      </ActionTooltip>
      <Separator orientation="vertical" className="h-5" />

      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="min-w-0 flex-1 sm:max-w-sm">
          <TitleInput />
        </div>
        <div className="hidden shrink-0 sm:block">{status}</div>
      </div>

      <div className="flex shrink-0 items-center gap-1 sm:gap-2">
        <UndoRedo />
        {view && onViewChange && (
          <ToggleGroup
            type="single"
            aria-label="Editor view"
            value={view}
            onValueChange={(value) => {
              if (value === 'build' || value === 'preview') onViewChange(value);
            }}
          >
            <ToggleGroupItem value="build">
              <PencilRuler aria-hidden />
              Build
            </ToggleGroupItem>
            <ToggleGroupItem value="preview">
              <Eye aria-hidden />
              Preview
            </ToggleGroupItem>
          </ToggleGroup>
        )}
        <PublishButton />
      </div>
    </header>
  );
}
