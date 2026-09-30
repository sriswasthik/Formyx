import { useEditorStore } from '../editor-store-context';
import { FieldSettings } from './field-settings';
import { FormSettingsPanel } from './form-settings-panel';

/** Settings for the selected question, or for the form when nothing is selected. */
export function SettingsPanel() {
  const selectedId = useEditorStore((state) => state.selectedFieldId);
  // Keyed so inputs holding half-typed values start fresh for each question.
  return selectedId ? <FieldSettings key={selectedId} id={selectedId} /> : <FormSettingsPanel />;
}
