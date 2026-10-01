import { useMutation, useQueryClient } from '@tanstack/react-query';
import { LoaderCircle, Play } from 'lucide-react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { replaceSession } from '@/features/auth/session-cache';
import { useWorkspaceStore } from '@/features/workspaces/workspace-store';
import { changeErrorMessage } from '@/lib/api';
import { startDemo } from './demo-api';

/** Signs in to the shared demo workspace and opens its forms. */
export function TryDemoButton() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const demo = useMutation({
    mutationFn: startDemo,
    onSuccess: (me) => {
      useWorkspaceStore.getState().setActiveWorkspaceId(me.workspaces[0]?.id ?? null);
      replaceSession(queryClient, me);
      void navigate('/app/forms');
    },
    onError: (error) => {
      toast.error('Could not open the demo', { description: changeErrorMessage(error) });
    },
  });

  return (
    <Button
      size="lg"
      variant="secondary"
      disabled={demo.isPending}
      aria-busy={demo.isPending || undefined}
      onClick={() => {
        demo.mutate();
      }}
    >
      {demo.isPending ? (
        <LoaderCircle className="motion-safe:animate-spin" aria-hidden />
      ) : (
        <Play aria-hidden />
      )}
      Try the demo
    </Button>
  );
}
