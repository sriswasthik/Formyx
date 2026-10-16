import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CalendarX } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { meQueryKey } from '@/features/auth/session-cache';
import { useSession } from '@/features/auth/session-context';
import { formatBillingDate } from '@/features/billing/billing-format';
import { changeErrorMessage } from '@/lib/api';
import { privacyKeys, restoreAccount } from './privacy-api';

/** Above every app page while the account waits to be deleted: keeping it is one click. */
export function DeletionBanner() {
  const { user } = useSession();
  const queryClient = useQueryClient();
  const keep = useMutation({
    mutationFn: restoreAccount,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: meQueryKey });
      void queryClient.invalidateQueries({ queryKey: privacyKeys.deletion });
      toast.success('Your account is staying');
    },
    onError: (error) => {
      toast.error('Could not keep your account', { description: changeErrorMessage(error) });
    },
  });
  if (!user.deletionScheduledFor) return null;

  return (
    <div
      role="region"
      aria-label="Account deletion"
      className="flex flex-col gap-2 border-b bg-warning/12 px-4 py-2.5 text-13 sm:flex-row sm:items-center sm:gap-4 md:px-8 lg:px-10"
    >
      <p className="flex min-w-0 flex-1 gap-2">
        <CalendarX className="mt-0.5 shrink-0 text-warning-text" aria-hidden />
        <span>
          Your account will be deleted on{' '}
          <span className="font-medium">{formatBillingDate(user.deletionScheduledFor)}</span>, with
          the workspaces you chose to delete.
        </span>
      </p>
      <Button
        size="sm"
        variant="secondary"
        className="self-start sm:self-auto"
        disabled={keep.isPending}
        onClick={() => {
          keep.mutate();
        }}
      >
        {keep.isPending ? 'Keeping it…' : 'Keep my account'}
      </Button>
    </div>
  );
}
