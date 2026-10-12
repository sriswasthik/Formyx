import { FORM_DESCRIPTION_MAX_LENGTH } from '@formyx/shared';
import { FormField } from '@/components/form-field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { ProBadge } from '@/features/entitlements/pro-badge';
import { issuesUnder, useDraftIssues } from '../draft-issues';
import { useEditorEntitlements } from '../editor-entitlements';
import { useEditorStore } from '../editor-store-context';
import { WebhooksSection } from '../webhooks/webhooks-section';
import { fromDateTimeLocal, toDateTimeLocal } from './date-time';
import { NumberInput } from './number-input';
import { SettingsSection } from './settings-section';

const SAVE_PROGRESS = [
  {
    value: 'browser',
    label: 'In their browser',
    hint: 'Answers are kept on their device as they go, so a reload loses nothing.',
  },
  {
    value: 'email',
    label: 'In their browser, and by email',
    hint: 'They can also email themselves a link to finish later, on any device.',
  },
  { value: 'off', label: 'Off', hint: 'Nothing is kept until they submit. For shared devices.' },
] as const;

/** Settings for the form as a whole, shown while no question is selected. */
export function FormSettingsPanel() {
  const settings = useEditorStore((state) => state.schema.settings);
  const description = useEditorStore((state) => state.schema.description ?? '');
  const updateSettings = useEditorStore((state) => state.updateSettings);
  const { hasFeature } = useEditorEntitlements();
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
      <SettingsSection title="Saving progress">
        <RadioGroup
          aria-label="Saving progress"
          value={settings.saveProgress}
          onValueChange={(value) => {
            const saveProgress = SAVE_PROGRESS.find((option) => option.value === value)?.value;
            if (saveProgress) updateSettings({ saveProgress });
          }}
        >
          {SAVE_PROGRESS.map((option) => (
            <div key={option.value} className="flex items-start gap-2.5">
              <RadioGroupItem
                id={`setting-save-${option.value}`}
                value={option.value}
                aria-describedby={`setting-save-${option.value}-hint`}
                className="mt-0.5"
              />
              <div className="flex flex-col gap-0.5">
                <Label
                  htmlFor={`setting-save-${option.value}`}
                  className="flex items-center gap-1.5 font-normal"
                >
                  {option.label}
                  {option.value === 'email' && !hasFeature('advanced_logic') && <ProBadge />}
                </Label>
                <p
                  id={`setting-save-${option.value}-hint`}
                  className="text-13 text-muted-foreground"
                >
                  {option.hint}
                </p>
              </div>
            </div>
          ))}
        </RadioGroup>
        <p className="text-13 text-muted-foreground">
          What respondents see after submitting is set in Logic, under End screens.
        </p>
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
      <WebhooksSection />
    </div>
  );
}
