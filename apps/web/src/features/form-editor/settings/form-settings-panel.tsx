import { FormField } from '@/components/form-field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { issuesUnder, useDraftIssues } from '../draft-issues';
import { useEditorStore } from '../editor-store-context';
import { SettingsSection } from './settings-section';

/** Settings for the form as a whole, shown while no question is selected. */
export function FormSettingsPanel() {
  const settings = useEditorStore((state) => state.schema.settings);
  const updateSettings = useEditorStore((state) => state.updateSettings);
  const issues = issuesUnder(useDraftIssues(), 'draftSchema.settings');

  return (
    <div>
      <header className="border-b px-4 py-3">
        <h2 className="text-14 font-medium">Form settings</h2>
        <p className="text-12 text-muted-foreground">Select a question to edit it.</p>
      </header>
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
    </div>
  );
}
