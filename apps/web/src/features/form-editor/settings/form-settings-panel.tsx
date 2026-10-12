import { FORM_DESCRIPTION_MAX_LENGTH } from '@formyx/shared';
import { ArrowRight } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { FormField } from '@/components/form-field';
import { Textarea } from '@/components/ui/textarea';
import { formIntegrationsPath, formSettingsPath } from '@/features/forms/form-paths';
import { useDraftIssues } from '../draft-issues';
import { useEditorStore } from '../editor-store-context';
import { SettingsSection } from './settings-section';

/** Settings for the form as a whole, shown while no question is selected. */
export function FormSettingsPanel() {
  const { formId = '' } = useParams();
  const description = useEditorStore((state) => state.schema.description ?? '');
  const setDescription = useEditorStore((state) => state.setDescription);
  const draftIssues = useDraftIssues();
  const descriptionIssue = draftIssues.find((issue) => issue.path === 'draftSchema.description');

  return (
    <div>
      <header className="border-b px-4 py-3">
        <h2 className="text-14 font-medium">Form settings</h2>
        <p className="text-12 text-muted-foreground">Select a question to edit it.</p>
      </header>
      <SettingsSection title="Introduction">
        <FormField
          id="setting-form-description"
          label="Description"
          hint="Optional. Shown under the title."
          error={descriptionIssue?.message}
        >
          <Textarea
            rows={3}
            maxLength={FORM_DESCRIPTION_MAX_LENGTH}
            value={description}
            placeholder="Tell respondents what the form is for"
            onChange={(event) => {
              setDescription(event.target.value, { mergeKey: 'description' });
            }}
          />
        </FormField>
      </SettingsSection>
      <SettingsSection title="More settings">
        <p className="text-13 text-muted-foreground">
          Access, the button text, language, notifications, the autoresponder, sharing and data have
          their own page.
        </p>
        <Link
          to={formSettingsPath(formId)}
          className="inline-flex items-center gap-1.5 self-start rounded-sm text-14 text-accent underline-offset-4 hover:underline"
        >
          Open form settings
          <ArrowRight aria-hidden />
        </Link>
      </SettingsSection>
      <SettingsSection title="Integrations">
        <p className="text-13 text-muted-foreground">
          Webhooks, Google Sheets, Notion, Slack and Discord.
        </p>
        <Link
          to={formIntegrationsPath(formId)}
          className="inline-flex items-center gap-1.5 self-start rounded-sm text-14 text-accent underline-offset-4 hover:underline"
        >
          Open Integrations
          <ArrowRight aria-hidden />
        </Link>
      </SettingsSection>
    </div>
  );
}
