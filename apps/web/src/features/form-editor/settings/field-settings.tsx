import type { Field, FieldOfType, FieldType } from '@formyx/shared';
import { FormField } from '@/components/form-field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { issuesUnder, useDraftIssues } from '../draft-issues';
import type { FieldPatch } from '../editor-store';
import { useEditorStore } from '../editor-store-context';
import { FIELD_TYPE_ICONS, fieldTypeLabel } from '../field-type-meta';
import { LogicSettings } from '../logic/logic-settings';
import { usePublishIssues } from '../publish/publish-issues';
import { SettingsSection } from './settings-section';
import { TypeSettings } from './type-settings';

const PLACEHOLDER_TYPES = [
  'short_text',
  'long_text',
  'email',
  'number',
  'phone',
  'dropdown',
] as const;

function hasPlaceholder(field: Field): field is FieldOfType<(typeof PLACEHOLDER_TYPES)[number]> {
  return (PLACEHOLDER_TYPES as readonly FieldType[]).includes(field.type);
}

/** Settings for the selected question. */
export function FieldSettings({ id }: { id: string }) {
  const index = useEditorStore((state) =>
    state.schema.fields.findIndex((field) => field.id === id),
  );
  const fields = useEditorStore((state) => state.schema.fields);
  const field = fields[index];
  const total = fields.length;
  const updateField = useEditorStore((state) => state.updateField);
  const draftIssues = useDraftIssues();
  const publishIssues = usePublishIssues();
  const issues = issuesUnder([...draftIssues, ...publishIssues], `draftSchema.fields.${index}`);

  if (!field) return null;

  const Icon = FIELD_TYPE_ICONS[field.type];
  const isStatement = field.type === 'statement';
  const update = (patch: FieldPatch, mergeKey?: string) => {
    updateField(id, patch, mergeKey ? { mergeKey: `${mergeKey}:${id}` } : undefined);
  };

  return (
    <div>
      <header className="flex items-center gap-2.5 border-b px-4 py-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border bg-surface text-muted-foreground">
          <Icon aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 className="text-14 font-medium">{fieldTypeLabel(field.type)}</h2>
          <p className="text-12 text-muted-foreground tabular-nums">
            Question {index + 1} of {total}
          </p>
        </div>
      </header>

      <SettingsSection title="Content">
        <FormField
          id="setting-label"
          label={isStatement ? 'Text' : 'Question'}
          error={issues.label}
        >
          <Textarea
            rows={2}
            value={field.label}
            placeholder={
              isStatement ? 'Write something for respondents' : 'What would you like to ask?'
            }
            onChange={(event) => {
              update({ label: event.target.value }, 'label');
            }}
          />
        </FormField>
        <FormField
          id="setting-description"
          label="Description"
          hint={
            isStatement ? 'Optional. Shown below the text.' : 'Optional. Shown below the question.'
          }
          error={issues.description}
        >
          <Textarea
            rows={2}
            value={field.description ?? ''}
            onChange={(event) => {
              update({ description: event.target.value || undefined }, 'description');
            }}
          />
        </FormField>
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
        {!isStatement && (
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-0.5">
              <Label htmlFor="setting-required">Required</Label>
              <p id="setting-required-hint" className="text-13 text-muted-foreground">
                Respondents must answer before submitting.
              </p>
            </div>
            <Switch
              id="setting-required"
              aria-describedby="setting-required-hint"
              checked={field.required}
              onCheckedChange={(required) => {
                update({ required });
              }}
            />
          </div>
        )}
      </SettingsSection>

      <TypeSettings field={field} issues={issues} update={update} />
      <LogicSettings field={field} index={index} fields={fields} issues={issues} update={update} />
    </div>
  );
}
