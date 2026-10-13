import { unsubscribeResponseSchema, type UnsubscribeResponse } from '@formyx/shared';
import { useMutation } from '@tanstack/react-query';
import { LoaderCircle } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { FormAlert } from '@/components/form-alert';
import { Button } from '@/components/ui/button';
import { AuthLayout } from '@/features/auth/auth-layout';
import { apiRequest, jsonRequest } from '@/lib/api';

function setProductEmails(token: string, on: boolean): Promise<UnsubscribeResponse> {
  return apiRequest(
    on ? '/public/resubscribe' : '/public/unsubscribe',
    unsubscribeResponseSchema,
    jsonRequest('POST', { token }),
  );
}

const linkClass = 'font-medium text-accent underline-offset-4 hover:underline';

/**
 * /unsubscribe/:token, from a lifecycle email: turns tips and reminders off with one press,
 * without signing in. A press, not the visit: mail scanners open links, and must not
 * unsubscribe anyone.
 */
export function UnsubscribePage() {
  const { token = '' } = useParams();
  const change = useMutation({ mutationFn: (on: boolean) => setProductEmails(token, on) });
  const subscribed = change.data?.productEmails;

  if (subscribed === false) {
    return (
      <AuthLayout
        title="You’re unsubscribed"
        description="No more tips and reminders from Formyx. Emails you need, such as sign-in codes, invites and receipts, still come."
        footer={
          <Link to="/app/settings" className={linkClass}>
            Email preferences
          </Link>
        }
      >
        <Button
          variant="secondary"
          className="w-full"
          disabled={change.isPending}
          onClick={() => {
            change.mutate(true);
          }}
        >
          {change.isPending && <LoaderCircle className="motion-safe:animate-spin" aria-hidden />}
          Undo
        </Button>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title={subscribed ? 'You’re subscribed again' : 'Stop tips and reminders?'}
      description={
        subscribed
          ? 'You’ll get tips and reminders from Formyx again.'
          : 'A welcome, notes about your first form and response, trial reminders, and a nudge after two weeks away. Emails you need still come.'
      }
      footer={
        <Link to="/" className={linkClass}>
          Go to Formyx
        </Link>
      }
    >
      <div className="flex flex-col gap-4">
        {change.isError && (
          <FormAlert>
            This link isn’t working. You can change emails in Preferences once you log in.
          </FormAlert>
        )}
        {!subscribed && (
          <Button
            className="w-full"
            disabled={change.isPending}
            onClick={() => {
              change.mutate(false);
            }}
          >
            {change.isPending && <LoaderCircle className="motion-safe:animate-spin" aria-hidden />}
            Unsubscribe
          </Button>
        )}
      </div>
    </AuthLayout>
  );
}
