import {
  emailSchema,
  ROLE_LABELS,
  ROLES,
  roleSchema,
  type Invite,
  type WorkspaceSummary,
} from '@formyx/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { Mail, RotateCw, X } from 'lucide-react';
import { useRef, useState, type MutableRefObject } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { FormAlert } from '@/components/form-alert';
import { FormField } from '@/components/form-field';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { applyServerError } from '@/features/auth/server-errors';
import {
  changeErrorMessage,
  useInvites,
  useResendInvite,
  useRevokeInvite,
  useSendInvite,
} from '@/features/workspaces/use-workspace-admin';
import { useNow } from '@/lib/use-now';
import { inviteExpiry, ROLE_DESCRIPTIONS } from '@/features/workspaces/workspace-format';

const inviteFormSchema = z.object({ email: emailSchema, role: roleSchema });

/** Tells the owner whether the email went out; the invite exists either way. */
function reportSent(email: string, emailSent: boolean) {
  if (emailSent) {
    toast.success(`Invite sent to ${email}`);
  } else {
    toast.warning('The invite was saved, but the email didn’t send', {
      description: 'Use Resend to try again in a moment.',
    });
  }
}

function InviteForm({
  workspaceId,
  emailRef,
}: {
  workspaceId: string;
  /** Lets the empty list's "Invite someone" button bring focus here. */
  emailRef: MutableRefObject<HTMLInputElement | null>;
}) {
  const send = useSendInvite(workspaceId);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(inviteFormSchema),
    defaultValues: { email: '', role: 'EDITOR' as const },
  });
  const { ref: registerEmailRef, ...emailField } = register('email');

  return (
    <form
      noValidate
      onSubmit={(event) =>
        void handleSubmit((input) => {
          setFormError(null);
          send.mutate(input, {
            onSuccess: ({ invite, emailSent }) => {
              reset({ email: '', role: input.role });
              reportSent(invite.email, emailSent);
            },
            onError: (error) => {
              setFormError(applyServerError(error, ['email', 'role'], setError));
            },
          });
        })(event)
      }
      className="flex flex-col gap-3"
    >
      {formError && <FormAlert>{formError}</FormAlert>}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="flex-1">
          <FormField id="invite-email" label="Email" error={errors.email?.message}>
            <Input
              type="email"
              autoComplete="off"
              placeholder="name@company.com"
              ref={(element) => {
                registerEmailRef(element);
                emailRef.current = element;
              }}
              {...emailField}
            />
          </FormField>
        </div>
        <div className="flex flex-col gap-1.5 sm:w-36">
          <Label htmlFor="invite-role">Role</Label>
          <Controller
            control={control}
            name="role"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="invite-role" ref={field.ref} onBlur={field.onBlur}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="end" className="w-72">
                  {ROLES.map((role) => (
                    <SelectItem key={role} value={role} description={ROLE_DESCRIPTIONS[role]}>
                      {ROLE_LABELS[role]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </div>
        <Button type="submit" className="sm:mt-6" disabled={send.isPending}>
          {send.isPending ? 'Sending…' : 'Send invite'}
        </Button>
      </div>
    </form>
  );
}

function InviteRow({
  invite,
  workspaceId,
  now,
}: {
  invite: Invite;
  workspaceId: string;
  now: Date;
}) {
  const resend = useResendInvite(workspaceId);
  const revoke = useRevokeInvite(workspaceId);
  const expiry = inviteExpiry(invite.expiresAt, now);

  return (
    <li className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <p className="truncate text-14 font-medium">{invite.email}</p>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-13 text-muted-foreground">
          <span>{ROLE_LABELS[invite.role]}</span>
          <span aria-hidden>·</span>
          {expiry.expired ? (
            <Badge variant="warning">Expired</Badge>
          ) : (
            <span className="tabular-nums">{expiry.label}</span>
          )}
          {invite.invitedBy && (
            <>
              <span aria-hidden>·</span>
              <span className="truncate">Invited by {invite.invitedBy}</span>
            </>
          )}
        </p>
      </div>
      <div className="flex gap-1">
        <Button
          variant="ghost"
          size="sm"
          disabled={resend.isPending}
          aria-label={`Resend the invite to ${invite.email}`}
          onClick={() => {
            resend.mutate(invite.id, {
              onSuccess: ({ emailSent }) => {
                reportSent(invite.email, emailSent);
              },
              onError: (error) => {
                toast.error('Could not resend the invite', {
                  description: changeErrorMessage(error),
                });
              },
            });
          }}
        >
          <RotateCw aria-hidden />
          Resend
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={revoke.isPending}
          aria-label={`Withdraw the invite to ${invite.email}`}
          onClick={() => {
            revoke.mutate(invite.id, {
              onSuccess: () => {
                toast.success(`Invite to ${invite.email} withdrawn`);
              },
              onError: (error) => {
                toast.error('Could not withdraw the invite', {
                  description: changeErrorMessage(error),
                });
              },
            });
          }}
        >
          <X aria-hidden />
          Withdraw
        </Button>
      </div>
    </li>
  );
}

function InvitesSkeleton() {
  return (
    <ul aria-hidden className="flex flex-col divide-y">
      {[0, 1].map((row) => (
        <li key={row} className="flex items-center gap-3 py-3">
          <div className="flex flex-1 flex-col gap-1.5">
            <Skeleton className="h-3.5 w-48" />
            <Skeleton className="h-3 w-32" />
          </div>
          <Skeleton className="h-8 w-40" />
        </li>
      ))}
    </ul>
  );
}

/** Owners invite people by email and keep track of invites that are still open. */
export function InvitesCard({ workspace }: { workspace: WorkspaceSummary }) {
  const invites = useInvites(workspace.id, { enabled: true });
  const now = useNow();
  const emailRef = useRef<HTMLInputElement | null>(null);

  let list;
  if (invites.isPending) {
    list = <InvitesSkeleton />;
  } else if (invites.isError) {
    list = (
      <ErrorState
        title="Invites could not be loaded"
        description="Check your connection and try again."
        action={
          <Button
            variant="secondary"
            onClick={() => {
              void invites.refetch();
            }}
          >
            Try again
          </Button>
        }
      />
    );
  } else if (invites.data.length === 0) {
    list = (
      <EmptyState
        icon={Mail}
        title="No open invites"
        className="py-10"
        action={
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              emailRef.current?.focus();
            }}
          >
            Invite someone
          </Button>
        }
      />
    );
  } else {
    list = (
      <ul aria-label="Open invites" className="-my-3 flex flex-col divide-y">
        {invites.data.map((invite) => (
          <InviteRow key={invite.id} invite={invite} workspaceId={workspace.id} now={now} />
        ))}
      </ul>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Invite people</CardTitle>
        <CardDescription>
          They get an email with a link that works for 7 days, only for that address.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <InviteForm workspaceId={workspace.id} emailRef={emailRef} />
        <div className="flex flex-col gap-3">
          <h3 className="text-13 font-medium text-muted-foreground">Open invites</h3>
          {list}
        </div>
      </CardContent>
    </Card>
  );
}
