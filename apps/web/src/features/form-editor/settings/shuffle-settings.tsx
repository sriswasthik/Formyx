import type { FieldOfType } from '@formyx/shared';
import type { FieldPatch } from '../editor-store';
import { SettingsSection } from './settings-section';
import { SwitchSetting } from './switch-setting';

type Shuffleable = FieldOfType<
  'single_choice' | 'multi_choice' | 'dropdown' | 'picture_choice' | 'ranking'
>;

/** Each respondent sees the options in their own order, optionally keeping the last put. */
export function ShuffleSettings({
  field,
  update,
}: {
  field: Shuffleable;
  update: (patch: FieldPatch) => void;
}) {
  const shuffle = field.shuffleOptions === true;
  return (
    <SettingsSection title="Order">
      <SwitchSetting
        id="setting-shuffle-options"
        label="Shuffle options"
        hint={
          field.type === 'ranking'
            ? 'Each respondent starts from their own order, so none comes first by default.'
            : 'Each respondent sees the options in their own order.'
        }
        checked={shuffle}
        onCheckedChange={(on) => {
          update(
            on
              ? { shuffleOptions: true }
              : { shuffleOptions: undefined, keepLastOption: undefined },
          );
        }}
      />
      {shuffle && (
        <SwitchSetting
          id="setting-keep-last"
          label="Keep the last option last"
          hint='For an option such as "Other" or "None of these".'
          checked={field.keepLastOption === true}
          onCheckedChange={(on) => {
            update({ keepLastOption: on ? true : undefined });
          }}
        />
      )}
    </SettingsSection>
  );
}
