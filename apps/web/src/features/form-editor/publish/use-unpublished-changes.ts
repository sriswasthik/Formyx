import { isSameFormSchema, type FormDetail } from '@formyx/shared';
import { useMemo } from 'react';
import { useEditorStore } from '../editor-store-context';

/** Whether the draft or title differ from what respondents currently see. */
export function useHasUnpublishedChanges(form: FormDetail): boolean {
  const title = useEditorStore((state) => state.title);
  const schema = useEditorStore((state) => state.schema);
  return useMemo(
    () =>
      form.publishedSchema !== null &&
      (title !== form.publishedTitle || !isSameFormSchema(schema, form.publishedSchema)),
    [title, schema, form.publishedSchema, form.publishedTitle],
  );
}
