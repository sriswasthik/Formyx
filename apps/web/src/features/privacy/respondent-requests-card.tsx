import { respondentLookupInputSchema, type WorkspaceSummary } from '@formyx/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { SearchX } from 'lucide-react';
import { useId, useState } from 'react';
import { toast } from 'sonner';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { FormField } from '@/components/form-field';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { formatBillingDate } from '@/features/billing/billing-format';
import { changeErrorMessage } from '@/lib/api';
import { deleteRespondentData, lookupRespondent, privacyKeys } from './privacy-api';

const responses = (count: number) => (count === 1 ? '1 response' : `${String(count)} responses`);

/**
 * When someone who answered the workspace's forms asks what it holds about them, or for it
 * to be deleted: find every response with their address, and delete them all.
 */
export function RespondentRequestsCard({ workspace }: { workspace: WorkspaceSummary }) {
  const queryClient = useQueryClient();
  const inputId = useId();
  const [typed, setTyped] = useState('');
  const [inputError, setInputError] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const lookup = useQuery({
    queryKey: privacyKeys.respondent(workspace.id, email ?? ''),
    queryFn: () => lookupRespondent(workspace.id, email ?? ''),
    enabled: email !== null,
    staleTime: 0,
  });
  const remove = useMutation({
    mutationFn: () => deleteRespondentData(workspace.id, email ?? ''),
    onSuccess: (deleted) => {
      setConfirming(false);
      toast.success(`${responses(deleted)} deleted`);
      void queryClient.invalidateQueries({ queryKey: ['forms'] });
      void lookup.refetch();
    },
    onError: (error) => {
      toast.error('Could not delete the responses', { description: changeErrorMessage(error) });
    },
  });

  if (workspace.role === 'VIEWER') return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Respondents’ data requests</CardTitle>
        <CardDescription>
          When someone asks what your forms hold about them, or for it to be deleted, find every
          response with their email address: the one they gave before the questions, or in an
          answer.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <form
          noValidate
          className="flex flex-col gap-3 sm:flex-row sm:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            const parsed = respondentLookupInputSchema.safeParse({ email: typed });
            if (!parsed.success) {
              setInputError('Enter the respondent’s email address');
              return;
            }
            setInputError(null);
            setEmail(parsed.data.email);
          }}
        >
          <div className="flex-1">
            <FormField id={inputId} label="Respondent’s email" error={inputError ?? undefined}>
              <Input
                type="email"
                autoComplete="off"
                spellCheck={false}
                value={typed}
                onChange={(event) => {
                  setTyped(event.target.value);
                }}
              />
            </FormField>
          </div>
          <Button type="submit" variant="secondary">
            Find responses
          </Button>
        </form>

        {email !== null &&
          (lookup.isPending ? (
            <div aria-busy="true" aria-label="Finding responses" className="flex flex-col gap-2">
              <Skeleton className="h-12 rounded-lg" />
            </div>
          ) : lookup.isError ? (
            <ErrorState
              title="Could not look up the responses"
              action={
                <Button
                  variant="secondary"
                  onClick={() => {
                    void lookup.refetch();
                  }}
                >
                  Try again
                </Button>
              }
            />
          ) : lookup.data.total === 0 ? (
            <EmptyState
              icon={SearchX}
              title="No responses with this address"
              description={`None of this workspace’s forms hold ${email}.`}
            />
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-14 tabular-nums" role="status">
                {responses(lookup.data.total)} {lookup.data.total === 1 ? 'holds' : 'hold'} {email}.
              </p>
              <ul className="flex flex-col divide-y rounded-lg border">
                {lookup.data.matches.map((match) => (
                  <li
                    key={match.submissionId}
                    className="flex flex-col gap-0.5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <span className="text-14 font-medium break-words">{match.formTitle}</span>
                    <span className="text-13 text-muted-foreground">
                      {formatBillingDate(match.createdAt)} ·{' '}
                      {match.matchedBy === 'respondent_email'
                        ? 'given before the questions'
                        : 'in an answer'}
                    </span>
                  </li>
                ))}
              </ul>
              <Button
                variant="secondary"
                className="self-start text-danger-text"
                onClick={() => {
                  setConfirming(true);
                }}
              >
                Delete {responses(lookup.data.total)}
              </Button>
              <AlertDialog open={confirming} onOpenChange={setConfirming}>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete {responses(lookup.data.total)}?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Every response holding {email} is deleted, with any files uploaded with it,
                      for everyone in the workspace. This can’t be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <Button
                      variant="destructive"
                      disabled={remove.isPending}
                      onClick={() => {
                        remove.mutate();
                      }}
                    >
                      {remove.isPending ? 'Deleting…' : 'Delete responses'}
                    </Button>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          ))}
      </CardContent>
    </Card>
  );
}
