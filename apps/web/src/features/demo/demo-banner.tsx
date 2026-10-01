import { useMutation } from '@tanstack/react-query';
import { Info } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { logOut } from '@/features/auth/auth-api';
import { setSessionHint } from '@/features/auth/session-cache';
import { useWorkspaceStore } from '@/features/workspaces/workspace-store';

/**
 * Tells visitors of the shared demo account what to expect, with a way to their own account.
 * Signing up means leaving the demo first, so it logs out and loads the sign-up page afresh.
 */
export function DemoBanner() {
  const leave = useMutation({
    mutationFn: logOut,
    onSuccess: () => {
      useWorkspaceStore.getState().setActiveWorkspaceId(null);
      setSessionHint(false);
      window.location.assign('/signup');
    },
    onError: () => {
      toast.error('Could not leave the demo', {
        description: 'Check your connection and try again.',
      });
    },
  });

  return (
    <div
      role="region"
      aria-label="Demo"
      className="flex flex-col gap-2 border-b bg-accent-subtle px-4 py-2.5 text-13 sm:flex-row sm:items-center sm:gap-4 md:px-8 lg:px-10"
    >
      <p className="flex min-w-0 flex-1 gap-2">
        <Info className="mt-0.5 shrink-0 text-accent" aria-hidden />
        <span>
          <span className="font-medium">You’re exploring a shared demo.</span>{' '}
          <span className="text-subtle-foreground">
            It resets every night, and emails, invites, webhooks and uploads are switched off.
          </span>
        </span>
      </p>
      <Button
        size="sm"
        variant="secondary"
        className="self-start sm:self-auto"
        disabled={leave.isPending}
        onClick={() => {
          leave.mutate();
        }}
      >
        Create your account
      </Button>
    </div>
  );
}
