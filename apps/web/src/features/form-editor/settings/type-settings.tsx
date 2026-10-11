import {
  FILE_CATEGORIES,
  FILE_MAX_SIZE_MB,
  type Field,
  type FieldOfType,
  type FileCategory,
} from '@formyx/shared';
import { FormField } from '@/components/form-field';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { FILE_CATEGORY_LABELS } from '@/features/form-renderer/file-types';
import type { FieldPatch } from '../editor-store';
import { NumberInput } from './number-input';
import { ConsentSettings, ImageSettings, VideoSettings } from './block-settings';
import { MatrixSettings, PictureChoiceSettings, RankingSettings } from './choice-settings';
import {
  CurrencySettings,
  HiddenSettings,
  PhoneSettings,
  VoiceNoteSettings,
} from './input-settings';
import { OptionsEditor } from './options-editor';
import { compact } from './compact-limits';
import { RangeInputs } from './range-inputs';
import {
  NpsSettings,
  OpinionScaleSettings,
  RatingSettings,
  SliderSettings,
} from './scale-settings';
import { SettingsSection } from './settings-section';

type Update = (patch: FieldPatch, mergeKey?: string) => void;

function TextLengthSettings({
  field,
  issues,
  update,
}: {
  field: FieldOfType<'short_text' | 'long_text'>;
  issues: Record<string, string>;
  update: Update;
}) {
  return (
    <SettingsSection title="Answer length">
      <RangeInputs
        id="setting-length"
        minLabel="Minimum characters"
        maxLabel="Maximum characters"
        integer
        min={field.validation?.minLength}
        max={field.validation?.maxLength}
        errors={{
          min: issues['validation.minLength'],
          max: issues['validation.maxLength'],
        }}
        onChange={({ min, max }, key) => {
          update({ validation: compact({ minLength: min, maxLength: max }) }, `length-${key}`);
        }}
      />
    </SettingsSection>
  );
}

function NumberRangeSettings({
  field,
  issues,
  update,
}: {
  field: FieldOfType<'number'>;
  issues: Record<string, string>;
  update: Update;
}) {
  return (
    <SettingsSection title="Allowed numbers">
      <RangeInputs
        id="setting-range"
        minLabel="Minimum"
        maxLabel="Maximum"
        integer={false}
        min={field.validation?.min}
        max={field.validation?.max}
        errors={{ min: issues['validation.min'], max: issues['validation.max'] }}
        onChange={(range, key) => {
          update({ validation: compact(range) }, `range-${key}`);
        }}
      />
    </SettingsSection>
  );
}

function FileSettings({
  field,
  issues,
  update,
}: {
  field: FieldOfType<'file'>;
  issues: Record<string, string>;
  update: Update;
}) {
  const { maxSizeMb, allowedTypes } = field.fileConfig;
  const toggle = (category: FileCategory, checked: boolean) => {
    const next = checked
      ? FILE_CATEGORIES.filter((item) => item === category || allowedTypes.includes(item))
      : allowedTypes.filter((item) => item !== category);
    update({ fileConfig: { maxSizeMb, allowedTypes: next } });
  };

  return (
    <SettingsSection title="Files">
      <FormField
        id="setting-max-size"
        label="Maximum size (MB)"
        hint={`1 to ${FILE_MAX_SIZE_MB} MB.`}
        error={issues['fileConfig.maxSizeMb']}
      >
        <NumberInput
          integer
          className="w-28"
          value={maxSizeMb}
          onValueChange={(value) => {
            update({ fileConfig: { allowedTypes, maxSizeMb: value ?? 0 } }, 'max-size');
          }}
        />
      </FormField>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 text-13 font-medium">Allowed types</legend>
        <div className="grid grid-cols-2 gap-x-3 gap-y-2">
          {FILE_CATEGORIES.map((category) => (
            <div key={category} className="flex items-center gap-2">
              <Checkbox
                id={`setting-file-${category}`}
                checked={allowedTypes.includes(category)}
                onCheckedChange={(checked) => {
                  toggle(category, checked === true);
                }}
              />
              <Label htmlFor={`setting-file-${category}`} className="font-normal">
                {FILE_CATEGORY_LABELS[category]}
              </Label>
            </div>
          ))}
        </div>
        {issues['fileConfig.allowedTypes'] && (
          <p className="text-13 text-danger-text">{issues['fileConfig.allowedTypes']}</p>
        )}
      </fieldset>
    </SettingsSection>
  );
}

/** Settings that only some question types have. */
export function TypeSettings({
  field,
  issues,
  update,
}: {
  field: Field;
  issues: Record<string, string>;
  update: Update;
}) {
  switch (field.type) {
    case 'short_text':
    case 'long_text':
      return <TextLengthSettings field={field} issues={issues} update={update} />;
    case 'number':
      return <NumberRangeSettings field={field} issues={issues} update={update} />;
    case 'single_choice':
    case 'multi_choice':
    case 'dropdown':
      return (
        <SettingsSection title="Options">
          <OptionsEditor
            options={field.options}
            issues={issues}
            onChange={(options, mergeKey) => {
              update({ options }, mergeKey);
            }}
          />
        </SettingsSection>
      );
    case 'rating':
      return <RatingSettings field={field} update={update} />;
    case 'file':
      return <FileSettings field={field} issues={issues} update={update} />;
    case 'picture_choice':
      return <PictureChoiceSettings field={field} issues={issues} update={update} />;
    case 'nps':
      return <NpsSettings field={field} issues={issues} update={update} />;
    case 'opinion_scale':
      return <OpinionScaleSettings field={field} issues={issues} update={update} />;
    case 'slider':
      return <SliderSettings field={field} issues={issues} update={update} />;
    case 'ranking':
      return <RankingSettings field={field} issues={issues} update={update} />;
    case 'matrix':
      return <MatrixSettings field={field} issues={issues} update={update} />;
    case 'phone':
      return <PhoneSettings field={field} issues={issues} update={update} />;
    case 'currency':
      return <CurrencySettings field={field} issues={issues} update={update} />;
    case 'image':
      return <ImageSettings field={field} issues={issues} update={update} />;
    case 'video':
      return <VideoSettings field={field} issues={issues} update={update} />;
    case 'consent':
      return <ConsentSettings field={field} issues={issues} update={update} />;
    case 'hidden':
      return <HiddenSettings field={field} issues={issues} update={update} />;
    case 'voice_note':
      return <VoiceNoteSettings field={field} issues={issues} update={update} />;
    // Yes/no, address, time, date range, URL, signature, colour and the plain blocks have
    // nothing more to set.
    default:
      return null;
  }
}
