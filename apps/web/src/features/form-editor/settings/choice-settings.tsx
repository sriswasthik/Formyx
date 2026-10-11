import { MIN_RANKING_OPTIONS, type FieldOfType, type PictureOption } from '@formyx/shared';
import { ThemeImageField } from '../design/theme-image-field';
import type { FieldPatch } from '../editor-store';
import { OptionsEditor } from './options-editor';
import { SettingsSection } from './settings-section';
import { SwitchSetting } from './switch-setting';

type Update = (patch: FieldPatch, mergeKey?: string) => void;

interface Props<T extends FieldOfType<'picture_choice' | 'ranking' | 'matrix'>> {
  field: T;
  issues: Record<string, string>;
  update: Update;
}

/** Pictures to pick from, each with its label (its text alternative too). */
export function PictureChoiceSettings({
  field,
  issues,
  update,
}: Props<FieldOfType<'picture_choice'>>) {
  const setImage = (index: number, imageUrl: string | undefined) => {
    update({
      options: field.options.map((option, i): PictureOption => {
        if (i !== index) return option;
        const { imageUrl: _previous, ...rest } = option;
        return imageUrl ? { ...rest, imageUrl } : rest;
      }),
    });
  };

  return (
    <>
      <SettingsSection title="Answers">
        <SwitchSetting
          id="setting-multiple"
          label="Allow several"
          hint="Respondents may pick more than one picture."
          checked={field.multiple}
          onCheckedChange={(multiple) => {
            update({ multiple });
          }}
        />
      </SettingsSection>
      <SettingsSection title="Pictures">
        <OptionsEditor
          options={field.options}
          issues={issues}
          onChange={(options, mergeKey) => {
            update({ options }, mergeKey);
          }}
          renderExtra={(option, index) => (
            <ThemeImageField
              kind="content"
              url={option.imageUrl}
              onChange={(url) => {
                setImage(index, url);
              }}
            />
          )}
        />
      </SettingsSection>
    </>
  );
}

/** The options respondents put in order. */
export function RankingSettings({ field, issues, update }: Props<FieldOfType<'ranking'>>) {
  return (
    <SettingsSection title="Options to rank">
      <OptionsEditor
        options={field.options}
        issues={issues}
        minimum={MIN_RANKING_OPTIONS}
        onChange={(options, mergeKey) => {
          update({ options }, mergeKey);
        }}
      />
    </SettingsSection>
  );
}

/** The statements down the side and the answers across the top. */
export function MatrixSettings({ field, issues, update }: Props<FieldOfType<'matrix'>>) {
  return (
    <>
      <SettingsSection title="Answers">
        <SwitchSetting
          id="setting-multiple"
          label="Several per row"
          hint="Respondents may pick more than one column in each row."
          checked={field.multiple}
          onCheckedChange={(multiple) => {
            update({ multiple });
          }}
        />
      </SettingsSection>
      <SettingsSection title="Rows">
        <OptionsEditor
          path="rows"
          options={field.rows}
          issues={issues}
          onChange={(rows, mergeKey) => {
            update({ rows }, mergeKey && `rows-${mergeKey}`);
          }}
        />
      </SettingsSection>
      <SettingsSection title="Columns">
        <OptionsEditor
          path="columns"
          options={field.columns}
          issues={issues}
          onChange={(columns, mergeKey) => {
            update({ columns }, mergeKey && `columns-${mergeKey}`);
          }}
        />
      </SettingsSection>
    </>
  );
}
