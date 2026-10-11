import { isShownQuestionType, type Field, type FieldOfType, type FieldType } from '@formyx/shared';
import { FormField } from '@/components/form-field';
import { Input } from '@/components/ui/input';
import { issuesUnder, useDraftIssues } from '../draft-issues';
import type { FieldPatch } from '../editor-store';
import { useEditorStore } from '../editor-store-context';
import { FIELD_TYPE_ICONS, fieldTypeLabel } from '../field-type-meta';
import { LogicSettings } from '../logic/logic-settings';
import { usePublishIssues } from '../publish/publish-issues';
import { conditionSources } from '../logic/condition-edits';
import { PipedTextField } from '../logic-panel/piped-text-field';
import { RichTextEditor } from './rich-text-editor';
import { SettingsSection } from './settings-section';
import { ShuffleSettings } from './shuffle-settings';
import { SwitchSetting } from './switch-setting';
import { TypeSettings } from './type-settings';

const PLACEHOLDER_TYPES = [
  'short_text',
  'long_text',
  'email',
  'number',
  'phone',
  'dropdown',
  'url',
] as const;

function hasPlaceholder(field: Field): field is FieldOfType<(typeof PLACEHOLDER_TYPES)[number]> {
  return (PLACEHOLDER_TYPES as readonly FieldType[]).includes(field.type);
}

interface TextCopy {
  label: string;
  placeholder?: string;
  hint?: string;
}

/** What the label means for each type; `null` where it is not shown to anyone. */
function labelCopy(type: FieldType): TextCopy | null {
  switch (type) {
    case 'statement':
      return { label: 'Text', placeholder: 'Write something for respondents' };
    case 'consent':
      return { label: 'Checkbox text', placeholder: 'I agree to the terms above' };
    case 'hidden':
      return {
        label: 'Name',
        hint: 'Shown in your responses and exports. Respondents never see it.',
      };
    case 'page_break':
      return { label: 'Page title', hint: 'Optional. Shown at the top of the new page.' };
    case 'video':
      return { label: 'Title', hint: 'Optional. Names the video for screen readers.' };
    case 'image':
    case 'divider':
      return null;
    default:
      return { label: 'Question', placeholder: 'What would you like to ask?' };
  }
}

/** What the description means for each type; `null` where it has none. */
function descriptionCopy(type: FieldType): TextCopy | null {
  switch (type) {
    case 'divider':
    case 'hidden':
      return null;
    case 'image':
      return { label: 'Caption', hint: 'Optional. Shown below the image.' };
    case 'video':
      return { label: 'Caption', hint: 'Optional. Shown below the video.' };
    case 'statement':
      return { label: 'Description', hint: 'Optional. Shown below the text.' };
    case 'consent':
      return { label: 'Description', hint: 'Optional. Shown below the checkbox.' };
    case 'page_break':
      return { label: 'Description', hint: 'Optional. Shown under the page title.' };
    default:
      return { label: 'Description', hint: 'Optional. Shown below the question.' };
  }
}

/** Settings for the selected question. */
export function FieldSettings({ id }: { id: string }) {
  const index = useEditorStore((state) =>
    state.schema.fields.findIndex((field) => field.id === id),
  );
  const fields = useEditorStore((state) => state.schema.fields);
  const variables = useEditorStore((state) => state.schema.logic.variables);
  const field = fields[index];
  const total = fields.length;
  const updateField = useEditorStore((state) => state.updateField);
  const draftIssues = useDraftIssues();
  const publishIssues = usePublishIssues();
  const issues = issuesUnder([...draftIssues, ...publishIssues], `draftSchema.fields.${index}`);

  if (!field) return null;

  const Icon = FIELD_TYPE_ICONS[field.type];
  const labelText = labelCopy(field.type);
  const descriptionText = descriptionCopy(field.type);
  const update = (patch: FieldPatch, mergeKey?: string) => {
    updateField(id, patch, mergeKey ? { mergeKey: `${mergeKey}:${id}` } : undefined);
  };
  // Answers to earlier questions, and values, can be piped into this one's text.
  const pipe = { fields: conditionSources(fields, index), variables, quiz: false };

  return (
    <div>
      <header className="flex items-center gap-2.5 border-b px-4 py-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border bg-surface text-muted-foreground">
          <Icon aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 className="text-14 font-medium">{fieldTypeLabel(field.type)}</h2>
          <p className="text-12 text-muted-foreground tabular-nums">
            {index + 1} of {total} in this form
          </p>
        </div>
      </header>

      {labelText || descriptionText ? (
        <SettingsSection title="Content">
          {labelText &&
            (field.type === 'statement' ? (
              <RichTextEditor
                id="setting-label"
                label={labelText.label}
                rows={4}
                value={field.label}
                placeholder={labelText.placeholder}
                error={issues.label}
                pipe={pipe}
                onChange={(label) => {
                  update({ label }, 'label');
                }}
              />
            ) : (
              <PipedTextField
                id="setting-label"
                label={labelText.label}
                rows={2}
                value={field.label}
                placeholder={labelText.placeholder}
                hint={labelText.hint}
                error={issues.label}
                pipe={field.type === 'hidden' ? undefined : pipe}
                onChange={(label) => {
                  update({ label }, 'label');
                }}
              />
            ))}
          {descriptionText && (
            <PipedTextField
              id="setting-description"
              label={descriptionText.label}
              rows={2}
              value={field.description ?? ''}
              hint={descriptionText.hint}
              error={issues.description}
              pipe={pipe}
              onChange={(description) => {
                update({ description: description || undefined }, 'description');
              }}
            />
          )}
          {hasPlaceholder(field) && (
            <FormField
              id="setting-placeholder"
              label="Placeholder"
              hint="Shown in the empty answer box."
              error={issues.placeholder}
            >
              <Input
                value={field.placeholder ?? ''}
                onChange={(event) => {
                  update({ placeholder: event.target.value || undefined }, 'placeholder');
                }}
              />
            </FormField>
          )}
          {isShownQuestionType(field.type) && (
            <SwitchSetting
              id="setting-required"
              label="Required"
              hint="Respondents must answer before submitting."
              checked={field.required}
              onCheckedChange={(required) => {
                update({ required });
              }}
            />
          )}
        </SettingsSection>
      ) : (
        <SettingsSection title="Content">
          <p className="text-13 text-muted-foreground">A divider has nothing to set.</p>
        </SettingsSection>
      )}

      <TypeSettings field={field} issues={issues} update={update} />
      {(field.type === 'single_choice' ||
        field.type === 'multi_choice' ||
        field.type === 'dropdown' ||
        field.type === 'picture_choice' ||
        field.type === 'ranking') && <ShuffleSettings field={field} update={update} />}
      <LogicSettings field={field} index={index} fields={fields} issues={issues} update={update} />
    </div>
  );
}
