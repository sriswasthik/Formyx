import { useId } from 'react';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useNotificationSettings, useUpdateNotificationSettings } from './use-responses';

/** The signed-in member's own choice to be emailed about this form's new responses. */
export function NotifyToggle({ formId }: { formId: string }) {
  const id = useId();
  const settings = useNotificationSettings(formId);
  const update = useUpdateNotificationSettings(formId);
  const checked = settings.data?.emailOnSubmission ?? false;

  return (
    <div className="flex items-center gap-2.5">
      <Switch
        id={id}
        checked={checked}
        // Until the current setting is known, there is nothing sensible to toggle.
        disabled={!settings.data}
        aria-describedby={settings.isError ? `${id}-error` : undefined}
        onCheckedChange={(emailOnSubmission) => {
          update.mutate({ emailOnSubmission });
        }}
      />
      <Label htmlFor={id} className="text-13 font-normal">
        Email me on new responses
      </Label>
      {settings.isError && (
        <span id={`${id}-error`} className="sr-only">
          Your email setting could not be loaded.
        </span>
      )}
    </div>
  );
}
