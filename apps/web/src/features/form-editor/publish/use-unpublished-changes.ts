import { isSameFormSchema, isSameTheme, type FormDetail } from '@formyx/shared';
import { useMemo } from 'react';
import { useEditorStore } from '../editor-store-context';

/** Whether the draft, title or theme differ from what respondents currently see. */
export function useHasUnpublishedChanges(form: FormDetail): boolean {
  const title = useEditorStore((state) => state.title);
  const schema = useEditorStore((state) => state.schema);
  const theme = useEditorStore((state) => state.theme);
  return useMemo(
    () =>
      form.publishedSchema !== null &&
      (title !== form.publishedTitle ||
        !isSameFormSchema(schema, form.publishedSchema) ||
        (form.publishedTheme !== null && !isSameTheme(theme, form.publishedTheme))),
    [title, schema, theme, form.publishedSchema, form.publishedTitle, form.publishedTheme],
  );
}
