import {
  DATE_FORMAT_LABELS,
  DATE_FORMATS,
  DEFAULT_TIME_ZONE,
  type WorkspacePreferences,
  type WorkspaceSummary,
} from '@formyx/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useId, useMemo } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  accountKeys,
  getWorkspacePreferences,
  updateWorkspacePreferences,
} from '@/features/account/account-api';
import { ProBadge } from '@/features/entitlements/pro-badge';
import { useEntitlements } from '@/features/entitlements/use-entitlements';
import { EmailList } from '@/features/form-settings/sections/notifications-section';
import { OptionRadios, OptionSelect } from '@/features/form-settings/sections/section-controls';
import { changeErrorMessage } from '@/lib/api';

/** "Asia/Kolkata (GMT+5:30)", for every zone the browser knows, sorted by name. */
function timeZoneOptions(current: string) {
  const zones = new Set(Intl.supportedValuesOf('timeZone'));
  zones.add(current);
  zones.add(DEFAULT_TIME_ZONE);
  const now = new Date();
  return [...zones].sort().map((zone) => {
    let offset = '';
    try {
      offset =
        new Intl.DateTimeFormat('en-GB', { timeZone: zone, timeZoneName: 'shortOffset' })
          .formatToParts(now)
          .find((part) => part.type === 'timeZoneName')?.value ?? '';
    } catch {
      // A zone this browser cannot format still shows, without its offset.
    }
    return { value: zone, label: offset ? `${zone.replace(/_/g, ' ')} (${offset})` : zone };
  });
}

const FREQUENCY_OPTIONS = [
  { value: 'instant', label: 'For every response' },
  { value: 'daily', label: 'A daily digest' },
] as const;

function PreferencesForm({
  workspace,
  preferences,
}: {
  workspace: WorkspaceSummary;
  preferences: WorkspacePreferences;
}) {
  const queryClient = useQueryClient();
  const key = accountKeys.workspacePreferences(workspace.id);
  const isOwner = workspace.role === 'OWNER';
  const ids = { zone: useId(), date: useId() };
  const { hasFeature } = useEntitlements();
  const zones = useMemo(() => timeZoneOptions(preferences.timeZone), [preferences.timeZone]);

  const mutation = useMutation({
    mutationFn: (next: WorkspacePreferences) => updateWorkspacePreferences(workspace.id, next),
    onMutate: (next) => {
      const previous = queryClient.getQueryData<WorkspacePreferences>(key);
      queryClient.setQueryData(key, next);
      return { previous };
    },
    onError: (error, _next, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
      toast.error('Could not save the workspace preferences', {
        description: changeErrorMessage(error),
      });
    },
    onSuccess: (saved) => {
      queryClient.setQueryData(key, saved);
      toast.success('Workspace preferences saved');
    },
  });
  const save = (patch: Partial<WorkspacePreferences>) => {
    mutation.mutate({ ...preferences, ...patch });
  };

  if (!isOwner) {
    return (
      <dl className="grid gap-3 text-14 sm:grid-cols-[10rem_1fr]">
        <dt className="text-muted-foreground">Time zone</dt>
        <dd>{zones.find((zone) => zone.value === preferences.timeZone)?.label}</dd>
        <dt className="text-muted-foreground">Date format</dt>
        <dd>{DATE_FORMAT_LABELS[preferences.dateFormat]}</dd>
        <dt className="text-muted-foreground">New forms notify</dt>
        <dd>
          {preferences.defaultNotifications.frequency === 'daily'
            ? 'With a daily digest'
            : 'For every response'}
        </dd>
      </dl>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={ids.zone}>Time zone</Label>
          <OptionSelect
            id={ids.zone}
            value={preferences.timeZone}
            options={zones}
            onChange={(timeZone) => {
              save({ timeZone });
            }}
          />
          <p className="text-13 text-muted-foreground">
            For digests, and for forms&apos; opening times shown to respondents.
          </p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={ids.date}>Date format</Label>
          <OptionSelect
            id={ids.date}
            value={preferences.dateFormat}
            options={DATE_FORMATS.map((value) => ({ value, label: DATE_FORMAT_LABELS[value] }))}
            onChange={(dateFormat) => {
              save({ dateFormat });
            }}
          />
          <p className="text-13 text-muted-foreground">In digests and other emails.</p>
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <h3 className="text-14 font-medium">Notifications for new forms</h3>
        <OptionRadios
          label="How often new forms email about responses"
          value={preferences.defaultNotifications.frequency}
          options={FREQUENCY_OPTIONS}
          onChange={(frequency) => {
            save({ defaultNotifications: { ...preferences.defaultNotifications, frequency } });
          }}
        />
        <div className="flex flex-col gap-1.5">
          <p className="flex flex-wrap items-center gap-2 text-13 text-muted-foreground">
            Also email these addresses about new forms&apos; responses.
            {!hasFeature('extra_recipients') && <ProBadge />}
          </p>
          <EmailList
            emails={preferences.defaultNotifications.emails}
            onChange={(emails) => {
              save({ defaultNotifications: { ...preferences.defaultNotifications, emails } });
            }}
          />
        </div>
      </div>
    </div>
  );
}

/** The workspace's time zone, date format and what new forms' notifications start as. */
export function WorkspacePreferencesCard({ workspace }: { workspace: WorkspaceSummary }) {
  const query = useQuery({
    queryKey: accountKeys.workspacePreferences(workspace.id),
    queryFn: () => getWorkspacePreferences(workspace.id),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Preferences</CardTitle>
        <CardDescription>
          {workspace.role === 'OWNER'
            ? 'For everyone in the workspace. Each form can change its own notifications.'
            : 'Only owners can change these.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {query.data ? (
          <PreferencesForm workspace={workspace} preferences={query.data} />
        ) : query.isError ? (
          <p role="alert" className="text-14 text-danger-text">
            Could not load the workspace preferences. Reload the page to try again.
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2" aria-busy="true" aria-label="Loading">
            <Skeleton className="h-9" />
            <Skeleton className="h-9" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
