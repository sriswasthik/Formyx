import type { InvitePreview, MeResponse } from '@formyx/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { FormAlert } from '@/components/form-alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { AuthLayout, AuthLink } from '@/features/auth/auth-layout';
import type { AuthRedirectState } from '@/features/auth/redirect';
import { useLogOut, useMe } from '@/features/auth/use-session';
import { ROLE_DESCRIPTIONS, roleWithArticle } from '@/features/workspaces/workspace-format';
import { changeErrorMessage, useAcceptInvite } from '@/features/workspaces/use-workspace-admin';
import { getInvitePreview } from '@/features/workspaces/workspaces-api';
import { ApiRequestError } from '@/lib/api';

const homeLink = <AuthLink to="/">Go to Formyx</AuthLink>;

function Loading() {
  return (
    <AuthLayout title="Opening your invite…" description="One moment." footer={null}>
      <div aria-hidden className="flex flex-col gap-3">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-9 w-full" />
      </div>
    </AuthLayout>
  );
}

/** Why a link that was found no longer works. */
function Unavailable({ preview }: { preview: InvitePreview }) {
  const asker = preview.invitedBy ?? 'a workspace owner';
  const copy = {
    expired: {
      title: 'This invite has expired',
      description: `Invite links work for 7 days. Ask ${asker} to send a new one.`,
    },
    revoked: {
      title: 'This invite was withdrawn',
      description: `Ask ${asker} for a new invite if you still need access to ${preview.workspaceName}.`,
    },
    accepted: {
      title: 'This invite has been used',
      description: `If it was you, ${preview.workspaceName} is in your workspaces.`,
    },
  } as const;
  if (preview.status === 'pending') return null;
  const { title, description } = copy[preview.status];

  return (
    <AuthLayout title={title} description={description} footer={homeLink}>
      <Button asChild className="w-full">
        <Link to="/app">Open Formyx</Link>
      </Button>
    </AuthLayout>
  );
}

function SignedOut({ preview, token }: { preview: InvitePreview; token: string }) {
  const state: AuthRedirectState = { from: `/invite/${token}`, email: preview.email };
  return (
    <div className="flex flex-col gap-4">
      <p className="text-14">
        The invite is for <span className="font-medium break-all">{preview.email}</span>. Sign up or
        log in with that email to accept it.
      </p>
      <div className="flex flex-col gap-2">
        <Button asChild>
          <Link to="/signup" state={state}>
            Sign up to accept
          </Link>
        </Button>
        <Button asChild variant="secondary">
          <Link to="/login" state={state}>
            I already have an account
          </Link>
        </Button>
      </div>
    </div>
  );
}

function OtherAccount({
  preview,
  me,
  token,
}: {
  preview: InvitePreview;
  me: MeResponse;
  token: string;
}) {
  const navigate = useNavigate();
  const logOut = useLogOut();
  return (
    <div className="flex flex-col gap-4">
      <p className="text-14">
        The invite is for <span className="font-medium break-all">{preview.email}</span>, but you’re
        logged in as <span className="font-medium break-all">{me.user.email}</span>.
      </p>
      <Button
        disabled={logOut.isPending}
        onClick={() => {
          logOut.mutate(undefined, {
            onSuccess: () => {
              const state: AuthRedirectState = { from: `/invite/${token}`, email: preview.email };
              void navigate('/login', { state });
            },
            onError: () => {
              toast.error('Could not log out', {
                description: 'Check your connection and try again.',
              });
            },
          });
        }}
      >
        Log out and switch account
      </Button>
    </div>
  );
}

function Accept({
  preview,
  token,
  onUnavailable,
}: {
  preview: InvitePreview;
  token: string;
  onUnavailable: () => void;
}) {
  const navigate = useNavigate();
  const accept = useAcceptInvite();
  const [problem, setProblem] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-4">
      {problem && <FormAlert>{problem}</FormAlert>}
      <Button
        disabled={accept.isPending}
        onClick={() => {
          setProblem(null);
          accept.mutate(token, {
            onSuccess: (workspace) => {
              toast.success(`You joined ${workspace.name}`);
              void navigate('/app/forms', { replace: true });
            },
            onError: (error) => {
              // Used, withdrawn or expired meanwhile: show the page for that instead.
              if (error instanceof ApiRequestError && error.code === 'INVITE_UNAVAILABLE') {
                onUnavailable();
                return;
              }
              setProblem(changeErrorMessage(error));
            },
          });
        }}
      >
        {accept.isPending ? 'Joining…' : `Join ${preview.workspaceName}`}
      </Button>
    </div>
  );
}

/** `/invite/:token`, the link in an invite email. Works signed in or out. */
export function InvitePage() {
  const { token = '' } = useParams();
  const me = useMe();
  const preview = useQuery({
    queryKey: ['invite', token],
    queryFn: () => getInvitePreview(token),
    retry: (failures, error) =>
      !(error instanceof ApiRequestError && error.status === 404) && failures < 1,
  });

  if (preview.isPending || me.isPending) return <Loading />;

  if (preview.isError) {
    const missing = preview.error instanceof ApiRequestError && preview.error.status === 404;
    return (
      <AuthLayout
        title={missing ? 'This invite link doesn’t work' : 'The invite could not be opened'}
        description={
          missing
            ? 'It may be mistyped, or a newer invite replaced it. Check the latest email, or ask for a new invite.'
            : 'Check your connection and try again.'
        }
        footer={homeLink}
      >
        {!missing && (
          <Button
            className="w-full"
            onClick={() => {
              void preview.refetch();
            }}
          >
            Try again
          </Button>
        )}
      </AuthLayout>
    );
  }

  const invite = preview.data;
  if (invite.status !== 'pending') return <Unavailable preview={invite} />;

  const inviter = invite.invitedBy ?? 'Someone';
  let body;
  if (!me.data) {
    body = <SignedOut preview={invite} token={token} />;
  } else if (me.data.user.email !== invite.email) {
    body = <OtherAccount preview={invite} me={me.data} token={token} />;
  } else {
    body = (
      <Accept
        preview={invite}
        token={token}
        onUnavailable={() => {
          void preview.refetch();
        }}
      />
    );
  }

  return (
    <AuthLayout
      title={`Join ${invite.workspaceName}`}
      description={`${inviter} invited you as ${roleWithArticle(invite.role)}: ${ROLE_DESCRIPTIONS[invite.role].toLowerCase()}.`}
      footer={homeLink}
    >
      {body}
    </AuthLayout>
  );
}
