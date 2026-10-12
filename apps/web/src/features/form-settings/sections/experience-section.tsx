import {
  DATE_FORMAT_LABELS,
  DATE_FORMATS,
  FORM_LANGUAGE_NAMES,
  FORM_LANGUAGES,
  FORM_MESSAGES,
  NUMBER_FORMAT_LABELS,
  NUMBER_FORMATS,
  type FormLanguage,
  type FormTheme,
} from '@formyx/shared';
import { useId } from 'react';
import { Switch } from '@/components/ui/switch';
import { ProBadge } from '@/features/entitlements/pro-badge';
import { useEntitlements } from '@/features/entitlements/use-entitlements';
import { SettingGroup, SettingRow } from '../setting-row';
import { useDraftSettings, useThemeSettings } from '../use-settings';
import { OptionRadios, OptionSelect, type Option, type SectionProps } from './section-controls';

const LANGUAGE_OPTIONS: Option<FormLanguage>[] = FORM_LANGUAGES.map((language) => {
  const { native, english } = FORM_LANGUAGE_NAMES[language];
  return { value: language, label: native === english ? native : `${native} (${english})` };
});

const PROGRESS_OPTIONS: Option<FormTheme['layout']['progress']['style']>[] = [
  { value: 'none', label: 'None' },
  { value: 'line', label: 'A line' },
  { value: 'steps', label: 'Steps' },
  { value: 'percentage', label: 'Percentage' },
];

const NUMBERING_OPTIONS: Option<FormTheme['typography']['questionNumbering']>[] = [
  { value: 'none', label: 'None' },
  { value: 'number', label: '1, 2, 3' },
  { value: 'letter', label: 'A, B, C' },
];

const MARKER_OPTIONS: Option<FormTheme['typography']['requiredMarker']>[] = [
  { value: 'asterisk', label: 'An asterisk (*)', hint: 'Beside each required question.' },
  { value: 'word', label: 'The word “Required”', hint: 'Beside each required question.' },
  {
    value: 'optional',
    label: 'Mark optional questions instead',
    hint: 'For forms where most questions are required.',
  },
];

/** How the form reads and behaves for respondents. */
export function ExperienceSection({ form }: SectionProps) {
  const setDraft = useDraftSettings(form.id);
  const setTheme = useThemeSettings(form.id);
  const { hasFeature } = useEntitlements();
  const settings = form.draftSchema.settings;
  const ids = {
    language: useId(),
    date: useId(),
    number: useId(),
    progress: useId(),
    numbering: useId(),
    badge: useId(),
  };

  const saveProgressOptions: Option<typeof settings.saveProgress>[] = [
    {
      value: 'browser',
      label: 'In their browser',
      hint: 'Answers stay on their device as they go, so a reload loses nothing.',
    },
    {
      value: 'email',
      label: 'In their browser, and by email',
      hint: 'They can also email themselves a link to finish on another device.',
      badge: hasFeature('advanced_logic') ? undefined : <ProBadge />,
    },
    {
      value: 'off',
      label: 'Off',
      hint: 'Nothing is kept until they submit. For shared devices.',
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <SettingGroup title="Language and formats">
        <SettingRow
          id="language"
          label="Language"
          description="Buttons, messages, checks and dates are in this language. What you write stays as you wrote it."
          controlId={ids.language}
          published
        >
          <OptionSelect
            id={ids.language}
            value={settings.language}
            options={LANGUAGE_OPTIONS}
            onChange={(language) => {
              // A button still in the old language's default words follows the language.
              const oldDefault = FORM_MESSAGES[settings.language].nav.submit;
              setDraft({
                language,
                ...(settings.submitButtonText === oldDefault && {
                  submitButtonText: FORM_MESSAGES[language].nav.submit,
                }),
              });
            }}
          />
        </SettingRow>
        <SettingRow
          id="date-format"
          label="Date format"
          description="How dates are written in answers shown back, on end screens and in emails."
          controlId={ids.date}
          published
        >
          <OptionSelect
            id={ids.date}
            value={settings.dateFormat}
            options={DATE_FORMATS.map((value) => ({ value, label: DATE_FORMAT_LABELS[value] }))}
            onChange={(dateFormat) => {
              setDraft({ dateFormat });
            }}
          />
        </SettingRow>
        <SettingRow
          id="number-format"
          label="Number format"
          description="How numbers and amounts are grouped."
          controlId={ids.number}
          published
        >
          <OptionSelect
            id={ids.number}
            value={settings.numberFormat}
            options={NUMBER_FORMATS.map((value) => ({ value, label: NUMBER_FORMAT_LABELS[value] }))}
            onChange={(numberFormat) => {
              setDraft({ numberFormat });
            }}
          />
        </SettingRow>
      </SettingGroup>

      <SettingGroup title="Look">
        <SettingRow
          id="progress-bar"
          label="Progress bar"
          description="How far respondents are. The Design tab places it at the top or bottom."
          controlId={ids.progress}
          published
        >
          <OptionSelect
            id={ids.progress}
            value={form.theme.layout.progress.style}
            options={PROGRESS_OPTIONS}
            onChange={(style) => {
              setTheme('progress', (theme) => ({
                ...theme,
                layout: { ...theme.layout, progress: { ...theme.layout.progress, style } },
              }));
            }}
          />
        </SettingRow>
        <SettingRow
          id="question-numbers"
          label="Question numbers"
          controlId={ids.numbering}
          published
        >
          <OptionSelect
            id={ids.numbering}
            value={form.theme.typography.questionNumbering}
            options={NUMBERING_OPTIONS}
            onChange={(questionNumbering) => {
              setTheme('numbering', (theme) => ({
                ...theme,
                typography: { ...theme.typography, questionNumbering },
              }));
            }}
          />
        </SettingRow>
        <SettingRow
          id="required-marker"
          label="Required questions"
          description="Screen readers always hear which questions are required."
          published
          stacked
        >
          <OptionRadios
            label="How required questions are marked"
            value={form.theme.typography.requiredMarker}
            options={MARKER_OPTIONS}
            onChange={(requiredMarker) => {
              setTheme('marker', (theme) => ({
                ...theme,
                typography: { ...theme.typography, requiredMarker },
              }));
            }}
          />
        </SettingRow>
        <SettingRow
          id="badge"
          label="“Made with Formyx”"
          description="A small link under the form."
          controlId={ids.badge}
          compact
          pro={!hasFeature('remove_branding')}
          published
        >
          <Switch
            id={ids.badge}
            checked={form.theme.branding.showFormyxBadge}
            onCheckedChange={(showFormyxBadge) => {
              setTheme('badge', (theme) => ({
                ...theme,
                branding: { ...theme.branding, showFormyxBadge },
              }));
            }}
          />
        </SettingRow>
      </SettingGroup>

      <SettingGroup title="While they answer">
        <SettingRow id="save-progress" label="Saving progress" published stacked>
          <OptionRadios
            label="Saving progress"
            value={settings.saveProgress}
            options={saveProgressOptions}
            onChange={(saveProgress) => {
              setDraft({ saveProgress });
            }}
          />
        </SettingRow>
      </SettingGroup>
    </div>
  );
}
