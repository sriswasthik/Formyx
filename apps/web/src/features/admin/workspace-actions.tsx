import {
  COMPLIMENTARY_MAX_DAYS,
  PAID_PLANS,
  PLAN_LABELS,
  TRIAL_EXTENSION_MAX_DAYS,
  type AdminWorkspace,
  type PaidPlan,
} from '@formyx/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
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
import { changeErrorMessage } from '@/lib/api';
import { endComplimentary, extendTrial, grantComplimentary } from './admin-api';

/** Giving a selected workspace a complimentary plan or more trial. */
export function WorkspaceActions({
  workspace,
  query,
}: {
  workspace: AdminWorkspace;
  query: string;
}) {
  const queryClient = useQueryClient();
  const [plan, setPlan] = useState<PaidPlan>('PRO');
  const [days, setDays] = useState('30');
  const [note, setNote] = useState('');
  const [trialDays, setTrialDays] = useState('14');

  const updated = (next: AdminWorkspace, message: string) => {
    queryClient.setQueryData<AdminWorkspace[]>(['admin', 'workspaces', query], (list) =>
      list?.map((item) => (item.id === next.id ? next : item)),
    );
    toast.success(message);
  };
  const failed = (title: string) => (error: Error) => {
    toast.error(title, { description: changeErrorMessage(error) });
  };

  const grant = useMutation({
    mutationFn: () =>
      grantComplimentary(workspace.id, {
        plan,
        days: Number(days),
        ...(note.trim() && { note: note.trim() }),
      }),
    onSuccess: (next) => {
      updated(next, `${PLAN_LABELS[plan]} given for ${days} days`);
    },
    onError: failed('Could not give the plan'),
  });
  const end = useMutation({
    mutationFn: () => endComplimentary(workspace.id),
    onSuccess: (next) => {
      updated(next, 'Complimentary plan ended');
    },
    onError: failed('Could not end the plan'),
  });
  const trial = useMutation({
    mutationFn: () => extendTrial(workspace.id, { days: Number(trialDays) }),
    onSuccess: (next) => {
      updated(next, `Trial extended by ${trialDays} days`);
    },
    onError: failed('Could not extend the trial'),
  });

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Complimentary plan</CardTitle>
          <CardDescription>
            For testers and friends: on top of anything paid for, until it ends.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              grant.mutate();
            }}
          >
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="grant-plan">Plan</Label>
                <Select
                  value={plan}
                  onValueChange={(value) => {
                    setPlan(value as PaidPlan);
                  }}
                >
                  <SelectTrigger id="grant-plan">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAID_PLANS.map((option) => (
                      <SelectItem key={option} value={option}>
                        {PLAN_LABELS[option]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="grant-days">Days</Label>
                <Input
                  id="grant-days"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={COMPLIMENTARY_MAX_DAYS}
                  required
                  value={days}
                  onChange={(event) => {
                    setDays(event.target.value);
                  }}
                />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="grant-note">Who it is for (optional)</Label>
              <Input
                id="grant-note"
                maxLength={200}
                value={note}
                onChange={(event) => {
                  setNote(event.target.value);
                }}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={grant.isPending}>
                {grant.isPending ? 'Giving…' : 'Give plan'}
              </Button>
              {workspace.complimentaryPlan && (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={end.isPending}
                  onClick={() => {
                    end.mutate();
                  }}
                >
                  End it now
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Trial</CardTitle>
          <CardDescription>
            Adds days to a running trial, or starts one again for a workspace on Free.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="flex items-end gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              trial.mutate();
            }}
          >
            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor="trial-days">Days</Label>
              <Input
                id="trial-days"
                type="number"
                inputMode="numeric"
                min={1}
                max={TRIAL_EXTENSION_MAX_DAYS}
                required
                value={trialDays}
                onChange={(event) => {
                  setTrialDays(event.target.value);
                }}
              />
            </div>
            <Button type="submit" variant="secondary" disabled={trial.isPending}>
              {trial.isPending ? 'Extending…' : 'Extend trial'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
