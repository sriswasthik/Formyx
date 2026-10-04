import type { FormTheme } from '@formyx/shared';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Plus } from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';
import { useMemo } from 'react';
import { FormLogo } from '@/features/form-renderer/branding';
import { submitButton } from '@/features/form-renderer/styles';
import { ThemeRenderer } from '@/features/form-renderer/theme/theme-renderer';
import { DURATION, EASE_STANDARD } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { useDropIndex } from '../dnd/drop-index-context';
import { CANVAS_DROP_ID, type DragData } from '../dnd/insertion';
import { useEditorStore } from '../editor-store-context';
import { CanvasField } from './canvas-field';
import { DropIndicator } from './drop-indicator';

interface EditorCanvasProps {
  theme: FormTheme;
  /** What the empty form suggests; it differs between desktop and touch. */
  emptyHint: string;
  onOpenSettings?: () => void;
}

/** The form being built, drawn exactly as respondents will see it. */
export function EditorCanvas({ theme, emptyHint, onOpenSettings }: EditorCanvasProps) {
  const fields = useEditorStore((state) => state.schema.fields);
  const title = useEditorStore((state) => state.title);
  const description = useEditorStore((state) => state.schema.description);
  const submitText = useEditorStore((state) => state.schema.settings.submitButtonText);
  const selectField = useEditorStore((state) => state.selectField);
  const dropIndex = useDropIndex();
  const ids = useMemo(() => fields.map((field) => field.id), [fields]);

  const data: DragData = { kind: 'canvas' };
  const { setNodeRef } = useDroppable({ id: CANVAS_DROP_ID, data });

  return (
    <div
      data-editor-canvas
      tabIndex={-1}
      className="min-h-full px-4 py-6 outline-none sm:px-8 sm:py-10"
      // Clicking anywhere but a question shows the form's settings.
      onPointerDown={(event) => {
        if (!(event.target as Element).closest('[data-canvas-field]')) selectField(null);
      }}
    >
      {/* The builder's frame around the page respondents get. */}
      <div className="mx-auto w-full max-w-4xl overflow-hidden rounded-xl border">
        <ThemeRenderer theme={theme} variant="frame" className="min-h-96">
          <div ref={setNodeRef}>
            <header className="flex flex-col gap-3 [text-align:var(--form-text-align)]">
              <FormLogo theme={theme} placement="header" className="mb-3" />
              <h2 className="form-title break-words @xl:form-title-lg">
                {title || 'Untitled form'}
              </h2>
              {description && (
                <p className="form-text break-words whitespace-pre-wrap text-(--form-muted)">
                  {description}
                </p>
              )}
            </header>

            <SortableContext items={ids} strategy={verticalListSortingStrategy}>
              <div role="list" aria-label="Questions" className="relative mt-8 flex flex-col gap-3">
                <AnimatePresence initial={false} mode="popLayout">
                  {ids.map((id, index) => (
                    <m.div
                      key={id}
                      role="listitem"
                      initial={{ opacity: 0, scale: 0.98 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.98, transition: { duration: DURATION.fast } }}
                      transition={{ duration: DURATION.base, ease: EASE_STANDARD }}
                    >
                      <CanvasField
                        id={id}
                        index={index}
                        total={ids.length}
                        showDropIndicator={dropIndex === index}
                        onOpenSettings={onOpenSettings}
                      />
                    </m.div>
                  ))}
                </AnimatePresence>
                {ids.length > 0 && dropIndex === ids.length && (
                  <div className="relative h-0">
                    <DropIndicator className="-top-[7px] -mx-3 sm:-mx-4" />
                  </div>
                )}
              </div>
            </SortableContext>

            {ids.length === 0 && (
              <div
                className={cn(
                  'mt-8 flex flex-col items-center gap-2 rounded-(--form-radius) border border-dashed border-(--form-border-strong) px-6 py-12 text-center',
                  'transition-colors duration-150 ease-standard',
                  dropIndex !== null && 'border-accent bg-accent-subtle',
                )}
              >
                <Plus aria-hidden className="text-(--form-muted)" />
                <p className="form-text font-medium">This form has no questions yet</p>
                <p className="form-text-sm text-(--form-muted)">{emptyHint}</p>
              </div>
            )}

            <div className="mt-10">
              <span className={submitButton}>{submitText}</span>
            </div>
          </div>
        </ThemeRenderer>
      </div>
    </div>
  );
}
