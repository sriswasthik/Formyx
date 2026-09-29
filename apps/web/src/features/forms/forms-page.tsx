import { FileText, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { EmptyState } from '@/components/empty-state';
import { Button } from '@/components/ui/button';

export function FormsPage() {
  return (
    <EmptyState
      icon={FileText}
      title="No forms yet"
      description="Create your first form to start collecting responses."
      action={
        <Button
          onClick={() => {
            toast.info('The form builder is on its way', {
              description: 'Drag-and-drop editing is the next thing we are shipping.',
            });
          }}
        >
          <Plus aria-hidden />
          Create form
        </Button>
      }
    />
  );
}
