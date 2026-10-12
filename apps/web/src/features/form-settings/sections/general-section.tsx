import { formSettingsSchema, formTitleSchema } from '@formyx/shared';
import { useId } from 'react';
import { SettingGroup, SettingRow } from '../setting-row';
import { useDraftSettings, useFormTitle } from '../use-settings';
import type { SectionProps } from './section-controls';
import { ValidatedInput } from './validated-input';

/** The form's title and the words on its submit button. */
export function GeneralSection({ form }: SectionProps) {
  const rename = useFormTitle(form.id);
  const setDraft = useDraftSettings(form.id);
  const titleId = useId();
  const buttonId = useId();

  return (
    <SettingGroup>
      <SettingRow
        id="title"
        label="Title"
        description="Shown at the top of the form, and in the dashboard."
        controlId={titleId}
        published
      >
        <ValidatedInput
          id={titleId}
          value={form.title}
          schema={formTitleSchema}
          maxLength={120}
          onValid={rename}
        />
      </SettingRow>
      <SettingRow
        id="submit-text"
        label="Submit button text"
        description="The button that sends the form. Keep it short: a verb works best."
        controlId={buttonId}
        published
      >
        <ValidatedInput
          id={buttonId}
          value={form.draftSchema.settings.submitButtonText}
          schema={formSettingsSchema.shape.submitButtonText}
          maxLength={40}
          onValid={(submitButtonText) => {
            setDraft({ submitButtonText }, { typing: true });
          }}
        />
      </SettingRow>
    </SettingGroup>
  );
}
