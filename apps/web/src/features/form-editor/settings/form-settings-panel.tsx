import { FORM_DESCRIPTION_MAX_LENGTH } from '@formyx/shared';
import { FormField } from '@/components/form-field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { issuesUnder, useDraftIssues } from '../draft-issues';
import { useEditorStore } from '../editor-store-context';
import { fromDateTimeLocal, toDateTimeLocal } from './date-time';
import { NumberInput } from './number-input';
import { SettingsSection } from './settings-section';

/** Settings for the form as a whole, shown while no question is selected. */
export function FormSettingsPanel() {
  const settings = useEditorStore((state) => state.schema.settings);
  const description = useEditorStore((state) => state.schema.description ?? '');
  const updateSettings = useEditorStore((state) => state.updateSettings);
  const setDescription = useEditorStore((state) => state.setDescription);
  const draftIssues = useDraftIssues();
  const issues = issuesUnder(draftIssues, 'draftSchema.settings');
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
      <SettingsSection title="Submit button">
        <FormField id="setting-submit-text" label="Button text" error={issues.submitButtonText}>
          <Input
            maxLength={40}
            value={settings.submitButtonText}
            onChange={(event) => {
              updateSettings(
                { submitButtonText: event.target.value },
                { mergeKey: 'submitButtonText' },
              );
            }}
          />
        </FormField>
      </SettingsSection>
      <SettingsSection title="After submitting">
        <FormField
          id="setting-success-message"
          label="Success message"
          hint="Shown to respondents once their answers are in."
          error={issues.successMessage}
        >
          <Textarea
            rows={3}
            value={settings.successMessage}
            onChange={(event) => {
              updateSettings(
                { successMessage: event.target.value },
                { mergeKey: 'successMessage' },
              );
            }}
          />
        </FormField>
      </SettingsSection>
      <SettingsSection title="Responses">
        <FormField
          id="setting-response-limit"
          label="Response limit"
          hint="The form closes once it has this many responses."
          error={issues.closeAfterResponses}
        >
          <NumberInput
            integer
            placeholder="No limit"
            value={settings.closeAfterResponses}
            onValueChange={(closeAfterResponses) => {
              updateSettings({ closeAfterResponses }, { mergeKey: 'closeAfterResponses' });
            }}
          />
        </FormField>
        <FormField
          id="setting-close-at"
          label="Closing time"
          hint="Optional. In your time zone."
          error={issues.closeAt}
        >
          <Input
            type="datetime-local"
            value={toDateTimeLocal(settings.closeAt)}
            onChange={(event) => {
              updateSettings({ closeAt: fromDateTimeLocal(event.target.value) });
            }}
          />
        </FormField>
        <p className="text-13 text-muted-foreground">
          Limits apply to the published form, so publish after changing them.
        </p>
      </SettingsSection>
    </div>
  );
}
