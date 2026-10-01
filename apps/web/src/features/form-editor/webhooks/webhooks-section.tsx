import { Webhook } from 'lucide-react';
import { useState } from 'react';
import { useParams } from 'react-router';
import { Button } from '@/components/ui/button';
import { SettingsSection } from '../settings/settings-section';
import { WebhooksSheet } from './webhooks-sheet';

/** Form settings' way into webhooks; the work happens in a sheet. */
export function WebhooksSection() {
  const { formId = '' } = useParams();
  const [open, setOpen] = useState(false);

  return (
    <SettingsSection title="Webhooks">
      <p className="text-13 text-muted-foreground">
        Send each new response to another service, signed so it can tell the request came from
        Formyx.
      </p>
      <div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            setOpen(true);
          }}
        >
          <Webhook aria-hidden />
          Manage webhooks
        </Button>
      </div>
      <WebhooksSheet formId={formId} open={open} onOpenChange={setOpen} />
    </SettingsSection>
  );
}
