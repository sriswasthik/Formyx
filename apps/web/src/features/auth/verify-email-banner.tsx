import { useMutation } from '@tanstack/react-query';
import { MailCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { changeErrorMessage } from '@/lib/api';
import { resendVerificationEmail } from './auth-api';
import { useSession } from './session-context';

/**
 * Above every app page while publishing waits for the account's email to be confirmed
 * (only when the server asks for that: REQUIRE_EMAIL_VERIFICATION).
 */
export function VerifyEmailBanner() {
  const { user } = useSession();
  const resend = useMutation({
    mutationFn: resendVerificationEmail,
    onSuccess: () => {
      toast.success('Link sent', { description: `Check ${user.email}.` });
    },
    onError: (error) => {
      toast.error('Could not send the link', { description: changeErrorMessage(error) });
    },
  });
  if (!user.mustVerifyEmail) return null;

  return (
    <div
      role="region"
      aria-label="Confirm your email"
      className="flex flex-col gap-2 border-b bg-accent-subtle px-4 py-2.5 text-13 sm:flex-row sm:items-center sm:gap-4 md:px-8 lg:px-10"
    >
      <p className="flex min-w-0 flex-1 gap-2">
        <MailCheck className="mt-0.5 shrink-0 text-accent" aria-hidden />
        <span>
          Confirm your email to publish forms. We sent a link to{' '}
          <span className="font-medium">{user.email}</span>.
        </span>
      </p>
      <Button
        size="sm"
        variant="secondary"
        className="self-start sm:self-auto"
        disabled={resend.isPending}
        onClick={() => {
          resend.mutate();
        }}
      >
        {resend.isPending ? 'Sending…' : 'Send a new link'}
      </Button>
    </div>
  );
}
