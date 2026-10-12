import { analyzeLogic } from '@formyx/shared';
import { Network, TriangleAlert } from 'lucide-react';
import { lazy, Suspense, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useEditorStore } from '../editor-store-context';
import { EndScreensSection } from './end-screens-section';
import { PagesSection } from './pages-section';
import { QuizSection } from './quiz-section';
import { ValuesSection } from './values-section';
import { warningSubject } from './warning-subject';

// React Flow is large; it loads only when the map is opened.
const LogicMap = lazy(() => import('./logic-map'));

/** The logic map in a large dialog. */
function LogicMapDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const schema = useEditorStore((state) => state.schema);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92dvh] w-[calc(100vw-2rem)] max-w-5xl flex-col">
        <DialogHeader>
          <DialogTitle>Logic map</DialogTitle>
          <DialogDescription>
            Where each page leads, and the end screens. Dashed arrows are taken only when their
            conditions hold.
          </DialogDescription>
        </DialogHeader>
        {open && (
          <Suspense fallback={<Skeleton className="h-[60dvh] w-full" />}>
            <LogicMap schema={schema} />
          </Suspense>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * The Logic tab: pages and where they lead, calculated values, the quiz and end screens,
 * with the logic map and warnings about routes that do not work.
 */
export function LogicPanel() {
  const fields = useEditorStore((state) => state.schema.fields);
  const logic = useEditorStore((state) => state.schema.logic);
  const [mapOpen, setMapOpen] = useState(false);
  const graph = useMemo(() => analyzeLogic({ fields, logic }), [fields, logic]);

  return (
    <div>
      <header className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-14 font-medium">Logic</h2>
          <p className="text-12 text-muted-foreground">Routes, values, quizzes and endings.</p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            setMapOpen(true);
          }}
        >
          <Network aria-hidden />
          Logic map
        </Button>
      </header>
      {graph.warnings.length > 0 && (
        <div role="status" className="flex flex-col gap-1.5 border-b bg-surface px-4 py-3">
          {graph.warnings.map((warning, index) => (
            <p key={index} className="flex gap-2 text-13">
              <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-warning-text" />
              <span>
                <span className="font-medium">{warningSubject(graph, warning)}:</span>{' '}
                {warning.message}
              </span>
            </p>
          ))}
        </div>
      )}
      <PagesSection />
      <ValuesSection />
      <QuizSection />
      <EndScreensSection />
      <LogicMapDialog open={mapOpen} onOpenChange={setMapOpen} />
    </div>
  );
}
